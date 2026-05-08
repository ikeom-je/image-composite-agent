# Image Compositor - 開発ガイド

## 作業開始前のチェック（必読・全エージェント共通）

**新しいタスク・Issue対応・PR作成に着手する前に、毎回必ず本セクションを再確認する。** 本プロジェクトは複数のAIエージェント・開発者が並行作業することを想定しており、各自が同じルールに従うことで仕様・規約・運用方針の一貫性を保つ。

1. **本ファイル（CLAUDE.md）を冒頭から再参照** — 仕様駆動開発ルール / 変更時の更新トリガー / 環境戦略 / 重要な設計原則
2. **対象機能の仕様書を確認** — `.kiro/specs/<feature>/{requirements.md, design.md, tasks.md}`
   - `<feature>` は `image-composition` または `strands-agent`
3. **タスクに該当する steering ファイルを確認**:
   - 新機能・アーキ変更 → [steering/architecture.md](.kiro/steering/architecture.md), [steering/structure.md](.kiro/steering/structure.md)
   - 技術スタック・依存・環境変数 → [steering/tech.md](.kiro/steering/tech.md)
   - テスト追加・テスト変更 → [steering/testing.md](.kiro/steering/testing.md)
   - PR作成・コミット・ブランチ操作 → [steering/git.md](.kiro/steering/git.md)（**ドキュメント更新チェックリスト**を含む）
   - デプロイ操作・ワークフロー → [steering/workflow.md](.kiro/steering/workflow.md)
   - コード規約 → [steering/conventions.md](.kiro/steering/conventions.md)
4. **並行作業時は git worktree を使用** — 現ブランチを汚さず複数Issueを並行対応する場合、[steering/git.md の「Git Worktree」](.kiro/steering/git.md#git-worktree) に従って `.worktrees/<branch-name>/` を作成
5. **PR作成時は `.github/pull_request_template.md` のチェックリストを完了** — ドキュメント更新確認10項目 + tasks.md チェックボックス更新

> 仕様駆動開発（Kiro/QDev）の根幹: **仕様 → 設計 → 実装 → ドキュメント整合**。途中でルール確認を省略すると、複数エージェント間でドリフトが発生する。

---

## 仕様駆動開発ルール

このプロジェクトはKiro/QDevによる仕様駆動開発を採用しています。**実装は必ず仕様に基づいて行ってください。**

1. **実装前に仕様確認**: 着手前に`tasks.md`の該当タスクと`requirements.md`の関連要件を確認する
2. **受入基準の遵守**: `requirements.md`のAcceptance Criteriaをテストケースとして実装に反映する
3. **タスク進捗更新**: 実装完了時に`tasks.md`のチェックボックスを`[x]`に更新する
4. **設計準拠**: コンポーネント構造・データモデル・API設計は`design.md`に従う
5. **要件トレーサビリティ**: 各タスクの `_要件: X.X_` を参照し、対応する要件が満たされていることを確認する

### 変更時のドキュメント更新トリガー

実装変更を加えたら、変更種別に応じて以下のドキュメントを必ず同時更新する。詳細チェックリストは [.kiro/steering/git.md](.kiro/steering/git.md#ドキュメント更新チェックリスト機能追加変更時) を参照。

> 表中の `<feature>` は仕様書ディレクトリ名（`image-composition` または `strands-agent`）。

| 変更したもの | 必ず更新するドキュメント |
|-----------|-------------------|
| 新APIパラメータ | `specs/<feature>/requirements.md`（AC追加）+ `specs/<feature>/design.md`（パラメータ表）+ `steering/architecture.md`（エンドポイント表） |
| 新Lambdaエンドポイント | `steering/architecture.md`（エンドポイント表）+ `specs/<feature>/requirements.md`（Req追加）+ `specs/<feature>/design.md`（API設計） |
| 新環境変数 | `steering/tech.md`（環境変数一覧）+ 該当する `specs/<feature>/design.md` |
| 新Lambda関数 | `steering/architecture.md` + `steering/structure.md`（依存関係図）+ `specs/<feature>/design.md` |
| デプロイ手順 | `steering/workflow.md` + 本ファイルのデプロイセクション |
| 新テストコマンド | `steering/testing.md` + `package.json` |
| 依存パッケージ | `steering/tech.md`（バージョン制約も） |
| CI/CDワークフロー | `steering/testing.md`（GitHub Actions節）+ `steering/workflow.md`（CI/CDパイプライン節） |
| バージョン更新 | `package.json` + `steering/product.md` のみ（他ファイルにバージョン直書き禁止） |
| モジュール間依存 | `steering/structure.md`（Lambda依存関係図） |

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

単一AWSアカウント内で3環境（dev / staging / production）をスタック名サフィックスで分離。
開発フロー: `feature/* → dev(staging) → main(production)`

詳細（環境分離方式・設定差異・スタック名）は [.kiro/steering/architecture.md](.kiro/steering/architecture.md) の「環境戦略」を参照。

## 重要な設計原則

1. **後方互換性**: 既存の2画像合成APIパラメータ名を維持
2. **アルファチャンネル完全対応**: 透過情報を保持してRGBAモードで処理
3. **テキストオーバーレイ**: 最大3テキストレイヤー、Z-order=画像→テキスト、text_params省略時は既存動作
4. **環境非依存**: 動的設定管理（config.json）によるURL自動設定
5. **セキュリティ**: IAM最小権限、CORS適切設定、入力バリデーション
6. **Bedrock IAM認証**: APIキー不要、IAMロールベース認証

## テスト

テストコマンド・テストピラミッド・デプロイ後検証フローは [.kiro/steering/testing.md](.kiro/steering/testing.md) を参照。

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
