# マルチクラウドAgent化構想 — AWS / GCP / Cloudflare 比較検証プラン

> Issue: [#106](https://github.com/ikeom-je/image-composite-agent/issues/106)
> 作成日: 2026-07-05
> ステータス: 構想（アーキテクチャ案）— 実装は別issueに分割する

## 1. 目的

現行のAWS実装（画像合成REST API + Strands Agents Chat Agent）を題材に、**GCP・Cloudflareへフルセット展開**し、3プラットフォームのAI Agent構築手法を比較検証する。

主目的は以下の3点であり、特定のビジネス制約（コスト削減・ベンダーロック回避）よりも検証・比較そのものに価値を置く。

1. **技術検証**: 各クラウドネイティブのAIサービス・Agent SDKでの実現方式の違いを実装を通じて把握する
2. **ポートフォリオ**: 同一仕様を3プラットフォームで実装した差分比較を成果物として示す
3. **差分比較**: コスト・レイテンシ・開発体験・エコシステム統合度を同一ワークロードで実測する

### 前提となるプロダクト特性（変えないもの）

- **決定論的レンダリング**（[steering/product.md](../../../.claude/steering/product.md) 参照）: 同一パラメータ→同一ピクセル出力。Agent層は自然言語→厳密パラメータへの**翻訳**に徹し、ピクセルを生成しない。この原則は3プラットフォームすべてで維持する
- 1920x1080キャンバス、最大3画像+3テキスト、アルファチャンネル完全対応、動画生成（ffmpeg）という既存API仕様

## 2. 比較の軸（4軸）

| # | 軸 | 見るポイント |
|---|---|------------|
| 1 | コンピュート | サーバーレス実行モデル、言語ランタイム制約、コールドスタート |
| 2 | AI / Agent | ネイティブLLM、function calling / Agent SDK、マルチエージェント対応 |
| 3 | 画像合成エンジン | Python+Pillow+ffmpegコンテナの動かし方と、プラットフォーム固有の最小化・最適化余地 |
| 4 | 周辺サービス | オブジェクトストレージ、CDN、会話履歴DB（TTL）、APIルーティング |

## 3. 共通の成熟度ステップ（全プラットフォーム共通ロードマップ）

| Step | 内容 | 状態 |
|------|------|------|
| **Step 1** | **単一Agent（function calling）**: 自然言語の位置・ニュアンス指定（「もう少し右」「控えめに」等）を決定論的合成パラメータへ変換するシンプルなツール呼び出しAgent。現行AWS実装が相当 | 本プランの実装対象 |
| **Step 2** | **判断機能の分離**: (a) フォント・画像アセットの利用可否（ライセンス・認証許可の有無）判定、(b) キャッシュ利用判断 — 決定論的レンダリングゆえに「同一パラメータ→キャッシュヒット」が成立する本プロダクト特有の最適化。機能（ツール群）として実装するか協調Agentとするかはプラットフォームごとに検討 | 方向性のみ（詳細化しない） |
| **Step 3** | **A2Aマルチエージェント**: 画像/動画合成オーケストレーターAgentが、専門Agent（アセット権限判定・レイアウト提案・動画生成等）と**A2Aプロトコル**で協調 | 方向性のみ（詳細化しない） |

> **レビューゲート**: Step 1を3プラットフォームで完了した時点で、実測データ（コスト・レイテンシ・開発体験）に基づき**Step 2 / Step 3の構成を再設計するレビューを必ず実施する**。本ドキュメントのStep 2/3記述は仮置きであり、このゲートで書き直すことを前提とする。

### Step 3 の A2A 対応状況（プラットフォーム差が最大の論点）

A2A（Agent2Agent Protocol）はGoogle発・Linux Foundation管轄のオープンプロトコル。

- **GCP**: 本家。Vertex AI Agent Engine / ADK（Agent Development Kit）がA2Aを一級サポートし、最も手厚い
- **AWS**: Bedrock AgentCore がA2A対応を表明。Strands Agents SDKにもA2A統合がある
- **Cloudflare**: Agents SDKでの自前実装寄り。エッジでのA2Aサーバー実装という検証テーマになる

## 4. プラットフォーム別アーキテクチャ

### 4.1 AWS（現状 = ベースライン）

| 軸 | 実装 |
|---|---|
| コンピュート | Lambda（Python 3.12、X86_64: 合成エンジン / ARM_64: Agent） |
| AI / Agent | Bedrock（Claude Sonnet 4.5 ほかマルチモデル）+ Strands Agents SDK（`@tool`） |
| 画像合成エンジン | Pillow + ffmpeg（Lambda Layer同梱） |
| 周辺サービス | S3（4バケット）、CloudFront、DynamoDB（TTL 7日）、API Gateway |

**コンテナ最適化案**:
- 現行はLambda Layer方式。比較の公平性のため、GCP/Cloudflareと同一の**コンテナイメージ（Lambda Container Image）**へ寄せる選択肢も検証対象とする
- ffmpeg分離（静止画専用の軽量関数と動画専用関数の分割）はLambdaでも有効。静止画パスのコールドスタート短縮になる

**Step 2/3 の発展先（注記）**: Bedrock AgentCore（Runtime / Memory / Gateway）へセッション管理・ツール実行ループを委譲し、サブエージェント分割の土台にする。

### 4.2 GCP

| 軸 | ベースライン案 |
|---|---|
| コンピュート | **Cloud Run**（既存Python+Pillow+ffmpegのDockerイメージをほぼそのままデプロイ。最も素直な移植先） |
| AI / Agent | **Gemini（Vertex AI経由）+ function calling**。Strandsの`@tool`パターンとほぼ1:1対応し、Agentループは自前実装でAWS版と比較しやすい |
| 画像合成エンジン | 上記コンテナをCloud Runで実行 |
| 周辺サービス | Cloud Storage、Firestore（TTLポリシー対応）、Cloud CDN、Cloud Run直下HTTP or API Gateway |

**コンテナ最適化案**:
- **マルチステージビルド**でビルド依存を除去し実行イメージを軽量化
- **ffmpeg分離**: Pillow専用の軽量イメージと、動画生成時のみ使うffmpeg同梱イメージを**2つのCloud Runサービスに分割**。静止画合成のコールドスタートを大幅短縮
- ffmpegは静的ビルド済みバイナリ（BtbN/FFmpeg-Builds等）を採用しaptフルパッケージを回避
- **Startup CPU Boost** + `min-instances=0` でコスト/コールドスタートのバランス調整

**Step 2/3 の発展先（注記）**: Vertex AI Agent Engine + ADK。A2A本家であり、Step 3の主戦場。

### 4.3 Cloudflare

| 軸 | ベースライン案 |
|---|---|
| コンピュート | **Workers**（Agent/API層、TypeScript）+ **Cloudflare Containers**（Python+Pillow+ffmpegコンテナをDurable Objectに紐付けて実行）の2層構成 |
| AI / Agent | **Workers AI**（Llama系等のエッジ推論、tool use対応）+ **Cloudflare Agents SDK**（Durable Objectsベースの状態保持Agent、WebSocket対応） |
| 画像合成エンジン | Cloudflare Containersで既存コンテナを実行 |
| 周辺サービス | R2（S3互換・egress無料）、Durable Objects or D1（会話履歴）、CDN標準内蔵 |

**コンテナ最適化案（3クラウド中、振れ幅が最大）**:
- **静止画パスの脱コンテナ化**: テキスト描画は `satori`（HTML/JSX→SVG）+ `resvg-wasm`（SVG→PNG）でWorkers内完結が可能。画像重ね合わせは `photon-rs`（WASM）または Cloudflare Images の `draw` オーバーレイで代替でき、静止画合成をコンテナレス・エッジ完結にできる可能性がある
- ただし**Pillowとのピクセル一致は崩れる**。「別実装間でどこまで決定論的等価性を保てるか（同一入力→同一出力の検証手法確立）」自体が本検証の中心テーマになる
- **動画のみコンテナ**: ffmpegが必要な動画生成だけContainersに残し、コンテナ責務を最小化

**Step 2/3 の発展先（注記）**: Agents SDK上でのA2Aサーバー自前実装。エッジでのマルチエージェントという検証テーマ。

## 5. 比較マトリクス（サマリ）

| 軸 \ プラットフォーム | AWS | GCP | Cloudflare |
|---|---|---|---|
| コンピュート | Lambda | Cloud Run | Workers + Containers |
| LLM | Bedrock（Claude/Nova） | Vertex AI（Gemini） | Workers AI（Llama等） |
| Agent SDK | Strands Agents | function calling自前（発展: ADK） | Agents SDK |
| 合成エンジン | Pillowコンテナ/Layer | Pillowコンテナ | Pillowコンテナ（発展: WASM化） |
| コンテナ最適化の方向 | Layer→コンテナ統一 + ffmpeg分離 | イメージ2分割 + 静的ffmpeg | 静止画の脱コンテナ（WASM）+ 動画のみコンテナ |
| ストレージ / CDN / 履歴DB | S3 / CloudFront / DynamoDB | GCS / Cloud CDN / Firestore | R2 / 内蔵CDN / DO・D1 |
| Step 3（A2A）成熟度 | AgentCoreが対応表明 | 本家・最も手厚い | 自前実装 |

| Step \ プラットフォーム | AWS | GCP | Cloudflare |
|---|---|---|---|
| Step 1（単一Agent） | ✅ 実装済み | Cloud Run + Gemini function calling | Workers AI tool use + Agents SDK |
| Step 2（判断機能分離） | レビューゲート後に再設計 | 同左 | 同左 |
| Step 3（A2Aマルチエージェント） | レビューゲート後に再設計 | 同左 | 同左 |

## 6. 検証で測るもの（Step 1完了時レビューゲートのインプット）

1. **コスト**: 同一シナリオ（合成100回 + チャット100往復）の実測費用
2. **レイテンシ**: Agent応答（NL→パラメータ変換）と合成実行それぞれのp50/p95、コールドスタート込み
3. **開発体験**: IaC（CDK / Terraform or gcloud / wrangler）、ローカル開発、CI/CD統合の工数感
4. **決定論的等価性**: 3プラットフォームの合成出力が同一入力でピクセル一致するか（特にCloudflare WASM化パス）
5. **Agent翻訳精度**: 同一の自然言語指示セットに対する各ネイティブLLMのパラメータ変換精度比較

## 7. スコープ外

- 本ドキュメントは構想・アーキテクチャ案まで。実装は Step 1 × プラットフォーム単位で別issueに分割する
- Step 2/3の詳細設計（レビューゲート後に本ドキュメントを改訂して詳細化する）
- 本番運用・SLA設計（検証目的のため）
