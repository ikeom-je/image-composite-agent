# Image Compositor - 開発ガイド

## 仕様駆動開発ルール

このプロジェクトはKiro/QDevによる仕様駆動開発を採用しています。**実装は必ず仕様に基づいて行ってください。**

1. **実装前に仕様確認**: 着手前に`tasks.md`の該当タスクと`requirements.md`の関連要件を確認する
2. **受入基準の遵守**: `requirements.md`のAcceptance Criteriaをテストケースとして実装に反映する
3. **タスク進捗更新**: 実装完了時に`tasks.md`のチェックボックスを`[x]`に更新する
4. **設計準拠**: コンポーネント構造・データモデル・API設計は`design.md`に従う
5. **要件トレーサビリティ**: 各タスクの `_要件: X.X_` を参照し、対応する要件が満たされていることを確認する

## 仕様書

| ファイル | 内容 |
|---------|------|
| [.kiro/specs/image-composition/requirements.md](.kiro/specs/image-composition/requirements.md) | 画像合成要件定義（受入基準付き） |
| [.kiro/specs/image-composition/design.md](.kiro/specs/image-composition/design.md) | 画像合成統合設計書 |
| [.kiro/specs/image-composition/tasks.md](.kiro/specs/image-composition/tasks.md) | 画像合成実装タスク一覧 |
| [.kiro/specs/strands-agent/requirements.md](.kiro/specs/strands-agent/requirements.md) | チャットエージェント要件定義 |
| [.kiro/specs/strands-agent/design.md](.kiro/specs/strands-agent/design.md) | チャットエージェント設計書 |
| [.kiro/specs/strands-agent/tasks.md](.kiro/specs/strands-agent/tasks.md) | チャットエージェント実装タスク一覧 |
| [.kiro/specs/strands-agent/usecases.md](.kiro/specs/strands-agent/usecases.md) | チャットエージェントユースケース |
| [.kiro/specs/custom-rules-prompt/requirements.md](.kiro/specs/custom-rules-prompt/requirements.md) | カスタムルールプロンプト要件定義（issue #8/#9） |
| [.kiro/specs/custom-rules-prompt/design.md](.kiro/specs/custom-rules-prompt/design.md) | カスタムルールプロンプト設計書 |
| [.kiro/specs/custom-rules-prompt/tasks.md](.kiro/specs/custom-rules-prompt/tasks.md) | カスタムルールプロンプト実装タスク + 作業フロー別チェックリスト |

## 開発ルール（詳細は各ファイル参照）

| ファイル | 内容 |
|---------|------|
| [.kiro/steering/product.md](.kiro/steering/product.md) | プロダクト概要・目的 |
| [.kiro/steering/architecture.md](.kiro/steering/architecture.md) | アーキテクチャ・Lambda/API Gateway設計 |
| [.kiro/steering/tech.md](.kiro/steering/tech.md) | 技術スタック・バージョン・コマンド一覧 |
| [.kiro/steering/structure.md](.kiro/steering/structure.md) | プロジェクト構成・ディレクトリ構造 |
| [.kiro/steering/conventions.md](.kiro/steering/conventions.md) | コード規約（Python・TypeScript・Vue） |
| [.kiro/steering/testing.md](.kiro/steering/testing.md) | テスト方針・コマンド・CI/CD |
| [.kiro/steering/git.md](.kiro/steering/git.md) | Gitルール・ブランチ戦略・PRガイドライン |
| [.kiro/steering/workflow.md](.kiro/steering/workflow.md) | 開発ワークフロー・デプロイ手順 |

## 環境戦略

単一AWSアカウント内で3環境を運用。スタック名サフィックスで分離。

| 環境 | ブランチ | デプロイ | スタック名例 |
|------|---------|---------|------------|
| dev | feature/*, bugfix/* | 手動 | `ImageProcessorApiStack-Dev` |
| staging | dev | CI/CD自動 | `ImageProcessorApiStack-Staging` |
| production | main | CI/CD自動 | `ImageProcessorApiStack` |

開発フロー: `feature/* → dev(staging) → main(production)`

## 重要な設計原則

1. **後方互換性**: 既存の2画像合成APIパラメータ名を維持
2. **アルファチャンネル完全対応**: 透過情報を保持してRGBAモードで処理
3. **テキストオーバーレイ**: 最大3テキストレイヤー、Z-order=画像→テキスト、text_params省略時は既存動作
4. **環境非依存**: 動的設定管理（config.json）によるURL自動設定
5. **セキュリティ**: IAM最小権限、CORS適切設定、入力バリデーション
6. **Bedrock IAM認証**: APIキー不要、IAMロールベース認証

## テスト

```bash
# Lambda単体テスト
PYTHONPATH=lambda/python python3 -m unittest discover -s test/lambda

# APIテスト（デプロイ済み環境）
API_URL=<url> npm run test:api

# フロントエンドE2E
FRONTEND_URL=<url> npm run test:all-e2e

# Chat Agent APIテスト
CHAT_API_URL=<url> npx playwright test --config=test/playwright-api.config.ts --grep "Chat Agent"
```

## コミット

- **日本語**でコミットメッセージを記述
- 機能単位でコミット
- 形式: `<type>(<scope>): <内容>`（例: `feat(api): baseOpacity追加`）

## デプロイ

```bash
source .env.local  # 環境変数読み込み

# dev環境（手動）
ENVIRONMENT=dev ./scripts/deploy.sh

# staging / production はCICD自動（devブランチ→staging、mainブランチ→production）
```
