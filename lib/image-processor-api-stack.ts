import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';
import { Construct } from 'constructs';
import { execSync } from 'child_process';
import * as fs from 'fs';

export class ImageProcessorApiStack extends cdk.Stack {
  public readonly resourcesBucket: s3.Bucket;
  public readonly testImagesBucket: s3.Bucket;
  public readonly frontendBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3バケットの作成（リソース用）
    this.resourcesBucket = new s3.Bucket(this, 'ImageResourcesBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // S3バケットの作成（テスト画像用）
    this.testImagesBucket = new s3.Bucket(this, 'TestImagesBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // S3バケットの作成（フロントエンド用 - プライベートアクセス）
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // すべてのパブリックアクセスをブロック
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront Origin Access Identity (OAI) の作成
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
      comment: 'Access to the frontend bucket',
    });

    // S3バケットポリシーの設定 - CloudFrontからのアクセスのみを許可
    this.frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.CanonicalUserPrincipal(
            originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
          ),
        ],
        resources: [this.frontendBucket.arnForObjects('*')],
      })
    );

    // CloudFrontディストリビューションの作成
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(this.frontendBucket, {
          originAccessIdentity,
        }),
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // SPAのルーティングをサポートするためのエラーレスポンス設定
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // 北米、欧州、アジアの一部のみ（コスト最適化）
    });

    // フロントエンドのビルドとデプロイ
    this.deployFrontend();

    // Python Lambda関数の作成（シンプルなバンドリング）
    const imageProcessorFunction = new lambda.Function(this, 'ImageProcessorFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: 'image_processor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/python'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c', [
              'pip install -r requirements.txt -t /asset-output',
              'cp *.py /asset-output/',
              'if [ -d images ]; then cp -r images /asset-output/; fi'
            ].join(' && ')
          ],
        },
      }),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        S3_RESOURCES_BUCKET: this.resourcesBucket.bucketName,
        TEST_BUCKET: this.testImagesBucket.bucketName
      }
    });

    // S3バケットへの読み取り権限を付与
    this.resourcesBucket.grantRead(imageProcessorFunction);
    this.testImagesBucket.grantRead(imageProcessorFunction);

    // API Gatewayの作成（バイナリメディアタイプ対応）
    const api = new apigateway.RestApi(this, 'ImageProcessorApi', {
      restApiName: 'Image Processor API',
      description: 'This API creates composite images from multiple source images',
      binaryMediaTypes: ['image/png', 'image/jpeg', 'image/*'],
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
      }
    });

    // APIリソースの作成
    const images = api.root.addResource('images');
    const composite = images.addResource('composite');
    
    // Lambda統合の設定
    const lambdaIntegration = new apigateway.LambdaIntegration(imageProcessorFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });

    // GETメソッドの追加
    composite.addMethod('GET', lambdaIntegration);

    // 出力値の設定
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `${api.url}images/composite`,
      description: 'URL for the Image Processor API'
    });

    new cdk.CfnOutput(this, 'TestImagesBucketName', {
      value: this.testImagesBucket.bucketName,
      description: 'Name of the test images bucket'
    });

    new cdk.CfnOutput(this, 'ResourcesBucketName', {
      value: this.resourcesBucket.bucketName,
      description: 'Name of the resources bucket'
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'URL for the frontend application (CloudFront)'
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'Name of the frontend bucket'
    });
  }

  private deployFrontend() {
    // フロントエンドのビルドディレクトリ
    const frontendBuildDir = path.join(__dirname, '../frontend/dist');
    const frontendDir = path.join(__dirname, '../frontend');

    try {
      // フロントエンドのビルド
      console.log('Building frontend application...');
      
      // package.jsonが存在するか確認
      if (!fs.existsSync(path.join(frontendDir, 'package.json'))) {
        console.log('Frontend package.json not found. Skipping frontend deployment.');
        return;
      }

      // node_modulesが存在するか確認し、なければnpm installを実行
      if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
        console.log('Installing frontend dependencies...');
        execSync('npm install', { cwd: frontendDir, stdio: 'inherit' });
      }

      // フロントエンドをビルド
      console.log('Building frontend...');
      execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
      
      // ビルドディレクトリが存在するか確認
      if (!fs.existsSync(frontendBuildDir)) {
        console.log('Frontend build directory not found. Skipping frontend deployment.');
        return;
      }

      // S3へのデプロイ（CloudFront配信用）
      new s3deploy.BucketDeployment(this, 'DeployFrontend', {
        sources: [s3deploy.Source.asset(frontendBuildDir)],
        destinationBucket: this.frontendBucket,
        distribution: this.distribution,
        distributionPaths: ['/*'], // CloudFrontキャッシュを無効化
        retainOnDelete: false,
      });

      console.log('Frontend deployment configured successfully.');
    } catch (error) {
      console.error('Error configuring frontend deployment:', error);
      console.log('Skipping frontend deployment due to errors.');
    }
  }
}
