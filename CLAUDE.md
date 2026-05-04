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

## 開発ルール

| ファイル | 内容 |
|---------|------|
| [.kiro/steering/product.md](.kiro/steering/product.md) | プロダクト概要・目的 |
| [.kiro/steering/architecture.md](.kiro/steering/architecture.md) | アーキテクチャ・環境戦略・Lambda/API Gateway設計 |
| [.kiro/steering/tech.md](.kiro/steering/tech.md) | 技術スタック・バージョン・Lambda構成 |
| [.kiro/steering/structure.md](.kiro/steering/structure.md) | プロジェクト構成・ディレクトリ構造 |
| [.kiro/steering/conventions.md](.kiro/steering/conventions.md) | コード規約（フロントエンド・バックエンド） |
| [.kiro/steering/testing.md](.kiro/steering/testing.md) | テスト方針・コマンド・CI/CD |
| [.kiro/steering/git.md](.kiro/steering/git.md) | Gitルール・ブランチ戦略・コミット規約 |
| [.kiro/steering/workflow.md](.kiro/steering/workflow.md) | 開発ワークフロー・デプロイ手順 |

## 環境変数

デプロイ前に`.env.local`を読み込むこと（`source .env.local`）。設定項目は`.env.local.example`を参照。
