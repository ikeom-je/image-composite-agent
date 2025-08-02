# 画像合成REST API システム - 実装計画

## 実装タスク

- [ ] 1. CDKインフラストラクチャの基盤を構築する
  - AWS CDKプロジェクトの初期化とスタック定義を作成する
  - S3バケット（リソース、テスト画像、フロントエンド）を定義する
  - IAM権限とセキュリティ設定を実装する
  - _Requirements: 6.3, 6.4, 6.5_

- [ ] 2. Lambda関数の画像取得エンジンを実装する
  - S3からの画像取得機能（boto3使用）を実装する
  - HTTP/HTTPS URLからの画像取得機能を実装する
  - テスト画像の自動選択機能を実装する
  - 並列画像取得による高速化を実装する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. 画像合成処理エンジンを実装する
  - Pillowライブラリを使用した高品質画像合成を実装する
  - アルファチャンネル（透過情報）対応の合成処理を実装する
  - 画像の位置・サイズ調整機能を実装する
  - RGBA変換とLANCOS補間による品質保持を実装する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 4. Lambda関数のレスポンス生成機能を実装する
  - HTML表示レスポンス（技術情報付き）を実装する
  - PNG直接返却レスポンスを実装する
  - JavaScriptダウンロード機能を実装する
  - 詳細なエラーハンドリングとログ出力を実装する
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 5. API Gatewayの設定と統合を実装する
  - RESTエンドポイント（/images/composite）を作成する
  - Lambda統合とパラメータマッピングを設定する
  - CORS設定とバイナリメディアタイプ対応を実装する
  - エラーレスポンスの適切な変換を設定する
  - _Requirements: 6.4_

- [ ] 6. Vue.js 3フロントエンドの基盤を構築する
  - Vite + Vue.js 3プロジェクトを初期化する
  - Tailwind CSSによるスタイリングシステムを構築する
  - レスポンシブデザインの基本レイアウトを実装する
  - コンポーネント構造を設計・実装する
  - _Requirements: 5.1_

- [ ] 7. フロントエンドのパラメータ設定フォームを実装する
  - 画像ソース選択（テスト画像、S3パス）フォームを作成する
  - 位置・サイズ調整の数値入力フォームを実装する
  - 出力形式選択機能を実装する
  - フォームバリデーションとエラー表示を実装する
  - _Requirements: 5.1, 5.2_

- [ ] 8. フロントエンドのAPI通信機能を実装する
  - Axiosによる非同期API通信を実装する
  - Content-Type判定による適切なレスポンス処理を実装する
  - エラーハンドリングと自動再試行メカニズムを実装する
  - ローディング状態とプログレス表示を実装する
  - 動的設定管理システム（ConfigManager）を実装する
  - _Requirements: 5.2, 5.3_

- [ ] 9. 画像表示とダウンロード機能を実装する
  - 合成画像のプレビュー表示機能を実装する
  - 画像ダウンロード機能を実装する
  - API URLコピー機能を実装する
  - 使用例プリセット機能を実装する
  - _Requirements: 5.3, 5.4, 5.5_

- [ ] 10. CloudFrontによるセキュアな配信を設定する
  - CloudFrontディストリビューションを作成する
  - Origin Access Identity (OAI)によるS3アクセス制限を設定する
  - HTTPS強制とキャッシュ設定を実装する
  - SPA対応のエラーレスポンス設定を実装する
  - _Requirements: 6.5_

- [ ] 10.1. 動的URL設定システムを実装する
  - CDKデプロイ時にAPI GatewayとCloudFrontのURLを自動取得する仕組みを実装する
  - config.jsonファイルを動的生成してS3にデプロイする機能を実装する
  - フロントエンドでconfig.jsonから設定を読み込む機能を実装する
  - 環境変数による設定オーバーライド機能を実装する
  - フォールバック機能による堅牢性を確保する
  - _Requirements: 5.2, 6.4_

- [ ] 11. Lambda関数のユニットテストを実装する
  - 画像取得機能のテストケースを作成する
  - 画像合成処理のテストケースを作成する
  - エラーハンドリングのテストケースを作成する
  - パラメータ検証のテストケースを作成する
  - _Requirements: 7.1, 7.4_

- [ ] 12. API統合テスト（Playwright）を実装する
  - 基本的な画像合成APIのテストを作成する
  - S3パス指定での画像合成テストを作成する
  - パラメータバリデーションテストを作成する
  - エラーレスポンステストを作成する
  - _Requirements: 7.2, 7.4_

- [ ] 13. フロントエンドE2Eテストを実装する
  - UI要素の表示・操作テストを作成する
  - フォーム入力と送信テストを作成する
  - 画像表示とダウンロードテストを作成する
  - 使用例機能のテストを作成する
  - _Requirements: 7.3, 7.4_

