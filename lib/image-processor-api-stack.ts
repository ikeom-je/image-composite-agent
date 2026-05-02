import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';
import { EnvironmentConfig, envName, envExport } from './environment';

// package.jsonからバージョンを読み込み
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const VERSION = packageJson.version;

export interface ImageProcessorApiStackProps extends cdk.StackProps {
  envConfig: EnvironmentConfig;
}

export class ImageProcessorApiStack extends cdk.Stack {
  public readonly resourcesBucket: s3.Bucket;
  public readonly testImagesBucket: s3.Bucket;
  public readonly uploadBucket: s3.Bucket;
  public readonly apiEndpoint: string;
  public readonly uploadApiEndpoint: string;
  public readonly chatApiEndpoint: string;

  constructor(scope: Construct, id: string, props: ImageProcessorApiStackProps) {
    super(scope, id, props);

    const envConfig = props.envConfig;

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
      queueName: envName('image-processor-dlq', envConfig),
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // CloudWatch Log Group（Image Processor用）
    const imageProcessorLogGroup = new logs.LogGroup(this, 'ImageProcessorLogGroup', {
      logGroupName: envName('/aws/lambda/image-processor-function', envConfig),
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ffmpeg Lambda Layer（動画生成機能用） - v2.6.0
    const ffmpegLayer = new lambda.LayerVersion(this, 'FfmpegLayer', {
      layerVersionName: envName(`ffmpeg-layer-v${VERSION.replace(/\./g, '-')}`, envConfig),
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
              'if [ -d fonts ]; then cp -r fonts /asset-output/; fi',
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
      queueName: envName('upload-manager-dlq', envConfig),
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // CloudWatch Log Group（Upload Manager用）
    const uploadManagerLogGroup = new logs.LogGroup(this, 'UploadManagerLogGroup', {
      logGroupName: envName('/aws/lambda/upload-manager-function', envConfig),
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
              'if [ -d fonts ]; then cp -r fonts /asset-output/; fi',
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
      alarmName: envName('image-processor-errors', envConfig),
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
      alarmName: envName('image-processor-duration', envConfig),
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
      alarmName: envName('upload-manager-errors', envConfig),
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
        stageName: envConfig.isProduction ? 'prod' : envConfig.name,
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
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const composite = images.addResource('composite', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
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

    // GETメソッドの追加（後方互換性のため維持）
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

    // POSTメソッドの追加（フロントエンドからの合成リクエスト用）
    composite.addMethod('POST', lambdaIntegration, {
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
        allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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
            'method.response.header.Access-Control-Allow-Methods': "'GET,POST,DELETE,OPTIONS'",
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
        allowMethods: ['GET', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    imagesList.addMethod('DELETE', uploadLambdaIntegration, {
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

    // ========================================
    // Strands Agent チャットエージェント - v2.9.0
    // ========================================

    // DynamoDB テーブル（会話履歴）
    const chatHistoryTable = new dynamodb.Table(this, 'ChatHistoryTable', {
      tableName: envName('ImageCompositor-ChatHistory', envConfig),
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Agent Lambda用 DLQ
    const agentDLQ = new sqs.Queue(this, 'AgentDLQ', {
      queueName: envName('agent-handler-dlq', envConfig),
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Agent Lambda用 Log Group
    const agentLogGroup = new logs.LogGroup(this, 'AgentLogGroup', {
      logGroupName: envName('/aws/lambda/agent-handler-function', envConfig),
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Agent Lambda関数（ffmpegレイヤー不要 - 動画生成は既存Lambdaに委譲）
    const agentFunction = new lambda.Function(this, 'AgentFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: 'agent_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/python'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c', [
              'echo "Starting Agent Lambda bundling..."',
              'pip install --upgrade pip',
              // Agent専用依存のみインストール（opentelemetry-sdk含む、strands-agentsが依存）
              'pip install strands-agents anthropic pillow boto3 opentelemetry-sdk opentelemetry-api opentelemetry-exporter-otlp-proto-http -t /asset-output --no-cache-dir 2>&1 | tail -5',
              'cp *.py /asset-output/',
              'if [ -d images ]; then cp -r images /asset-output/; fi',
              'if [ -d fonts ]; then cp -r fonts /asset-output/; fi',
              'echo "Optimizing bundle size..."',
              'find /asset-output -name "*.pyc" -delete',
              'find /asset-output -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true',
              // .dist-info はentry_pointsメタデータに必要なため保持（opentelemetry等）
              // テスト関連・不要パッケージの削除でサイズ削減
              'rm -rf /asset-output/tests /asset-output/test 2>/dev/null || true',
              // OpenTelemetry context の entry_points 解決失敗をパッチ（保険）
              // _load_runtime_context() が entry_points を解決できない場合に ContextVarsRuntimeContext を直接返す
              `python3 -c "
import pathlib
p = pathlib.Path('/asset-output/opentelemetry/context/__init__.py')
if p.exists():
    code = p.read_text()
    if 'PATCHED' not in code:
        # _load_runtime_context 関数全体を安全な実装に置き換え
        old = 'def _load_runtime_context()'
        if old in code:
            idx = code.index(old)
            # 関数の終了位置を検出（次のモジュールレベル定義まで）
            rest = code[idx:]
            lines = rest.split('\\n')
            end_idx = 0
            for i, line in enumerate(lines[1:], 1):
                if line and not line.startswith(' ') and not line.startswith('\\t') and not line.startswith('#') and line.strip():
                    end_idx = i
                    break
            if end_idx == 0:
                end_idx = len(lines)
            new_func = '''def _load_runtime_context():  # PATCHED
    from opentelemetry.context.contextvars_context import ContextVarsRuntimeContext
    return ContextVarsRuntimeContext()
'''
            patched = code[:idx] + new_func + '\\n'.join(lines[end_idx:])
            p.write_text(patched)
            print('Patched opentelemetry context __init__.py')
        else:
            print('Could not find _load_runtime_context, skipping')
    else:
        print('Already patched')
else:
    print('opentelemetry context not found')
"`,
              'echo "Agent Lambda bundling completed"'
            ].join(' && ')
          ],
          user: 'root'
        },
      }),
      memorySize: 2048,
      timeout: cdk.Duration.seconds(90),
      reservedConcurrentExecutions: 5,
      deadLetterQueue: agentDLQ,
      retryAttempts: 0,
      logGroup: agentLogGroup,
      environment: {
        CHAT_HISTORY_TABLE: chatHistoryTable.tableName,
        AGENT_MODEL_ID: process.env.AGENTMODEL || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        BEDROCK_REGION: process.env.BEDROCK_REGION || 'us-east-1',
        S3_RESOURCES_BUCKET: this.resourcesBucket.bucketName,
        S3_UPLOAD_BUCKET: this.uploadBucket.bucketName,
        UPLOAD_BUCKET: this.uploadBucket.bucketName,
        TEST_BUCKET: this.testImagesBucket.bucketName,
        VERSION: VERSION,
        LOG_LEVEL: 'INFO',
        PYTHONPATH: '/var/runtime',
        PATH: '/opt/bin:/usr/local/bin:/usr/bin:/bin',
      },
      description: `Strands Agent chat handler with Bedrock Claude - v${VERSION}`,
    });

    // Agent Lambda IAM権限
    chatHistoryTable.grantReadWriteData(agentFunction);
    // Bedrock InvokeModel 権限
    // Bedrock Marketplace: モデル自動サブスクリプションに必要（初回呼び出し時に自動有効化）
    agentFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'aws-marketplace:ViewSubscriptions',
        'aws-marketplace:Subscribe',
        'aws-marketplace:Unsubscribe',
      ],
      resources: ['*'],
    }));
    // Bedrock US Cross-Region Inference: 推論プロファイルへのアクセス（マルチモデル対応）
    const inferenceProfiles = [
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      'us.amazon.nova-2-lite-v1:0',
      'us.amazon.nova-micro-v1:0',
    ];
    agentFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: inferenceProfiles.map(
        profile => `arn:aws:bedrock:us-east-1:${this.account}:inference-profile/${profile}`
      ),
    }));
    // Bedrock US Cross-Region Inference: 基盤モデルへのアクセス（推論プロファイル経由）
    const foundationModels = [
      'anthropic.claude-sonnet-4-5-20250929-v1:0',
      'anthropic.claude-haiku-4-5-20251001-v1:0',
      'amazon.nova-2-lite-v1:0',
      'amazon.nova-micro-v1:0',
    ];
    const bedrockRegions = ['us-east-1', 'us-east-2', 'us-west-2'];
    agentFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: foundationModels.flatMap(model =>
        bedrockRegions.map(region => `arn:aws:bedrock:${region}::foundation-model/${model}`)
      ),
      conditions: {
        StringLike: {
          'bedrock:InferenceProfileArn': inferenceProfiles.map(
            profile => `arn:aws:bedrock:us-east-1:${this.account}:inference-profile/${profile}`
          ),
        },
      },
    }));
    this.resourcesBucket.grantReadWrite(agentFunction);
    this.uploadBucket.grantRead(agentFunction);
    this.testImagesBucket.grantRead(agentFunction);

    // Agent Lambda の S3 削除権限（アセット管理用）
    this.uploadBucket.grantDelete(agentFunction);

    // API Gateway - Agent エンドポイント
    const agentLambdaIntegration = new apigateway.LambdaIntegration(agentFunction, {
      proxy: true,
    });

    const chatResource = api.root.addResource('chat', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // POST /chat
    chatResource.addMethod('POST', agentLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
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

    // GET /chat/models
    const chatModelsResource = chatResource.addResource('models', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    chatModelsResource.addMethod('GET', agentLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // /chat/history/{sessionId}
    const chatHistoryResource = chatResource.addResource('history');
    const chatSessionResource = chatHistoryResource.addResource('{sessionId}', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    chatSessionResource.addMethod('GET', agentLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    chatSessionResource.addMethod('DELETE', agentLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
          },
        },
      ],
    });

    // APIエンドポイントを保存
    this.apiEndpoint = `${api.url}images/composite`;
    this.uploadApiEndpoint = `${api.url}upload`;
    this.chatApiEndpoint = `${api.url}chat`;

    // CloudFront Origin Access Identity (OAI) の作成
    // Lambda関数の環境変数（CLOUDFRONT_DOMAINはdeploy.shでFrontendStackデプロイ後に設定）
    agentFunction.addEnvironment('IMAGE_PROCESSOR_FUNCTION', imageProcessorFunction.functionName);
    imageProcessorFunction.grantInvoke(agentFunction);

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
      apiKeyName: envName('image-processor-api-key', envConfig),
      description: `API Key for Image Processor API - v${VERSION}`
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: api.deploymentStage
    });

    // API Gateway メトリクスアラーム - v2.4.1監視機能
    const apiGatewayErrorAlarm = new cloudwatch.Alarm(this, 'ApiGatewayErrorAlarm', {
      alarmName: envName('api-gateway-4xx-errors', envConfig),
      alarmDescription: 'API Gateway 4XX errors',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: envConfig.isProduction ? 'prod' : envConfig.name,
        },
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Statistic.SUM,
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const apiGatewayLatencyAlarm = new cloudwatch.Alarm(this, 'ApiGatewayLatencyAlarm', {
      alarmName: envName('api-gateway-latency', envConfig),
      alarmDescription: 'API Gateway latency',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: envConfig.isProduction ? 'prod' : envConfig.name,
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
      dashboardName: envName(`image-processor-api-v${VERSION.replace(/\./g, '-')}`, envConfig),
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
                  Stage: envConfig.isProduction ? 'prod' : envConfig.name,
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
                  Stage: envConfig.isProduction ? 'prod' : envConfig.name,
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
                  Stage: envConfig.isProduction ? 'prod' : envConfig.name,
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
                  Stage: envConfig.isProduction ? 'prod' : envConfig.name,
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
                  Stage: envConfig.isProduction ? 'prod' : envConfig.name,
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
      ],
    });

    // 出力値の設定
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiEndpoint,
      description: 'URL for the Image Processor API',
      exportName: envExport('ImageProcessorApiEndpoint', envConfig),
    });

    new cdk.CfnOutput(this, 'TestImagesBucketName', {
      value: this.testImagesBucket.bucketName,
      description: 'Name of the test images bucket'
    });

    // FrontendStack用: リソースバケットへのCloudFront OAI（FrontendStack側でimportして使用）
    const frontendResourcesOAI = new cloudfront.OriginAccessIdentity(this, 'FrontendResourcesOAI', {
      comment: 'OAI for FrontendStack to access resources bucket',
    });
    this.resourcesBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.resourcesBucket.arnForObjects('*')],
        principals: [new iam.CanonicalUserPrincipal(frontendResourcesOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
      })
    );

