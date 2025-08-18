<template>
  <div class="app-container">
    <header>
      <h1>🎨 画像合成REST API デモ</h1>
      <p class="subtitle">高性能・アルファチャンネル対応の画像合成REST API</p>
      <div v-if="config" class="config-info">
        <small>Version: {{ config.version }} | Environment: {{ config.environment }}</small>
      </div>
    </header>

    <!-- 設定読み込み中の表示 -->
    <div v-if="!configLoaded" class="config-loading">
      <div class="spinner"></div>
      <p>設定を読み込み中...</p>
    </div>

    <div v-else class="main-content">
      <div class="form-container">
        <h2>画像合成パラメータ</h2>

        <!-- ベース画像選択 -->
        <div class="form-group">
          <label class="form-label">ベース画像:</label>
          <select v-model="params.baseImage" class="form-select">
            <option value="test">テスト画像 (AWS Logo)</option>
            <option value="transparent">透明背景</option>
          </select>
        </div>

        <!-- 3画像の選択と設定を横並びテーブル形式で表示 -->
        <div class="images-config-section">
          <h3 class="text-lg font-semibold mb-4">画像設定</h3>

          <!-- 画像選択テーブル -->
          <div class="table-container mb-6">
            <table class="config-table">
              <thead>
                <tr>
                  <th>画像</th>
                  <th>画像1 (必須)</th>
                  <th>画像2 (必須)</th>
                  <th>画像3 (オプション)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="row-header">画像選択</td>
                  <td>
                    <select v-model="params.image1" class="form-select">
                      <option value="test">テスト画像 (円)</option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/circle_red.png`">
                        S3: circle_red.png
                      </option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/rectangle_blue.png`">
                        S3: rectangle_blue.png
                      </option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/triangle_green.png`">
                        S3: triangle_green.png
                      </option>
                    </select>
                  </td>
                  <td>
                    <select v-model="params.image2" class="form-select">
                      <option value="test">テスト画像 (四角)</option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/circle_red.png`">
                        S3: circle_red.png
                      </option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/rectangle_blue.png`">
                        S3: rectangle_blue.png
                      </option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/triangle_green.png`">
                        S3: triangle_green.png
                      </option>
                    </select>
                  </td>
                  <td>
                    <select v-model="params.image3" class="form-select" :class="{ 'disabled': !params.image3 }">
                      <option value="">選択しない</option>
                      <option value="test">テスト画像 (三角)</option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/circle_red.png`">
                        S3: circle_red.png
                      </option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/rectangle_blue.png`">
                        S3: rectangle_blue.png
                      </option>
                      <option v-if="config?.s3BucketNames?.testImages"
                        :value="`s3://${config.s3BucketNames.testImages}/images/triangle_green.png`">
                        S3: triangle_green.png
                      </option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 位置・サイズ設定テーブル -->
          <div class="table-container mb-6">
            <table class="config-table">
              <thead>
                <tr>
                  <th>設定項目</th>
                  <th>画像1</th>
                  <th>画像2</th>
                  <th :class="{ 'disabled-header': !params.image3 }">
                    画像3 {{ params.image3 ? '' : '(無効)' }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="row-header">X座標</td>
                  <td>
                    <input v-model.number="params.image1X" type="number" class="form-input" />
                  </td>
                  <td>
                    <input v-model.number="params.image2X" type="number" class="form-input" />
                  </td>
                  <td :class="{ 'disabled-cell': !params.image3 }">
                    <input v-model.number="params.image3X" type="number" class="form-input"
                      :disabled="!params.image3" />
                  </td>
                </tr>
                <tr>
                  <td class="row-header">Y座標</td>
                  <td>
                    <input v-model.number="params.image1Y" type="number" class="form-input" />
                  </td>
                  <td>
                    <input v-model.number="params.image2Y" type="number" class="form-input" />
                  </td>
                  <td :class="{ 'disabled-cell': !params.image3 }">
                    <input v-model.number="params.image3Y" type="number" class="form-input"
                      :disabled="!params.image3" />
                  </td>
                </tr>
                <tr>
                  <td class="row-header">幅</td>
                  <td>
                    <input v-model.number="params.image1Width" type="number" class="form-input" />
                  </td>
                  <td>
                    <input v-model.number="params.image2Width" type="number" class="form-input" />
                  </td>
                  <td :class="{ 'disabled-cell': !params.image3 }">
                    <input v-model.number="params.image3Width" type="number" class="form-input"
                      :disabled="!params.image3" />
                  </td>
                </tr>
                <tr>
                  <td class="row-header">高さ</td>
                  <td>
                    <input v-model.number="params.image1Height" type="number" class="form-input" />
                  </td>
                  <td>
                    <input v-model.number="params.image2Height" type="number" class="form-input" />
                  </td>
                  <td :class="{ 'disabled-cell': !params.image3 }">
                    <input v-model.number="params.image3Height" type="number" class="form-input"
                      :disabled="!params.image3" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 出力形式選択 -->
        <div class="form-group">
          <label class="form-label">出力形式:</label>
          <select v-model="params.format" class="form-select">
            <option value="html">HTML表示</option>
            <option value="png">PNG直接ダウンロード</option>
          </select>
        </div>

        <!-- 画像生成ボタン（目立つデザイン） -->
        <div class="generate-button-section">
          <button @click="generateImage" :disabled="isLoading || !params.image1 || !params.image2"
            class="generate-button">
            <span v-if="isLoading" class="loading-content">
              <svg class="spinner-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                </path>
              </svg>
              生成中...
            </span>
            <span v-else class="button-content">
              🎨 {{ params.image3 ? '3画像を合成' : '2画像を合成' }}
            </span>
          </button>
        </div>
      </div>

      <div class="result-container">
        <h2>生成結果</h2>

        <div v-if="isLoading" class="loading">
          <div class="spinner"></div>
          <p>画像を生成中...</p>
        </div>

        <div v-else-if="error" class="error">
          <p>エラーが発生しました: {{ error }}</p>
        </div>

        <div v-else-if="resultUrl" class="result">
          <img :src="resultUrl" alt="合成画像" class="result-image" @error="handleImageError" />
          <div class="actions">
            <button @click="downloadImage">画像をダウンロード</button>
            <button @click="copyApiUrl">API URLをコピー</button>
          </div>
          <div class="api-url">
            <p>API URL:</p>
            <code>{{ apiUrl }}</code>
          </div>
        </div>

        <div v-else class="empty-result">
          <p>「画像を生成」ボタンをクリックして画像を合成してください</p>
        </div>
      </div>
    </div>

    <div class="examples">
      <h2>使用例</h2>
      <div class="example-cards">
        <div class="example-card" v-for="(example, index) in examples" :key="index" @click="loadExample(example)">
          <h3>{{ example.title }}</h3>
          <p>{{ example.description }}</p>
        </div>
      </div>
    </div>

    <footer>
      <p>画像合成REST API - 高性能・アルファチャンネル対応 🎨✨</p>
    </footer>
  </div>
</template>

<script>
import axios from 'axios';
import { configManager } from './utils/config.js';

export default {
  name: 'App',
  data() {
    return {
      // 動的設定
      config: null,
      configLoaded: false,

      // API設定（動的に設定される）
      apiBaseUrl: '',
      params: {
        baseImage: 'test',
        image1: 'test',
        image1X: 1600,
        image1Y: 20,
        image1Width: 300,
        image1Height: 200,
        image2: 'test',
        image2X: 1600,
        image2Y: 240,
        image2Width: 300,
        image2Height: 200,
        // 新規追加: 第3画像パラメータ
        image3: '',
        image3X: 20,
        image3Y: 20,
        image3Width: 300,
        image3Height: 200,
        format: 'html'
      },
      resultUrl: '',
      apiUrl: '',
      isLoading: false,
      error: null,
      examples: [
        {
          title: '🎨 基本的な3画像合成',
          description: '円・四角・三角の3つの図形を合成',
          params: {
            baseImage: 'test',
            image1: 'test',
            image1X: 1600,
            image1Y: 20,
            image1Width: 300,
            image1Height: 200,
            image2: 'test',
            image2X: 1600,
            image2Y: 240,
            image2Width: 300,
            image2Height: 200,
            image3: 'test',
            image3X: 20,
            image3Y: 20,
            image3Width: 300,
            image3Height: 200,
            format: 'html'
          }
        },
        {
          title: '🔺 三角形を中央配置',
          description: '三角形を画面中央に大きく配置',
          params: {
            baseImage: 'transparent',
            image1: 'test',
            image1X: 100,
            image1Y: 100,
            image1Width: 300,
            image1Height: 200,
            image2: 'test',
            image2X: 1500,
            image2Y: 100,
            image2Width: 300,
            image2Height: 200,
            image3: 'test',
            image3X: 800,
            image3Y: 400,
            image3Width: 400,
            image3Height: 300,
            format: 'html'
          }
        },
        {
          title: '📐 基本的な2画像合成',
          description: '従来の2画像合成（後方互換性）',
          params: {
            baseImage: 'test',
            image1: 'test',
            image1X: 1600,
            image1Y: 20,
            image1Width: 300,
            image1Height: 200,
            image2: 'test',
            image2X: 1600,
            image2Y: 240,
            image2Width: 300,
            image2Height: 200,
            image3: '',
            format: 'html'
          }
        },
        {
          title: '☁️ S3画像を使用した3画像合成',
          description: 'S3に保存された画像を使用',
          params: {
            baseImage: 'test',
            image1: 's3://placeholder/images/circle_red.png',
            image1X: 1600,
            image1Y: 20,
            image1Width: 300,
            image1Height: 200,
            image2: 's3://placeholder/images/rectangle_blue.png',
            image2X: 1600,
            image2Y: 240,
            image2Width: 300,
            image2Height: 200,
            image3: 's3://placeholder/images/triangle_green.png',
            image3X: 20,
            image3Y: 20,
            image3Width: 300,
            image3Height: 200,
            format: 'html'
          }
        }
      ]
    };
  },

  async created() {
    await this.loadConfiguration();
  },

  methods: {
    /**
     * 設定を読み込む
     */
    async loadConfiguration() {
      try {
        console.log('Loading application configuration...');
        this.config = await configManager.loadConfig();
        this.apiBaseUrl = this.config.apiUrl;
        this.configLoaded = true;

        console.log('Configuration loaded:', {
          apiUrl: this.config.apiUrl,
          version: this.config.version,
          environment: this.config.environment
        });

        // S3バケット名を使用例に反映
        this.updateExamplesWithS3Paths();

        // フォームのS3パス選択肢も更新
        this.updateFormS3Options();
      } catch (error) {
        console.error('Configuration loading failed:', error);
        this.apiBaseUrl = import.meta.env.VITE_API_URL || '';
        this.configLoaded = true;
      }
    },

    /**
     * 使用例のS3パスを動的に更新（3画像対応）
     */
    updateExamplesWithS3Paths() {
      if (this.config?.s3BucketNames?.testImages) {
        const bucketName = this.config.s3BucketNames.testImages;
        console.log('Updating examples with S3 bucket:', bucketName);

        this.examples.forEach(example => {
          if (example.params.image1?.startsWith('s3://placeholder')) {
            example.params.image1 = `s3://${bucketName}/images/circle_red.png`;
          }
          if (example.params.image2?.startsWith('s3://placeholder')) {
            example.params.image2 = `s3://${bucketName}/images/rectangle_blue.png`;
          }
          if (example.params.image3?.startsWith('s3://placeholder')) {
            example.params.image3 = `s3://${bucketName}/images/triangle_green.png`;
          }
        });
      }
    },

    /**
     * フォームのS3パス選択肢を更新
     */
    updateFormS3Options() {
      // この関数は将来的にフォームの選択肢を動的に更新するために使用
      // 現在はテンプレート内で直接参照しているため、後で実装
    },
    buildApiUrl() {
      const url = new URL(this.apiBaseUrl);

      // 必須パラメータを追加
      if (this.params.baseImage) url.searchParams.set('baseImage', this.params.baseImage);
      url.searchParams.set('image1', this.params.image1);
      url.searchParams.set('image2', this.params.image2);

      // 画像1のパラメータ
      url.searchParams.set('image1X', this.params.image1X);
      url.searchParams.set('image1Y', this.params.image1Y);
      url.searchParams.set('image1Width', this.params.image1Width);
      url.searchParams.set('image1Height', this.params.image1Height);

      // 画像2のパラメータ
      url.searchParams.set('image2X', this.params.image2X);
      url.searchParams.set('image2Y', this.params.image2Y);
      url.searchParams.set('image2Width', this.params.image2Width);
      url.searchParams.set('image2Height', this.params.image2Height);

      // 第3画像のパラメータ（指定されている場合のみ）
      if (this.params.image3) {
        url.searchParams.set('image3', this.params.image3);
        url.searchParams.set('image3X', this.params.image3X);
        url.searchParams.set('image3Y', this.params.image3Y);
        url.searchParams.set('image3Width', this.params.image3Width);
        url.searchParams.set('image3Height', this.params.image3Height);
      }

      // 出力形式
      url.searchParams.set('format', this.params.format);

      return url.toString();
    },
    async generateImage() {
      this.isLoading = true;
      this.error = null;
      this.resultUrl = '';

      try {
        const apiUrl = this.buildApiUrl();
        this.apiUrl = apiUrl;

        // 常にBlobとして取得し、画像として表示する
        const response = await axios.get(apiUrl, {
          responseType: 'blob',
          headers: {
            'Accept': 'image/png, image/jpeg, image/*'
          }
        });

        // レスポンスのContent-Typeを確認
        const contentType = response.headers['content-type'];

        if (contentType && contentType.includes('image')) {
          // 画像の場合は直接表示
          this.resultUrl = URL.createObjectURL(response.data);
        } else if (contentType && contentType.includes('text/html')) {
          // HTMLの場合は画像を抽出
          const reader = new FileReader();
          reader.onload = (e) => {
            const htmlContent = e.target.result;
            // HTML内の画像を抽出
            const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch && imgMatch[1]) {
              this.resultUrl = imgMatch[1];
            } else {
              // 画像が見つからない場合はAPIを直接呼び出し
              const pngUrl = new URL(apiUrl);
              pngUrl.searchParams.set('format', 'png');
              this.resultUrl = pngUrl.toString();
            }
          };
          reader.readAsText(response.data);
        } else {
          // それ以外の場合はPNG形式で再リクエスト
          const pngUrl = new URL(apiUrl);
          pngUrl.searchParams.set('format', 'png');
          const pngResponse = await axios.get(pngUrl.toString(), { responseType: 'blob' });
          this.resultUrl = URL.createObjectURL(pngResponse.data);
        }
      } catch (error) {
        console.error('Error generating image:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          method: error.config?.method,
          code: error.code
        });

        // より詳細なエラーメッセージを設定
        if (error.code === 'ERR_NAME_NOT_RESOLVED') {
          this.error = 'API サーバーに接続できません。ネットワーク接続を確認してください。';
        } else if (error.response?.status === 500) {
          this.error = 'サーバーエラーが発生しました。しばらく待ってから再試行してください。';
        } else if (error.response?.status === 400) {
          this.error = 'リクエストパラメータに問題があります。設定を確認してください。';
        } else {
          this.error = error.message || 'Unknown error';
        }

        // エラーが発生した場合、PNG形式で再試行
        try {
          const retryUrl = new URL(this.apiUrl);
          retryUrl.searchParams.set('format', 'png');
          const retryResponse = await axios.get(retryUrl.toString(), { responseType: 'blob' });
          this.resultUrl = URL.createObjectURL(retryResponse.data);
          this.error = null; // エラーをクリア
        } catch (retryError) {
          console.error('Retry failed:', {
            message: retryError.message,
            status: retryError.response?.status,
            code: retryError.code
          });
          // 再試行も失敗した場合は元のエラーを表示
        }
      } finally {
        this.isLoading = false;
      }
    },
    handleImageError() {
      console.error('画像の読み込みに失敗しました');
      // PNG形式で再試行
      if (this.apiUrl && !this.apiUrl.includes('format=png')) {
        const pngUrl = new URL(this.apiUrl);
        pngUrl.searchParams.set('format', 'png');
        this.resultUrl = pngUrl.toString();
      }
    },
    downloadImage() {
      if (!this.resultUrl) return;

      const link = document.createElement('a');
      link.href = this.resultUrl;
      link.download = 'composite-image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    copyApiUrl() {
      if (!this.apiUrl) return;

      navigator.clipboard.writeText(this.apiUrl)
        .then(() => {
          alert('API URLをクリップボードにコピーしました');
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
        });
    },
    loadExample(example) {
      this.params = { ...example.params };
      this.generateImage();
    }
  }
};
</script>