- [ ] 14. テスト画像とリソースをアップロードする
  - テスト用画像ファイル（aws-logo.png、circle_red.png、rectangle_blue.png）を準備する
  - S3テストバケットに画像をアップロードする
  - アップロードスクリプトを作成・実行する
  - 画像アクセス権限を確認する
  - _Requirements: 3.2_

- [ ] 15. 全体統合テストと動作検証を実行する
  - 全てのユニットテストを実行して結果を確認する
  - 全てのE2Eテストを実行して結果を確認する
  - 手動テストでエンドツーエンドの動作を確認する
  - パフォーマンステストを実行する
  - _Requirements: 7.5_

- [ ] 16. デプロイメントとドキュメント整備を完了する
  - 本番環境へのデプロイを実行する
  - 動的URL設定が正しく動作することを確認する
  - README.mdとAmazonQ.mdを更新する
  - API仕様書とユーザーガイドを作成する
  - 運用・保守手順をドキュメント化する
  - _Requirements: 全般_

## 動的URL設定の実装詳細

### CDK側の実装
```typescript
// lib/image-processor-api-stack.ts
export class ImageProcessorApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // ... 他のリソース作成 ...
    
    // 設定ファイルの内容を動的生成
    const configContent = {
      apiUrl: this.apiEndpoint,
      cloudfrontUrl: `https://${this.distribution.distributionDomainName}`,
      s3BucketNames: {
        resources: this.resourcesBucket.bucketName,
        testImages: this.testImagesBucket.bucketName,
        frontend: this.frontendBucket.bucketName,
      },
      version: process.env.npm_package_version || '1.0.0',
      environment: this.node.tryGetContext('environment') || 'production'
    };
    
    // フロントエンドと設定ファイルを同時にデプロイ
    new s3deploy.BucketDeployment(this, 'DeployFrontendWithConfig', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../frontend/dist')),
        s3deploy.Source.jsonData('config.json', configContent)
      ],
      destinationBucket: this.frontendBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
  }
}
```

### フロントエンド側の実装
```javascript
// frontend/src/utils/config.js
class ConfigManager {
  constructor() {
    this.config = null;
    this.loading = false;
  }
  
  async loadConfig() {
    if (this.config) return this.config;
    if (this.loading) return this.waitForConfig();
    
    this.loading = true;
    
    try {
      const response = await fetch('/config.json');
      this.config = await response.json();
      
      // 環境変数による上書き
      if (import.meta.env.VITE_API_URL) {
        this.config.apiUrl = import.meta.env.VITE_API_URL;
      }
      
      return this.config;
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = this.getDefaultConfig();
      return this.config;
    } finally {
      this.loading = false;
    }
  }
  
  getDefaultConfig() {
    return {
      apiUrl: import.meta.env.VITE_API_URL || 'https://api.example.com/prod/images/composite',
      cloudfrontUrl: 'https://example.cloudfront.net',
      s3BucketNames: {
        resources: 'default-resources-bucket',
        testImages: 'default-test-bucket',
        frontend: 'default-frontend-bucket'
      }
    };
  }
  
  async waitForConfig() {
    while (this.loading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.config;
  }
}

export const configManager = new ConfigManager();
```

```javascript
// frontend/src/App.vue
<script>
import { configManager } from './utils/config.js';

export default {
  name: 'App',
  data() {
    return {
      config: null,
      configLoaded: false,
      apiBaseUrl: '',
      // ... 他のデータ
    };
  },
  
  async created() {
    await this.loadConfiguration();
  },
  
  methods: {
    async loadConfiguration() {
      try {
        this.config = await configManager.loadConfig();
        this.apiBaseUrl = this.config.apiUrl;
        this.configLoaded = true;
        
        // S3バケット名を使用例に反映
        this.updateExamplesWithS3Paths();
      } catch (error) {
        console.error('Configuration loading failed:', error);
        this.apiBaseUrl = import.meta.env.VITE_API_URL || '';
        this.configLoaded = true;
      }
    },
    
    updateExamplesWithS3Paths() {
      if (this.config?.s3BucketNames?.testImages) {
        const bucketName = this.config.s3BucketNames.testImages;
        // 使用例のS3パスを動的に更新
        this.examples.forEach(example => {
          if (example.params.image1?.startsWith('s3://')) {
            example.params.image1 = `s3://${bucketName}/images/circle_red.png`;
          }
          if (example.params.image2?.startsWith('s3://')) {
            example.params.image2 = `s3://${bucketName}/images/rectangle_blue.png`;
          }
        });
      }
    }
  }
};
</script>
```