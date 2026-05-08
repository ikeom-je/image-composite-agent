import * as cdk from 'aws-cdk-lib';

/**
 * 環境設定ユーティリティ
 * CDK context または環境変数から環境を解決し、リソース名・エクスポート名にサフィックスを付与する。
 * Production環境はサフィックスなし（後方互換維持）。
 */

export type EnvironmentName = 'dev' | 'staging' | 'production';

export interface EnvironmentConfig {
  /** 環境名 (dev|staging|production) */
  name: EnvironmentName;
  /** PascalCaseサフィックス — スタックID・エクスポート名用 (e.g., '-Dev', '-Staging', '') */
  suffix: string;
  /** lowercaseサフィックス — 物理リソース名用 (e.g., '-dev', '-staging', '') */
  resourceSuffix: string;
  /** Production環境かどうか */
  isProduction: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * CDK AppからEnvironmentConfigを解決する。
 * 優先順位: -c environment > ENVIRONMENT env var > デフォルト 'dev'
 */
export function resolveEnvironment(app: cdk.App): EnvironmentConfig {
  const envContext = app.node.tryGetContext('environment') as string | undefined;
  const envVar = process.env.ENVIRONMENT;
  const raw = (envContext || envVar || 'dev').toLowerCase();

  if (!['dev', 'staging', 'production'].includes(raw)) {
    throw new Error(`Invalid environment: ${raw}. Must be dev|staging|production`);
  }
  const name = raw as EnvironmentName;

  // Optional devId for worktree isolation (dev only)
  const devId = app.node.tryGetContext('devId') as string | undefined;
  if (devId && name !== 'dev') {
    throw new Error('devId is only valid for dev environment');
  }

  const devIdSuffix = devId ? `-${capitalize(devId)}` : '';
  const devIdResourceSuffix = devId ? `-${devId.toLowerCase()}` : '';

  return {
    name,
    suffix: name === 'production' ? '' : `-${capitalize(name)}${devIdSuffix}`,
    resourceSuffix: name === 'production' ? '' : `-${name}${devIdResourceSuffix}`,
    isProduction: name === 'production',
  };
}

/**
 * 物理リソース名に環境サフィックスを付与する。Production時はno-op。
 */
export function envName(baseName: string, config: EnvironmentConfig): string {
  return `${baseName}${config.resourceSuffix}`;
}

/**
 * CloudFormationエクスポート名に環境サフィックスを付与する。Production時はno-op。
 */
export function envExport(baseName: string, config: EnvironmentConfig): string {
  return `${baseName}${config.suffix}`;
}