    new cdk.CfnOutput(this, 'FrontendResourcesOAIId', {
      value: frontendResourcesOAI.originAccessIdentityId,
      description: 'OAI ID for FrontendStack resources bucket access',
      exportName: envExport('FrontendResourcesOAIId', envConfig),
    });

    new cdk.CfnOutput(this, 'ResourcesBucketName', {
      value: this.resourcesBucket.bucketName,
      description: 'Name of the resources bucket',
      exportName: envExport('ImageProcessorResourcesBucketName', envConfig),
    });

    new cdk.CfnOutput(this, 'ResourcesBucketArn', {
      value: this.resourcesBucket.bucketArn,
      description: 'ARN of the resources bucket',
      exportName: envExport('ImageProcessorResourcesBucketArn', envConfig),
    });

    new cdk.CfnOutput(this, 'UploadBucketName', {
      value: this.uploadBucket.bucketName,
      description: 'Name of the upload bucket'
    });

    new cdk.CfnOutput(this, 'UploadApiUrl', {
      value: this.uploadApiEndpoint,
      description: 'URL for the Upload API',
      exportName: envExport('ImageProcessorUploadApiEndpoint', envConfig),
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'URL for the CloudWatch Dashboard'
    });

    new cdk.CfnOutput(this, 'ChatApiUrl', {
      value: this.chatApiEndpoint,
      description: 'URL for the Chat Agent API',
      exportName: envExport('ImageProcessorChatApiEndpoint', envConfig),
    });
  }
}
