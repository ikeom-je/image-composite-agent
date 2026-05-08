#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ImageProcessorApiStack } from '../lib/image-processor-api-stack';
import { ImageCompositeViewerStack } from '../lib/image-composite-viewer-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { resolveEnvironment } from '../lib/environment';

const app = new cdk.App();

// 環境設定を解決（-c environment=dev|staging|production）
const envConfig = resolveEnvironment(app);

// AWS環境設定（defaultプロファイルを使用）
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// タグの設定
const tags = {
  Project: 'ImageProcessorAPI',
  Version: 'v2',
  Environment: envConfig.name,
};

// バックエンドスタックをデプロイ
const apiStack = new ImageProcessorApiStack(app, `ImageProcessorApiStack${envConfig.suffix}`, {
  description: 'Advanced Image Composition REST API with Alpha Channel Support',
  env,
  tags,
  envConfig,
});

// フロントエンドスタックをデプロイ（旧）
const viewerStack = new ImageCompositeViewerStack(app, `ImageCompositeViewerStack${envConfig.suffix}`, {
  description: 'Frontend Viewer for Image Composition REST API',
  env,
  tags,
  apiEndpoint: apiStack.apiEndpoint,
  uploadApiEndpoint: apiStack.uploadApiEndpoint,
  envConfig,
});

// スタック間の依存関係を設定（フロントエンドはバックエンドに依存）
viewerStack.addDependency(apiStack);

// 新フロントエンドスタック（独立デプロイ対応）
const frontendStack = new FrontendStack(app, `FrontendStack${envConfig.suffix}`, {
  description: 'Frontend for Image Compositor (independent deploy)',
  env,
  tags,
  envConfig,
});
frontendStack.addDependency(apiStack);
