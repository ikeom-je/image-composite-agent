# 画像合成REST API フロントエンド

このフロントエンドアプリケーションは、画像合成REST APIのデモインターフェースを提供します。Vue.js 3、Vite、Tailwind CSSを使用して構築されています。

## 機能

- 画像合成パラメータの設定
- 合成画像のプレビュー
- 画像のダウンロード
- API URLのコピー
- 使用例のプリセット

## 技術スタック

- **Vue.js 3**: フロントエンドフレームワーク
- **Vite**: 高速な開発環境とビルドツール
- **Tailwind CSS**: ユーティリティファーストのCSSフレームワーク
- **Axios**: HTTP通信ライブラリ

## 開発環境のセットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

## ビルドと本番デプロイ

```bash
# 本番用にビルド
npm run build

# ビルド結果のプレビュー
npm run preview

# S3へのデプロイ（AWS CLIが必要）
chmod +x deploy-to-s3.sh
./deploy-to-s3.sh
```

## 環境変数

`.env`ファイルで以下の環境変数を設定できます：

- `VITE_API_URL`: 画像合成APIのエンドポイントURL

## プロジェクト構造

```
frontend/
├── public/             # 静的ファイル
├── src/                # ソースコード
│   ├── assets/         # アセット（CSS、画像など）
│   ├── App.vue         # メインコンポーネント
│   └── main.js         # エントリーポイント
├── index.html          # HTMLテンプレート
├── vite.config.js      # Vite設定
├── tailwind.config.js  # Tailwind CSS設定
└── postcss.config.js   # PostCSS設定
```

## APIパラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `baseImage` | ベース画像 | `test`, `transparent` |
| `image1` | 合成する1つ目の画像 | `test`, `s3://bucket/key` |
| `image2` | 合成する2つ目の画像 | `test`, `s3://bucket/key` |
| `format` | 出力形式 | `html`, `png` |
| `image1X` | 1つ目の画像のX座標 | `20` |
| `image1Y` | 1つ目の画像のY座標 | `20` |
| `image1Width` | 1つ目の画像の幅 | `300` |
| `image1Height` | 1つ目の画像の高さ | `200` |
| `image2X` | 2つ目の画像のX座標 | `20` |
| `image2Y` | 2つ目の画像のY座標 | `240` |
| `image2Width` | 2つ目の画像の幅 | `300` |
| `image2Height` | 2つ目の画像の高さ | `200` |