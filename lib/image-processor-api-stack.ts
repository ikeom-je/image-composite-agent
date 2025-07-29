import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import { Construct } from 'constructs';

export class ImageProcessorApiStack extends cdk.Stack {
  public readonly resourcesBucket: s3.Bucket;
  public readonly testImagesBucket: s3.Bucket;
  public readonly apiEndpoint: string;

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

    // Python Lambda関数の作成（シンプルなバンドリング）
    const imageProcessorFunction = new lambda.Function(this, 'ImageProcessorFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.X86_64,
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

    // APIエンドポイントを保存
    this.apiEndpoint = `${api.url}images/composite`;

    // 出力値の設定
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiEndpoint,
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
  }
}
