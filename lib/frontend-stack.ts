import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import { EnvironmentConfig, envName, envExport } from './environment';

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
const VERSION = packageJson.version;

export interface FrontendStackProps extends cdk.StackProps {
  envConfig: EnvironmentConfig;
  /**
   * PR preview モード用: ImageProcessorApiStack の参照に使う EnvironmentConfig。
   * 省略時は envConfig を使用（通常 dev/staging/production）。
   * PR preview では `-Dev` (共有バックエンド) を指す config を渡す想定。
   */
  importEnvConfig?: EnvironmentConfig;
  /**
   * Basic 認証を CloudFront Function で適用する場合に指定。
   * PR preview 等の限定公開用途を想定し、credentials はインラインで CF Function に
   * 埋め込まれる（CF Function は size 10KB 上限の sync JS）。
   */
  basicAuth?: { user: string; pass: string };
}

export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly frontendBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);
    const envConfig = props.envConfig;
    const importConfig = props.importEnvConfig ?? envConfig;

    // --- S3バケット ---
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- クロススタック参照 ---
    // PR preview モード時は共有 dev backend を参照するため importConfig を使う
    const resourcesBucketName = cdk.Fn.importValue(envExport('ImageProcessorResourcesBucketName', importConfig));
    const resourcesBucketArn = cdk.Fn.importValue(envExport('ImageProcessorResourcesBucketArn', importConfig));

    // リソースバケットの参照（generated-images/videos配信用）
    const resourcesBucket = s3.Bucket.fromBucketAttributes(this, 'ResourcesBucket', {
      bucketName: resourcesBucketName,
      bucketArn: resourcesBucketArn,
    });

    // --- CloudFront OAI ---
    const frontendOAI = new cloudfront.OriginAccessIdentity(this, 'FrontendOAI');
    this.frontendBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [this.frontendBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(frontendOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
    }));

    // リソースバケット用OAI: ApiStack側で作成・権限付与済み、IDをimportして使用
    const resourcesOAIId = cdk.Fn.importValue(envExport('FrontendResourcesOAIId', importConfig));
    const resourcesOAI = cloudfront.OriginAccessIdentity.fromOriginAccessIdentityId(
      this, 'ResourcesOAI', resourcesOAIId
    );

    // --- Basic Auth CloudFront Function (PR preview 用) ---
    // CF Function は viewer-request 時に同期実行される軽量 JS。Basic Auth ヘッダ未一致時は
    // 401 を即返す。credentials はインライン埋め込み（PR preview の限定公開用途のため
    // 高度な秘匿化は不要）。本番 distribution には付与しない。
    let viewerRequestFn: cloudfront.Function | undefined;
    if (props.basicAuth) {
      const credsB64 = Buffer.from(`${props.basicAuth.user}:${props.basicAuth.pass}`).toString('base64');
      const fnCode = `function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var expected = 'Basic ${credsB64}';
  if (!headers.authorization || headers.authorization.value !== expected) {
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: { 'www-authenticate': { value: 'Basic realm="PR Preview"' } },
    };
  }
  return request;
}`;
      viewerRequestFn = new cloudfront.Function(this, 'PreviewBasicAuthFunction', {
        functionName: envName('frontend-preview-basicauth', envConfig),
        code: cloudfront.FunctionCode.fromInline(fnCode),
      });
    }
    const fnAssociations = viewerRequestFn ? [{
      function: viewerRequestFn,
      eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
    }] : undefined;

    // --- ResponseHeadersPolicy ---
    // index.html / config用: no-cache
    const noCachePolicy = new cloudfront.ResponseHeadersPolicy(this, 'NoCacheHeaders', {
      responseHeadersPolicyName: envName('frontend-no-cache', envConfig),
      corsBehavior: {
        accessControlAllowOrigins: ['*'],
        accessControlAllowHeaders: ['*'],
        accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
        accessControlAllowCredentials: false,
        originOverride: true,
      },
      customHeadersBehavior: {
        customHeaders: [{
          header: 'Cache-Control',
          value: 'no-cache, must-revalidate',
          override: true,
        }],
      },
    });

    // --- CloudFront CachePolicy ---
    // 全パス最大60秒キャッシュ（デプロイ後60秒以内に最新版に切り替わる）
    const shortCachePolicy = new cloudfront.CachePolicy(this, 'ShortCachePolicy', {
      cachePolicyName: envName('frontend-short-cache', envConfig),
      defaultTtl: cdk.Duration.seconds(60),
      maxTtl: cdk.Duration.seconds(60),
      minTtl: cdk.Duration.seconds(0),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // --- CloudFront Distribution ---
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(this.frontendBucket, { originAccessIdentity: frontendOAI }),
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: shortCachePolicy,
        responseHeadersPolicy: noCachePolicy,
        functionAssociations: fnAssociations,
      },
      additionalBehaviors: {
        // アセット（JS/CSS）→ 60秒キャッシュ
        'assets/*': {
          origin: new origins.S3Origin(this.frontendBucket, { originAccessIdentity: frontendOAI }),
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: shortCachePolicy,
          responseHeadersPolicy: noCachePolicy,
          functionAssociations: fnAssociations,
        },
        // 合成画像（リソースバケット）
        'generated-images/*': {
          origin: new origins.S3Origin(resourcesBucket, { originAccessIdentity: resourcesOAI }),
          compress: false,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: shortCachePolicy,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
          functionAssociations: fnAssociations,
        },
        // 動画（リソースバケット）
        'generated-videos/*': {
          origin: new origins.S3Origin(resourcesBucket, { originAccessIdentity: resourcesOAI }),
          compress: false,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'VideoCachePolicy', {
            cachePolicyName: envName('frontend-video-cache', envConfig),
            defaultTtl: cdk.Duration.seconds(0),
            maxTtl: cdk.Duration.seconds(60),
            minTtl: cdk.Duration.seconds(0),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Range'),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          }),
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
          functionAssociations: fnAssociations,
        },
      },
      // SPA: 404/403 → index.html
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      comment: `Image Compositor Frontend - v${VERSION}`,
    });

    // --- BucketDeployment ---
    // config.jsonはdeploy.shがバックエンドデプロイ後にfrontend/dist/に生成してからFrontendStackをデプロイ。
    // BucketDeploymentがfrontend/dist/ごとS3にアップロードするのでconfig.jsonも含まれる。
    const distDir = path.join(__dirname, '../frontend/dist');
    if (fs.existsSync(distDir)) {
      new s3deploy.BucketDeployment(this, 'DeployFrontend', {
        sources: [
          s3deploy.Source.asset(distDir),
          s3deploy.Source.jsonData('.deploy-meta.json', { deployedAt: new Date().toISOString(), version: VERSION }),
        ],
        destinationBucket: this.frontendBucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
        prune: true,
        memoryLimit: 512,
        logRetention: logs.RetentionDays.ONE_WEEK,
      });
      console.log('Frontend deployment configured successfully.');
    }

    // --- Outputs ---
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Frontend URL',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain',
      exportName: envExport('FrontendDistributionDomain', envConfig),
    });
  }
}
