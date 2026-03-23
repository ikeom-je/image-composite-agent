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

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
const VERSION = packageJson.version;

export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly frontendBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- S3バケット ---
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- クロススタック参照 ---
    const resourcesBucketName = cdk.Fn.importValue('ImageProcessorResourcesBucketName');
    const resourcesBucketArn = cdk.Fn.importValue('ImageProcessorResourcesBucketArn');

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

    const resourcesOAI = new cloudfront.OriginAccessIdentity(this, 'ResourcesOAI');
    resourcesBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [resourcesBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(resourcesOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
    }));

    // --- ResponseHeadersPolicy ---
    // index.html / config用: no-cache
    const noCachePolicy = new cloudfront.ResponseHeadersPolicy(this, 'NoCacheHeaders', {
      responseHeadersPolicyName: `frontend-no-cache-v${VERSION.replace(/\./g, '-')}`,
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

    // ハッシュ付きアセット用: immutable
    const immutableCachePolicy = new cloudfront.ResponseHeadersPolicy(this, 'ImmutableHeaders', {
      responseHeadersPolicyName: `frontend-immutable-v${VERSION.replace(/\./g, '-')}`,
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
          value: 'public, max-age=31536000, immutable',
          override: true,
        }],
      },
    });

    // --- CloudFront CachePolicy ---
    const shortCachePolicy = new cloudfront.CachePolicy(this, 'ShortCachePolicy', {
      cachePolicyName: `frontend-short-cache-v${VERSION.replace(/\./g, '-')}`,
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(60),
      minTtl: cdk.Duration.seconds(0),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const longCachePolicy = new cloudfront.CachePolicy(this, 'LongCachePolicy', {
      cachePolicyName: `frontend-long-cache-v${VERSION.replace(/\./g, '-')}`,
      defaultTtl: cdk.Duration.hours(24),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.hours(1),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
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
      },
      additionalBehaviors: {
        // ハッシュ付きアセット（JS/CSS）→ immutable長期キャッシュ
        'assets/*': {
          origin: new origins.S3Origin(this.frontendBucket, { originAccessIdentity: frontendOAI }),
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: longCachePolicy,
          responseHeadersPolicy: immutableCachePolicy,
        },
        // 合成画像（リソースバケット）
        'generated-images/*': {
          origin: new origins.S3Origin(resourcesBucket, { originAccessIdentity: resourcesOAI }),
          compress: false,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: longCachePolicy,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
        },
        // 動画（リソースバケット）
        'generated-videos/*': {
          origin: new origins.S3Origin(resourcesBucket, { originAccessIdentity: resourcesOAI }),
          compress: false,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'VideoCachePolicy', {
            cachePolicyName: `frontend-video-cache-v${VERSION.replace(/\./g, '-')}`,
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
    // config.jsonはdeploy.shで生成してfrontend/dist/に配置する（Fn::ImportValue制約回避）
    const distDir = path.join(__dirname, '../frontend/dist');
    if (fs.existsSync(distDir)) {
      new s3deploy.BucketDeployment(this, 'DeployFrontend', {
        sources: [
          s3deploy.Source.asset(distDir),
          // デプロイ毎にハッシュ変更を強制
          s3deploy.Source.jsonData('.deploy-meta.json', { deployedAt: new Date().toISOString(), version: VERSION }),
        ],
        destinationBucket: this.frontendBucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
        prune: false,
        memoryLimit: 512,
        logRetention: logs.RetentionDays.ONE_WEEK,
      });
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
      exportName: 'FrontendDistributionDomain',
    });
  }
}
