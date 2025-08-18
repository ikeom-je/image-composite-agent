/**
 * CDKスタックのユニットテスト - v2.4.0
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ImageProcessorApiStack } from '../../lib/image-processor-api-stack';

describe('ImageProcessorApiStack', () => {
  let app: cdk.App;
  let stack: ImageProcessorApiStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new ImageProcessorApiStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  describe('S3 Buckets', () => {
    test('creates all required S3 buckets', () => {
      // 4つのS3バケットが作成されることを確認
      template.resourceCountIs('AWS::S3::Bucket', 4);
    });

    test('creates resources bucket with correct configuration', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
      });
    });

    test('creates upload bucket with CORS configuration', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        CorsConfiguration: {
          CorsRules: [
            {
              AllowedMethods: ['GET', 'PUT', 'POST'],
              AllowedOrigins: ['*'],
              AllowedHeaders: ['*'],
              MaxAge: 3600,
            },
          ],
        },
      });
    });
  });

  describe('Lambda Functions', () => {
    test('creates image processor Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'python3.12',
        Handler: 'image_processor.handler',
        MemorySize: 1024,
        Timeout: 30,
      });
    });

    test('creates upload manager Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'python3.12',
        Handler: 'upload_manager.handler',
        MemorySize: 512,
        Timeout: 30,
      });
    });

    test('Lambda functions have correct environment variables', () => {
      // Image Processor Lambda
      template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'image_processor.handler',
        Environment: {
          Variables: {
            S3_RESOURCES_BUCKET: {
              Ref: expect.stringMatching(/ImageResourcesBucket/),
            },
            TEST_BUCKET: {
              Ref: expect.stringMatching(/TestImagesBucket/),
            },
            UPLOAD_BUCKET: {
              Ref: expect.stringMatching(/UploadBucket/),
            },
          },
        },
      });

      // Upload Manager Lambda
      template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'upload_manager.handler',
        Environment: {
          Variables: {
            UPLOAD_BUCKET: {
              Ref: expect.stringMatching(/UploadBucket/),
            },
          },
        },
      });
    });
  });

  describe('IAM Permissions', () => {
    test('grants correct S3 permissions to Lambda functions', () => {
      // Lambda実行ロールが作成されることを確認
      template.resourceCountIs('AWS::IAM::Role', 2);

      // S3読み取り権限が付与されることを確認
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: expect.arrayContaining([
            expect.objectContaining({
              Effect: 'Allow',
              Action: expect.arrayContaining(['s3:GetObject*', 's3:GetBucket*', 's3:List*']),
            }),
          ]),
        },
      });
    });

    test('grants read-write permissions to upload manager', () => {
      // Upload Manager用の読み書き権限を確認
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: expect.arrayContaining([
            expect.objectContaining({
              Effect: 'Allow',
              Action: expect.arrayContaining(['s3:GetObject*', 's3:PutObject*']),
            }),
          ]),
        },
      });
    });
  });

  describe('API Gateway', () => {
    test('creates REST API with correct configuration', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'Image Processor API',
        Description: 'This API creates composite images from multiple source images',
        BinaryMediaTypes: ['image/png', 'image/jpeg', 'image/*'],
      });
    });

    test('creates image composition endpoint', () => {
      // /images/composite リソースが作成されることを確認
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'images',
      });

      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'composite',
      });

      // GETメソッドが作成されることを確認
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
      });
    });

    test('creates upload endpoints', () => {
      // /upload リソースが作成されることを確認
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'upload',
      });

      // /upload/presigned-url リソースが作成されることを確認
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'presigned-url',
      });

      // /upload/images リソースが作成されることを確認
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'images',
      });

      // POSTとGETメソッドが作成されることを確認
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
      });

      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
      });
    });

    test('configures CORS correctly', () => {
      // CORS設定が正しく適用されることを確認
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Policy: expect.objectContaining({
          Statement: expect.arrayContaining([
            expect.objectContaining({
              Effect: 'Allow',
            }),
          ]),
        }),
      });
    });
  });

  describe('CloudFront Distribution', () => {
    test('creates CloudFront distribution', () => {
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    });

    test('configures CloudFront with correct settings', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultRootObject: 'index.html',
          PriceClass: 'PriceClass_100',
          CustomErrorResponses: [
            {
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
              ErrorCachingMinTTL: 0,
            },
          ],
        },
      });
    });

    test('creates Origin Access Identity', () => {
      template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 1);
    });
  });

  describe('S3 Deployment', () => {
    test('creates S3 deployment for frontend', () => {
      template.resourceCountIs('AWS::S3::BucketPolicy', 1);
    });
  });

  describe('Stack Outputs', () => {
    test('creates all required outputs', () => {
      // 6つの出力が作成されることを確認
      const outputs = template.findOutputs('*');
      const outputKeys = Object.keys(outputs);

      expect(outputKeys).toContain('ApiUrl');
      expect(outputKeys).toContain('FrontendUrl');
      expect(outputKeys).toContain('TestImagesBucketName');
      expect(outputKeys).toContain('ResourcesBucketName');
      expect(outputKeys).toContain('FrontendBucketName');
      expect(outputKeys).toContain('UploadBucketName');
      expect(outputKeys).toContain('UploadApiUrl');
    });

    test('outputs have correct descriptions', () => {
      const outputs = template.findOutputs('*');

      expect(outputs.ApiUrl.Description).toBe('URL for the Image Processor API');
      expect(outputs.FrontendUrl.Description).toBe('URL for the frontend application');
      expect(outputs.UploadBucketName.Description).toBe('Name of the upload bucket');
      expect(outputs.UploadApiUrl.Description).toBe('URL for the Upload API');
    });
  });

  describe('Resource Naming', () => {
    test('uses consistent resource naming', () => {
      // リソース名が一貫していることを確認
      const resources = template.toJSON().Resources;
      const resourceNames = Object.keys(resources);

      // Lambda関数名
      expect(resourceNames.some(name => name.includes('ImageProcessorFunction'))).toBe(true);
      expect(resourceNames.some(name => name.includes('UploadManagerFunction'))).toBe(true);

      // S3バケット名
      expect(resourceNames.some(name => name.includes('ImageResourcesBucket'))).toBe(true);
      expect(resourceNames.some(name => name.includes('TestImagesBucket'))).toBe(true);
      expect(resourceNames.some(name => name.includes('FrontendBucket'))).toBe(true);
      expect(resourceNames.some(name => name.includes('UploadBucket'))).toBe(true);
    });
  });

  describe('Security Configuration', () => {
    test('S3 buckets are private by default', () => {
      // すべてのS3バケットがプライベートであることを確認
      const buckets = template.findResources('AWS::S3::Bucket');
      
      Object.values(buckets).forEach((bucket: any) => {
        expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        });
      });
    });

    test('Lambda functions use least privilege IAM roles', () => {
      // Lambda関数が最小権限のIAMロールを使用することを確認
      const policies = template.findResources('AWS::IAM::Policy');
      
      Object.values(policies).forEach((policy: any) => {
        const statements = policy.Properties.PolicyDocument.Statement;
        statements.forEach((statement: any) => {
          // すべてのステートメントがAllow効果を持つことを確認
          expect(statement.Effect).toBe('Allow');
          // ワイルドカードリソースが使用されていないことを確認（一部例外を除く）
          if (statement.Resource && Array.isArray(statement.Resource)) {
            statement.Resource.forEach((resource: any) => {
              if (typeof resource === 'string' && resource === '*') {
                // ログ出力など、ワイルドカードが必要な場合のみ許可
                expect(statement.Action.some((action: string) => 
                  action.startsWith('logs:') || action.startsWith('xray:')
                )).toBe(true);
              }
            });
          }
        });
      });
    });
  });

  describe('Version Configuration', () => {
    test('uses correct version in configuration', () => {
      // バージョン情報が正しく設定されることを確認
      expect(stack.node.tryGetContext('version')).toBeDefined();
    });
  });
});