# Credentials関連Rule

## 使用するCredentialsについて
- AWSアカウントは以下Profileを使う
  - masaikeo+ecsscaler-Admin
- Gitlab
  -  リポジトリ
    - git@ssh.gitlab.aws.dev:masaikeo/image-composite-processor.git
  - APIKey: 環境変数 GLAPIKEY を参照すること
  - コミットルール:
    - feature-[FunctionName]というブランチを作成して修正ごとにコミットする
    - 実装する機能が変わらない場合は同じブランチにコミットしていく
    - masterやmainブランチには絶対コミットしない
  - MergeRequest: 手動で行うため実施しない