<style>
:root {
  --primary-color: #0078d7;
  --secondary-color: #00a2ed;
  --accent-color: #ff9900;
  --background-color: #f5f7fa;
  --card-background: #ffffff;
  --text-color: #333333;
  --border-color: #e0e0e0;
  --success-color: #28a745;
  --error-color: #dc3545;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  line-height: 1.6;
  color: var(--text-color);
  background-color: var(--background-color);
}

.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

header {
  text-align: center;
  margin-bottom: 30px;
  padding: 20px;
  background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
  color: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.config-info {
  margin-top: 10px;
  opacity: 0.8;
}

.config-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
}

.subtitle {
  font-size: 1.2rem;
  opacity: 0.9;
}

.main-content {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 30px;
}

.form-container,
.result-container {
  flex: 1;
  min-width: 300px;
  background-color: var(--card-background);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

h2 {
  margin-bottom: 20px;
  color: var(--primary-color);
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 10px;
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

input,
select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 16px;
}

button {
  background-color: var(--primary-color);
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: background-color 0.3s;
  margin-top: 10px;
}

button:hover {
  background-color: var(--secondary-color);
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
}

.spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 4px solid var(--primary-color);
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.error {
  color: var(--error-color);
  padding: 20px;
  border: 1px solid var(--error-color);
  border-radius: 4px;
  background-color: rgba(220, 53, 69, 0.1);
}

.result-image {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 15px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.api-url {
  margin-top: 15px;
}

code {
  display: block;
  padding: 10px;
  background-color: #f8f9fa;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.empty-result {
  text-align: center;
  padding: 40px 0;
  color: #666;
}

.examples {
  margin-bottom: 30px;
}

.example-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

.example-card {
  flex: 1;
  min-width: 250px;
  background-color: var(--card-background);
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.example-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.example-card h3 {
  color: var(--primary-color);
  margin-bottom: 10px;
}

footer {
  text-align: center;
  margin-top: 30px;
  padding: 20px;
  background-color: var(--primary-color);
  color: white;
  border-radius: 8px;
}

/* 新しいテーブル形式UIのスタイル */
.images-config-section {
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  margin: 20px 0;
}

.table-container {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e0 #f7fafc;
}

.table-container::-webkit-scrollbar {
  height: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: #f7fafc;
}

.table-container::-webkit-scrollbar-thumb {
  background-color: #cbd5e0;
  border-radius: 4px;
}

.config-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border-color);
  background-color: white;
}

.config-table th,
.config-table td {
  border: 1px solid var(--border-color);
  padding: 12px;
  text-align: left;
  vertical-align: middle;
}

.config-table th {
  background-color: #f1f3f4;
  font-weight: 600;
  color: var(--text-color);
}

.config-table .row-header {
  background-color: #f8f9fa;
  font-weight: 500;
  min-width: 100px;
}

.config-table .disabled-header {
  background-color: #e9ecef;
  color: #6c757d;
}

.config-table .disabled-cell {
  background-color: #f8f9fa;
}

.form-label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

.form-select,
.form-input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
}

.form-input:disabled {
  background-color: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
}

.form-select.disabled {
  background-color: #f8f9fa;
}

/* 目立つ画像生成ボタンのスタイル */
.generate-button-section {
  text-align: center;
  margin: 30px 0;
}

.generate-button {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  font-weight: bold;
  padding: 16px 32px;
  border-radius: 8px;
  font-size: 18px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transform: translateY(0);
  transition: all 0.2s ease;
  min-width: 200px;
  min-height: 56px;
  border: none;
  cursor: pointer;
}

.generate-button:not(:disabled):hover {
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  transform: translateY(-2px);
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.2);
}

.generate-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.loading-content,
.button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.spinner-icon {
  width: 20px;
  height: 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .main-content {
    flex-direction: column;
  }

  .form-container,
  .result-container {
    width: 100%;
  }

  .example-card {
    min-width: 100%;
  }

  .config-table {
    font-size: 12px;
  }

  .config-table th,
  .config-table td {
    padding: 8px;
  }

  .form-select,
  .form-input {
    font-size: 12px;
    padding: 6px;
  }

  .generate-button {
    font-size: 16px;
    padding: 14px 28px;
    min-width: 180px;
  }
}
</style>
