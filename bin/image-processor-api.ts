#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ImageProcessorApiStack } from '../lib/image-processor-api-stack';
import { ImageCompositeViewerStack } from '../lib/image-composite-viewer-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { resolveEnvironment, EnvironmentConfig } from '../lib/environment';

const app = new cdk.App();

// AWS環境設定（defaultプロファイルを使用）
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// PR preview モード（issue #87）:
//   -c previewPr=<num> を渡すと、共有 dev backend を参照する単独 frontend stack
//   `FrontendStack-Dev-Pr<num>` のみを作成する。バックエンドは作成しない。
//   認証は dev/main と同じく無し（CloudFront URL の難読性に依存）。
const previewPr = app.node.tryGetContext('previewPr') as string | undefined;

if (previewPr) {
  if (!/^\d+$/.test(previewPr)) {
    throw new Error(`previewPr は数値のみ。received: ${previewPr}`);
  }

  // PR preview stack 用の envConfig (-Dev-Pr<num> サフィックス)
  const previewSuffix = `-Dev-Pr${previewPr}`;
  const previewResourceSuffix = `-dev-pr${previewPr}`;
  const previewEnvConfig: EnvironmentConfig = {
    name: 'dev',
    suffix: previewSuffix,
    resourceSuffix: previewResourceSuffix,
    isProduction: false,
  };
  // 参照先（共有 dev backend）の envConfig
  const sharedDevConfig: EnvironmentConfig = {
    name: 'dev',
    suffix: '-Dev',
    resourceSuffix: '-dev',
    isProduction: false,
  };

  new FrontendStack(app, `FrontendStack${previewSuffix}`, {
    description: `PR #${previewPr} Preview Frontend (shared dev backend)`,
    env,
    tags: {
      Project: 'ImageProcessorAPI',
      Version: 'v2',
      Environment: 'dev',
      PreviewPR: previewPr,
    },
    envConfig: previewEnvConfig,
    importEnvConfig: sharedDevConfig,
  });
} else {
  // 通常モード: backend + frontend を envConfig.suffix で作成
  const envConfig = resolveEnvironment(app);
  const tags = {
    Project: 'ImageProcessorAPI',
    Version: 'v2',
    Environment: envConfig.name,
  };

  const apiStack = new ImageProcessorApiStack(app, `ImageProcessorApiStack${envConfig.suffix}`, {
    description: 'Advanced Image Composition REST API with Alpha Channel Support',
    env,
    tags,
    envConfig,
  });

  const viewerStack = new ImageCompositeViewerStack(app, `ImageCompositeViewerStack${envConfig.suffix}`, {
    description: 'Frontend Viewer for Image Composition REST API',
    env,
    tags,
    apiEndpoint: apiStack.apiEndpoint,
    uploadApiEndpoint: apiStack.uploadApiEndpoint,
    envConfig,
  });
  viewerStack.addDependency(apiStack);

  const frontendStack = new FrontendStack(app, `FrontendStack${envConfig.suffix}`, {
    description: 'Frontend for Image Compositor (independent deploy)',
    env,
    tags,
    envConfig,
  });
  frontendStack.addDependency(apiStack);
}
