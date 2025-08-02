import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';
import { Construct } from 'constructs';
import { execSync } from 'child_process';
import * as fs from 'fs';

export interface ImageCompositeViewerStackProps extends cdk.StackProps {
  /**
   * API Gateway エンドポイントのURL（オプション）
   * 指定されない場合、フロントエンドは環境変数から取得する
   */
  apiEndpoint?: string;
}

export class ImageCompositeViewerStack extends cdk.Stack {
  public readonly frontendBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: ImageCompositeViewerStackProps) {
    super(scope, id, props);

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
    this.deployFrontend(props?.apiEndpoint);

    // 出力値の設定
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'URL for the frontend application (CloudFront)'
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'Name of the frontend bucket'
    });
  }

  private deployFrontend(apiEndpoint?: string) {
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

      // APIエンドポイントが指定されている場合は.envファイルを更新
      if (apiEndpoint) {
        console.log(`Updating frontend environment with API endpoint: ${apiEndpoint}`);
        fs.writeFileSync(
          path.join(frontendDir, '.env'),
          `VUE_APP_API_URL=${apiEndpoint}\n`
        );
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
