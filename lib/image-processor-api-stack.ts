import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';

// package.jsonからバージョンを読み込み
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const VERSION = packageJson.version;

export class ImageProcessorApiStack extends cdk.Stack {
  public readonly resourcesBucket: s3.Bucket;
  public readonly testImagesBucket: s3.Bucket;
  public readonly frontendBucket: s3.Bucket;
  public readonly uploadBucket: s3.Bucket;  // 新規追加: アップロード用バケット
  public readonly distribution: cloudfront.Distribution;
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

    // S3バケットの作成（フロントエンド用）
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // S3バケットの作成（アップロード用） - v2.4.1新機能
    this.uploadBucket = new s3.Bucket(this, 'UploadBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // デッドレターキューの作成（Image Processor用）
    const imageProcessorDLQ = new sqs.Queue(this, 'ImageProcessorDLQ', {
      queueName: 'image-processor-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // CloudWatch Log Group（Image Processor用）
    const imageProcessorLogGroup = new logs.LogGroup(this, 'ImageProcessorLogGroup', {
      logGroupName: '/aws/lambda/image-processor-function',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ffmpeg Lambda Layer（動画生成機能用） - v2.6.0
    const ffmpegLayer = new lambda.LayerVersion(this, 'FfmpegLayer', {
      layerVersionName: `ffmpeg-layer-v${VERSION.replace(/\./g, '-')}`,
      description: `ffmpeg binaries for video generation - v${VERSION}`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-layers/ffmpeg-layer.zip')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      compatibleArchitectures: [lambda.Architecture.X86_64],
    });

    // Python Lambda関数の作成（最適化設定） - v2.6.0
    const imageProcessorFunction = new lambda.Function(this, 'ImageProcessorFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.X86_64,  // ライブラリ互換性重視
      handler: 'image_processor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/python'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c', [
              'echo "Starting bundling process with optimized package management..."',
              'pip install --upgrade pip',
              'pip install -r requirements.txt -t /asset-output --no-cache-dir --platform manylinux2014_x86_64 --only-binary=:all:',
              'cp *.py /asset-output/',
              'if [ -d images ]; then cp -r images /asset-output/; fi',
              'echo "Optimizing bundle size..."',
              'find /asset-output -name "*.pyc" -delete',
              'find /asset-output -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true',
              'find /asset-output -name "*.dist-info" -type d -exec rm -rf {} + 2>/dev/null || true',
              'echo "Bundling completed successfully"'
            ].join(' && ')
          ],
          user: 'root'
        },
      }),
      layers: [ffmpegLayer],  // ffmpeg Layerを追加
      memorySize: 2048,  // 動画生成のためメモリサイズを増加
      timeout: cdk.Duration.seconds(90),  // 動画生成のためタイムアウトを延長
      reservedConcurrentExecutions: 10,  // 動画生成の負荷を考慮して同時実行数を調整
      deadLetterQueue: imageProcessorDLQ,
      retryAttempts: 2,
      logGroup: imageProcessorLogGroup,
      environment: {
        S3_RESOURCES_BUCKET: this.resourcesBucket.bucketName,
        TEST_BUCKET: this.testImagesBucket.bucketName,
        UPLOAD_BUCKET: this.uploadBucket.bucketName,
        VERSION: VERSION,
        LOG_LEVEL: 'INFO',
        PYTHONPATH: '/var/runtime',
        PATH: '/opt/bin:/usr/local/bin:/usr/bin:/bin'  // ffmpegバイナリのパスを追加
      },
      description: `Image composition processor with video generation support - v${VERSION}`
    });

    // S3バケットへの読み取り権限を付与
    this.resourcesBucket.grantRead(imageProcessorFunction);
    this.testImagesBucket.grantRead(imageProcessorFunction);
    this.uploadBucket.grantRead(imageProcessorFunction);  // 新規追加

    // リソースバケットへの書き込み権限を付与（動画ファイル保存用）
    this.resourcesBucket.grantWrite(imageProcessorFunction);

    // デッドレターキューの作成（Upload Manager用）
    const uploadManagerDLQ = new sqs.Queue(this, 'UploadManagerDLQ', {
      queueName: 'upload-manager-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // CloudWatch Log Group（Upload Manager用）
    const uploadManagerLogGroup = new logs.LogGroup(this, 'UploadManagerLogGroup', {
      logGroupName: '/aws/lambda/upload-manager-function',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Upload Manager Lambda関数の作成（最適化設定） - v2.4.1新機能
    const uploadManagerFunction = new lambda.Function(this, 'UploadManagerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.X86_64,
      handler: 'upload_manager.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/python'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c', [
              'echo "Starting Upload Manager bundling process..."',
              'pip install --upgrade pip',
              'pip install -r requirements.txt -t /asset-output --no-cache-dir --platform manylinux2014_x86_64 --only-binary=:all:',
              'cp *.py /asset-output/',
              'if [ -d images ]; then cp -r images /asset-output/; fi',
              'echo "Optimizing bundle size..."',
              'find /asset-output -name "*.pyc" -delete',
              'find /asset-output -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true',
              'find /asset-output -name "*.dist-info" -type d -exec rm -rf {} + 2>/dev/null || true',
              'echo "Upload Manager bundling completed successfully"'
            ].join(' && ')
          ],
          user: 'root'
        },
      }),
      memorySize: 768,  // アップロード管理に最適化されたメモリサイズ
      timeout: cdk.Duration.seconds(45),  // 大きなファイルのアップロードに対応
      reservedConcurrentExecutions: 10,  // 同時実行数を増加（パフォーマンス最適化）
      deadLetterQueue: uploadManagerDLQ,
      retryAttempts: 2,
      logGroup: uploadManagerLogGroup,
      environment: {
        UPLOAD_BUCKET: this.uploadBucket.bucketName,
        VERSION: VERSION,
        LOG_LEVEL: 'INFO',
        PYTHONPATH: '/var/runtime'
      },
      description: `Upload manager for presigned URLs and image listing - v${VERSION}`
    });

    // Upload Manager Lambda関数にS3権限を付与
    this.uploadBucket.grantReadWrite(uploadManagerFunction);
    this.uploadBucket.grantPutAcl(uploadManagerFunction);

    // CloudWatchアラームの設定 - v2.4.1監視機能

    // Image Processor Lambda関数のエラーアラーム
    const imageProcessorErrorAlarm = new cloudwatch.Alarm(this, 'ImageProcessorErrorAlarm', {
      alarmName: 'image-processor-errors',
      alarmDescription: 'Image Processor Lambda function errors',
      metric: imageProcessorFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Statistic.SUM,
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Image Processor Lambda関数の実行時間アラーム
    const imageProcessorDurationAlarm = new cloudwatch.Alarm(this, 'ImageProcessorDurationAlarm', {
      alarmName: 'image-processor-duration',
      alarmDescription: 'Image Processor Lambda function duration',
      metric: imageProcessorFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Statistic.AVERAGE,
      }),
      threshold: 50000,  // 50秒（タイムアウトの83%）
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Upload Manager Lambda関数のエラーアラーム
    const uploadManagerErrorAlarm = new cloudwatch.Alarm(this, 'UploadManagerErrorAlarm', {
      alarmName: 'upload-manager-errors',
      alarmDescription: 'Upload Manager Lambda function errors',
      metric: uploadManagerFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Statistic.SUM,
      }),
      threshold: 3,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });



    // API Gatewayの作成（バイナリレスポンス最適化） - v2.4.1
    const api = new apigateway.RestApi(this, 'ImageProcessorApi', {
      restApiName: `Image Processor API v${VERSION}`,
      description: `High-performance image composition API with binary response support - v${VERSION}`,
      // バイナリメディアタイプを明示的に設定（PNG形式の直接レスポンス対応）
      binaryMediaTypes: [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/webp',
        'image/tiff',
        'image/bmp',
        'image/*',
        'video/mp4',
        'video/webm',
        'video/x-msvideo',
        'video/*',
        'application/octet-stream'
      ],
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
          'X-Requested-With',
          'Accept',
          'Accept-Encoding',
          'Cache-Control'
        ],
        maxAge: cdk.Duration.hours(1),
      },
      // API Gateway レベルでのエラーハンドリング
      defaultMethodOptions: {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
              'method.response.header.Access-Control-Allow-Headers': true,
              'method.response.header.Access-Control-Allow-Methods': true,
            },
          },
          {
            statusCode: '400',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            statusCode: '500',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      },
      // API Gateway のスロットリング設定
      deployOptions: {
        stageName: 'prod',
        // CloudWatch Logsロール設定が必要なため一時的に無効化
        // loggingLevel: apigateway.MethodLoggingLevel.INFO,
        // dataTraceEnabled: true,
        metricsEnabled: true,
      },
    });

    // APIリソースの作成
    const images = api.root.addResource('images', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const composite = images.addResource('composite', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Lambda統合の設定（エラーハンドリング強化）
    const lambdaIntegration = new apigateway.LambdaIntegration(imageProcessorFunction, {
      proxy: true,
      integrationResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization'",
            'method.response.header.Access-Control-Allow-Methods': "'GET,OPTIONS'",
          },
        },
        {
          statusCode: '400',
          selectionPattern: '.*"statusCode": 400.*',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
          },
          responseTemplates: {
            'application/json': JSON.stringify({
              error: 'Bad Request',
              message: 'Invalid request parameters',
              version: VERSION
            }),
          },
        },
        {
          statusCode: '500',
          selectionPattern: '.*"statusCode": 500.*',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
          },
          responseTemplates: {
            'application/json': JSON.stringify({
              error: 'Internal Server Error',
              message: 'An error occurred while processing your request',
              version: VERSION
            }),
          },
        },
      ],
    });

    // GETメソッドの追加（認証なし、エラーレスポンス対応）
    composite.addMethod('GET', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // アップロード関連のAPIリソース - v2.4.1新機能
    const upload = api.root.addResource('upload', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Upload Manager Lambda統合の設定（エラーハンドリング強化）
    const uploadLambdaIntegration = new apigateway.LambdaIntegration(uploadManagerFunction, {
      proxy: true,
      integrationResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization'",
            'method.response.header.Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
          },
        },
        {
          statusCode: '400',
          selectionPattern: '.*"statusCode": 400.*',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
          },
          responseTemplates: {
            'application/json': JSON.stringify({
              error: 'Bad Request',
              message: 'Invalid upload parameters',
              version: VERSION
            }),
          },
        },
        {
          statusCode: '500',
          selectionPattern: '.*"statusCode": 500.*',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'",
          },
          responseTemplates: {
            'application/json': JSON.stringify({
              error: 'Internal Server Error',
              message: 'Upload service temporarily unavailable',
              version: VERSION
            }),
          },
        },
      ],
    });

    // 署名付きURL生成エンドポイント
    const presignedUrl = upload.addResource('presigned-url', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    presignedUrl.addMethod('POST', uploadLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // 画像一覧取得エンドポイント
    const imagesList = upload.addResource('images', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    imagesList.addMethod('GET', uploadLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // APIエンドポイントを保存
    this.apiEndpoint = `${api.url}images/composite`;

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

    // リソースバケット用のOrigin Access Identity
    const resourcesOAI = new cloudfront.OriginAccessIdentity(this, 'ResourcesOAI', {
      comment: 'OAI for resources bucket (videos)',
    });

    // CloudFrontディストリビューション（キャッシュ機能強化） - v2.6.0
    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(this.frontendBucket, {
          originAccessIdentity,
        }),
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: new cloudfront.CachePolicy(this, 'DefaultCachePolicy', {
          cachePolicyName: 'image-processor-default-cache',
          comment: 'Default cache policy for Image Processor frontend',
          defaultTtl: cdk.Duration.seconds(5),
          maxTtl: cdk.Duration.days(365),
          minTtl: cdk.Duration.seconds(0),
          cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          headerBehavior: cloudfront.CacheHeaderBehavior.allowList('CloudFront-Viewer-Country'),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
      },
      additionalBehaviors: {
        // HTMLファイル用の短期キャッシュ（開発時の更新反映を早くするため）
        '*.html': {
          origin: new origins.S3Origin(this.frontendBucket, {
            originAccessIdentity,
          }),
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'HTMLCachePolicy', {
            cachePolicyName: 'image-processor-html-cache',
            comment: 'Short-term cache for HTML files',
            defaultTtl: cdk.Duration.seconds(5),
            maxTtl: cdk.Duration.minutes(5),
            minTtl: cdk.Duration.seconds(0),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }),
        },
        // 静的アセット（JS/CSS）用の長期キャッシュ
        '*.js': {
          origin: new origins.S3Origin(this.frontendBucket, {
            originAccessIdentity,
          }),
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
            cachePolicyName: 'image-processor-static-assets',
            comment: 'Short-term cache for static assets during development',
            defaultTtl: cdk.Duration.seconds(5),
            maxTtl: cdk.Duration.hours(1),
            minTtl: cdk.Duration.seconds(0),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }),
        },
        '*.css': {
          origin: new origins.S3Origin(this.frontendBucket, {
            originAccessIdentity,
          }),
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'CSSCachePolicy', {
            cachePolicyName: 'image-processor-css-cache',
            comment: 'Short-term cache for CSS files during development',
            defaultTtl: cdk.Duration.seconds(5),
            maxTtl: cdk.Duration.hours(1),
            minTtl: cdk.Duration.seconds(0),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }),
        },
        // 画像ファイル用のキャッシュ
        '*.png': {
          origin: new origins.S3Origin(this.frontendBucket, {
            originAccessIdentity,
          }),
          compress: false, // 画像は既に圧縮済み
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
            cachePolicyName: 'image-processor-images-cache',
            comment: 'Cache policy for image files',
            defaultTtl: cdk.Duration.days(7),
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.hours(1),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          }),
        },
        // 動画ファイル用のキャッシュ（リソースバケットから配信）
        'generated-videos/*': {
          origin: new origins.S3Origin(this.resourcesBucket, {
            originAccessIdentity: resourcesOAI,
          }),
          compress: false, // 動画は既に圧縮済み
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'VideoCachePolicy', {
            cachePolicyName: 'image-processor-video-cache',
            comment: 'Cache policy for video files',
            defaultTtl: cdk.Duration.hours(24),
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.hours(1),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Range'),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          }),
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
        },
      },
      // SPAのルーティングをサポートするためのエラーレスポンス設定
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // コスト最適化
      comment: `Image Processor Frontend Distribution with optimized caching - v${VERSION}`,
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // ログ設定（オプション）
      enableLogging: false, // 本番環境では有効化を検討
      // webAclId: undefined, // WAF設定（必要に応じて）
      // 地理的制限なし
      // geoRestriction: cloudfront.GeoRestriction.allowlist() // 全世界許可
    });

    // リソースバケットにCloudFrontからのアクセス権限を付与
    this.resourcesBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.resourcesBucket.arnForObjects('*')],
        principals: [new iam.CanonicalUserPrincipal(resourcesOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
      })
    );

    // Lambda関数の環境変数にCloudFrontドメインを追加
    imageProcessorFunction.addEnvironment('CLOUDFRONT_DOMAIN', this.distribution.distributionDomainName);

    // API Gateway使用量プランとAPIキーの設定
    const usagePlan = api.addUsagePlan('ImageProcessorUsagePlan', {
      name: 'Image Processor API Usage Plan',
      description: `Usage plan for Image Processor API - v${VERSION}`,
      throttle: {
        rateLimit: 100,  // 1秒あたり100リクエスト
        burstLimit: 200  // バースト時200リクエスト
      },
      quota: {
        limit: 10000,  // 1日あたり10,000リクエスト
        period: apigateway.Period.DAY
      }
    });

    // APIキーの作成
    const apiKey = api.addApiKey('ImageProcessorApiKey', {
      apiKeyName: 'image-processor-api-key',
      description: `API Key for Image Processor API - v${VERSION}`
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: api.deploymentStage
    });

    // API Gateway メトリクスアラーム - v2.4.1監視機能
    const apiGatewayErrorAlarm = new cloudwatch.Alarm(this, 'ApiGatewayErrorAlarm', {
      alarmName: 'api-gateway-4xx-errors',
      alarmDescription: 'API Gateway 4XX errors',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: 'prod',
        },
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Statistic.SUM,
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const apiGatewayLatencyAlarm = new cloudwatch.Alarm(this, 'ApiGatewayLatencyAlarm', {
      alarmName: 'api-gateway-latency',
      alarmDescription: 'API Gateway latency',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: 'prod',
        },
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Statistic.AVERAGE,
      }),
      threshold: 5000, // 5秒
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // CloudWatchダッシュボードの作成 - v2.4.1監視機能
    const dashboard = new cloudwatch.Dashboard(this, 'ImageProcessorDashboard', {
      dashboardName: `image-processor-api-v${VERSION.replace(/\./g, '-')}`,
      widgets: [
        [
          // API Gateway メトリクス
          new cloudwatch.GraphWidget({
            title: 'API Gateway Requests',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: 'Count',
                dimensionsMap: {
                  ApiName: api.restApiName,
                  Stage: 'prod',
                },
                period: cdk.Duration.minutes(5),
                statistic: cloudwatch.Statistic.SUM,
                label: 'Total Requests',
              }),
            ],
            width: 6,
            height: 6,
          }),
          new cloudwatch.GraphWidget({
            title: 'API Gateway Errors',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: '4XXError',
                dimensionsMap: {
                  ApiName: api.restApiName,
                  Stage: 'prod',
                },
                period: cdk.Duration.minutes(5),
                statistic: cloudwatch.Statistic.SUM,
                label: '4XX Errors',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: '5XXError',
                dimensionsMap: {
                  ApiName: api.restApiName,
                  Stage: 'prod',
                },
                period: cdk.Duration.minutes(5),
                statistic: cloudwatch.Statistic.SUM,
                label: '5XX Errors',
              }),
            ],
            width: 6,
            height: 6,
          }),
        ],
        [
          // Lambda関数のメトリクス
          new cloudwatch.GraphWidget({
            title: 'Lambda Function Invocations',
            left: [
              imageProcessorFunction.metricInvocations({
                label: 'Image Processor Invocations',
                period: cdk.Duration.minutes(5),
              }),
              uploadManagerFunction.metricInvocations({
                label: 'Upload Manager Invocations',
                period: cdk.Duration.minutes(5),
              }),
            ],
            width: 12,
            height: 6,
          }),
        ],
        [
          // Lambda関数のエラー率
          new cloudwatch.GraphWidget({
            title: 'Lambda Function Errors',
            left: [
              imageProcessorFunction.metricErrors({
                label: 'Image Processor Errors',
                period: cdk.Duration.minutes(5),
              }),
              uploadManagerFunction.metricErrors({
                label: 'Upload Manager Errors',
                period: cdk.Duration.minutes(5),
              }),
            ],
            width: 6,
            height: 6,
          }),
          // Lambda関数の実行時間
          new cloudwatch.GraphWidget({
            title: 'Lambda Function Duration',
            left: [
              imageProcessorFunction.metricDuration({
                label: 'Image Processor Duration',
                period: cdk.Duration.minutes(5),
              }),
              uploadManagerFunction.metricDuration({
                label: 'Upload Manager Duration',
                period: cdk.Duration.minutes(5),
              }),
            ],
            width: 6,
            height: 6,
          }),
        ],
        [
          // API Gateway レイテンシ
          new cloudwatch.GraphWidget({
            title: 'API Gateway Latency',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: 'Latency',
                dimensionsMap: {
                  ApiName: api.restApiName,
                  Stage: 'prod',
                },
                period: cdk.Duration.minutes(5),
                statistic: cloudwatch.Statistic.AVERAGE,
                label: 'Average Latency',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/ApiGateway',
                metricName: 'IntegrationLatency',
                dimensionsMap: {
                  ApiName: api.restApiName,
                  Stage: 'prod',
                },
                period: cdk.Duration.minutes(5),
                statistic: cloudwatch.Statistic.AVERAGE,
                label: 'Integration Latency',
              }),
            ],
            width: 6,
            height: 6,
          }),
          // Lambda関数の同時実行数
          new cloudwatch.GraphWidget({
            title: 'Lambda Function Concurrent Executions',
            left: [
              imageProcessorFunction.metricInvocations({
                label: 'Image Processor Invocations',
                period: cdk.Duration.minutes(5),
              }),
              uploadManagerFunction.metricInvocations({
                label: 'Upload Manager Invocations',
                period: cdk.Duration.minutes(5),
              }),
            ],
            width: 6,
            height: 6,
          }),
        ],
        [
          // CloudFront メトリクス
          new cloudwatch.GraphWidget({
            title: 'CloudFront Requests',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/CloudFront',
                metricName: 'Requests',
                dimensionsMap: {
                  DistributionId: this.distribution.distributionId,
                },
                period: cdk.Duration.minutes(5),
                statistic: cloudwatch.Statistic.SUM,
                label: 'Total Requests',
              }),
            ],
            width: 6,
            height: 6,
          }),
          new cloudwatch.GraphWidget({
            title: 'CloudFront Cache Hit Rate',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/CloudFront',
                metricName: 'CacheHitRate',
                dimensionsMap: {
                  DistributionId: this.distribution.distributionId,
                },
                period: cdk.Duration.minutes(5),
                statistic: cloudwatch.Statistic.AVERAGE,
                label: 'Cache Hit Rate',
              }),
            ],
            width: 6,
            height: 6,
          }),
        ],
      ],
    });

    // 環境固有の設定を取得
    const environment = this.node.tryGetContext('environment') || 'production';
    const enableDebugMode = this.node.tryGetContext('enableDebugMode') === 'true';
    const customDomain = this.node.tryGetContext('customDomain');
    const enableAnalytics = this.node.tryGetContext('enableAnalytics') !== 'false'; // デフォルトで有効

    // 設定ファイルの内容を動的生成（環境固有設定対応） - v2.4.1
    const configContent = {
      // 基本API設定
      apiUrl: this.apiEndpoint,
      uploadApiUrl: `${api.url}upload`,
      cloudfrontUrl: customDomain ? `https://${customDomain}` : `https://${this.distribution.distributionDomainName}`,

      // S3バケット設定
      s3BucketNames: {
        resources: this.resourcesBucket.bucketName,
        testImages: this.testImagesBucket.bucketName,
        frontend: this.frontendBucket.bucketName,
        upload: this.uploadBucket.bucketName,
      },

      // バージョンと環境情報
      version: VERSION,
      environment: environment,
      buildTimestamp: new Date().toISOString(),
      region: this.region,

      // 機能フラグ
      features: {
        enableS3Upload: true,
        enableAdvancedFilters: this.node.tryGetContext('enableAdvancedFilters') === 'true',
        enable3ImageComposition: true,
        enableDebugMode: enableDebugMode,
        enableAnalytics: enableAnalytics,
        enableCaching: environment === 'production',
        enableErrorReporting: environment === 'production',
      },

      // API設定
      api: {
        keyId: apiKey.keyId,
        throttling: {
          rateLimit: environment === 'production' ? 100 : 50,
          burstLimit: environment === 'production' ? 200 : 100,
          dailyQuota: environment === 'production' ? 10000 : 1000,
        },
        timeout: 30000, // 30秒
        retryAttempts: 3,
      },

      // UI設定
      ui: {
        theme: this.node.tryGetContext('uiTheme') || 'light',
        language: this.node.tryGetContext('uiLanguage') || 'ja',
        showAdvancedOptions: enableDebugMode,
        maxImageSize: 10 * 1024 * 1024, // 10MB
        supportedFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      },

      // 監視・ログ設定
      monitoring: {
        enableCloudWatchLogs: environment === 'production',
        logLevel: enableDebugMode ? 'debug' : 'info',
        enablePerformanceMetrics: true,
        enableErrorTracking: environment === 'production',
      },

      // セキュリティ設定
      security: {
        enableCSP: environment === 'production',
        enableSRI: environment === 'production',
        corsOrigins: environment === 'production' ? [customDomain || this.distribution.distributionDomainName] : ['*'],
      },

      // 開発者向け設定
      development: {
        enableHotReload: environment === 'development',
        enableSourceMaps: enableDebugMode,
        enableConsoleLogging: enableDebugMode,
        mockApiResponses: environment === 'development' && this.node.tryGetContext('mockApi') === 'true',
      }
    };

    // 環境別設定ファイルの生成
    const developmentConfig = {
      ...configContent,
      environment: 'development',
      features: {
        ...configContent.features,
        enableDebugMode: true,
        enableCaching: false,
        enableErrorReporting: false,
      },
      api: {
        ...configContent.api,
        throttling: {
          rateLimit: 50,
          burstLimit: 100,
          dailyQuota: 1000,
        },
      },
      development: {
        ...configContent.development,
        enableHotReload: true,
        enableSourceMaps: true,
        enableConsoleLogging: true,
      }
    };

    const stagingConfig = {
      ...configContent,
      environment: 'staging',
      features: {
        ...configContent.features,
        enableDebugMode: true,
        enableCaching: true,
        enableErrorReporting: true,
      },
      api: {
        ...configContent.api,
        throttling: {
          rateLimit: 75,
          burstLimit: 150,
          dailyQuota: 5000,
        },
      }
    };

    // フロントエンドと設定ファイルを同時にデプロイ（環境別設定対応）
    // 注意: frontend/distディレクトリが存在する場合のみ有効
    if (fs.existsSync(path.join(__dirname, '../frontend/dist'))) {
      new s3deploy.BucketDeployment(this, 'DeployFrontendWithConfig', {
        sources: [
          s3deploy.Source.asset(path.join(__dirname, '../frontend/dist')),
          s3deploy.Source.jsonData('config.json', configContent), // メイン設定
          s3deploy.Source.jsonData('config.development.json', developmentConfig), // 開発環境設定
          s3deploy.Source.jsonData('config.staging.json', stagingConfig), // ステージング環境設定
          s3deploy.Source.jsonData('config.production.json', configContent), // 本番環境設定（メインと同じ）
        ],
        destinationBucket: this.frontendBucket,
        distribution: this.distribution,
        distributionPaths: ['/*', '/index.html', '/config*.json'], // 設定ファイルのキャッシュ無効化
        retainOnDelete: false,
        // メモリ最適化
        memoryLimit: 512,
        // ログ保持期間
        logRetention: logs.RetentionDays.ONE_WEEK,
      });
    } else {
      // 設定ファイルのみをデプロイ
      new s3deploy.BucketDeployment(this, 'DeployConfigOnly', {
        sources: [
          s3deploy.Source.jsonData('config.json', configContent), // メイン設定
          s3deploy.Source.jsonData('config.development.json', developmentConfig), // 開発環境設定
          s3deploy.Source.jsonData('config.staging.json', stagingConfig), // ステージング環境設定
          s3deploy.Source.jsonData('config.production.json', configContent), // 本番環境設定（メインと同じ）
        ],
        destinationBucket: this.frontendBucket,
        distribution: this.distribution,
        distributionPaths: ['/config*.json'], // 設定ファイルのキャッシュ無効化
        retainOnDelete: false,
        // メモリ最適化
        memoryLimit: 512,
        // ログ保持期間
        logRetention: logs.RetentionDays.ONE_WEEK,
      });
    }

    // 出力値の設定
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiEndpoint,
      description: 'URL for the Image Processor API'
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'URL for the frontend application'
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID for cache invalidation'
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name'
    });

    new cdk.CfnOutput(this, 'TestImagesBucketName', {
      value: this.testImagesBucket.bucketName,
      description: 'Name of the test images bucket'
    });

    new cdk.CfnOutput(this, 'ResourcesBucketName', {
      value: this.resourcesBucket.bucketName,
      description: 'Name of the resources bucket'
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'Name of the frontend bucket'
    });

    new cdk.CfnOutput(this, 'UploadBucketName', {
      value: this.uploadBucket.bucketName,
      description: 'Name of the upload bucket'
    });

    new cdk.CfnOutput(this, 'UploadApiUrl', {
      value: `${api.url}upload`,
      description: 'URL for the Upload API'
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'URL for the CloudWatch Dashboard'
    });
  }
}
