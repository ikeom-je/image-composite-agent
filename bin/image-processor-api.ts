#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ImageProcessorApiStack } from '../lib/image-processor-api-stack';

const app = new cdk.App();

new ImageProcessorApiStack(app, 'ImageProcessorApiStack', {
  description: 'Advanced Image Composition REST API with Alpha Channel Support',
  
  // 環境設定（defaultプロファイルを使用）
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },

  // タグの設定
  tags: {
    Project: 'ImageProcessorAPI',
    Version: 'v2',
    Environment: 'Production'
  }
});
