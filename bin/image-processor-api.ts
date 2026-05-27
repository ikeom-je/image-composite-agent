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
//   -c previewPr=<num> を渡すと、`ImageProcessorApiStack-Dev-Pr<num>` +
//   `FrontendStack-Dev-Pr<num>` の両スタックを per-PR で作成する。
//   frontend は自身の per-PR backend を参照する（共有 dev backend は使わない）。
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
  const previewTags = {
    Project: 'ImageProcessorAPI',
    Version: 'v2',
    Environment: 'dev',
    PreviewPR: previewPr,
  };

  // backend (per-PR)
  const previewApiStack = new ImageProcessorApiStack(app, `ImageProcessorApiStack${previewSuffix}`, {
    description: `PR #${previewPr} Preview Backend`,
    env,
    tags: previewTags,
    envConfig: previewEnvConfig,
  });

  // frontend (per-PR) — 自身の per-PR backend を参照（importEnvConfig 省略で envConfig 自身を使う）
  const previewFrontendStack = new FrontendStack(app, `FrontendStack${previewSuffix}`, {
    description: `PR #${previewPr} Preview Frontend`,
    env,
    tags: previewTags,
    envConfig: previewEnvConfig,
  });
  previewFrontendStack.addDependency(previewApiStack);
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
