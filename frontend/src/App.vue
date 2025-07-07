<template>
  <div class="app-container">
    <header>
      <h1>🎨 画像合成REST API デモ</h1>
      <p class="subtitle">高性能・アルファチャンネル対応の画像合成REST API</p>
    </header>

    <div class="main-content">
      <div class="form-container">
        <h2>画像合成パラメータ</h2>
        
        <div class="form-group">
          <label>ベース画像:</label>
          <select v-model="params.baseImage">
            <option value="test">テスト画像 (aws-logo.png)</option>
            <option value="transparent">透明背景</option>
          </select>
        </div>

        <div class="form-group">
          <label>画像1:</label>
          <select v-model="params.image1">
            <option value="test">テスト画像 (circle_red.png)</option>
            <option value="s3://imageprocessorapistack-testimagesbucket4ab1f113-sjc4fwt3v47u/images/circle_red.png">S3パス (circle_red.png)</option>
          </select>
        </div>

        <div class="form-group">
          <label>画像1の位置 X:</label>
          <input type="number" v-model.number="params.image1X" />
        </div>

        <div class="form-group">
          <label>画像1の位置 Y:</label>
          <input type="number" v-model.number="params.image1Y" />
        </div>

        <div class="form-group">
          <label>画像1の幅:</label>
          <input type="number" v-model.number="params.image1Width" />
        </div>

        <div class="form-group">
          <label>画像1の高さ:</label>
          <input type="number" v-model.number="params.image1Height" />
        </div>

        <div class="form-group">
          <label>画像2:</label>
          <select v-model="params.image2">
            <option value="test">テスト画像 (rectangle_blue.png)</option>
            <option value="s3://imageprocessorapistack-testimagesbucket4ab1f113-sjc4fwt3v47u/images/rectangle_blue.png">S3パス (rectangle_blue.png)</option>
          </select>
        </div>

        <div class="form-group">
          <label>画像2の位置 X:</label>
          <input type="number" v-model.number="params.image2X" />
        </div>

        <div class="form-group">
          <label>画像2の位置 Y:</label>
          <input type="number" v-model.number="params.image2Y" />
        </div>

        <div class="form-group">
          <label>画像2の幅:</label>
          <input type="number" v-model.number="params.image2Width" />
        </div>

        <div class="form-group">
          <label>画像2の高さ:</label>
          <input type="number" v-model.number="params.image2Height" />
        </div>

        <div class="form-group">
          <label>出力形式:</label>
          <select v-model="params.format">
            <option value="html">HTML表示</option>
            <option value="png">PNG直接ダウンロード</option>
          </select>
        </div>

        <button @click="generateImage" :disabled="isLoading">
          {{ isLoading ? '処理中...' : '画像を生成' }}
        </button>
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

export default {
  name: 'App',
  data() {
    return {
      apiBaseUrl: process.env.VUE_APP_API_URL || 'https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite',
      params: {
        baseImage: 'test',
        image1: 'test',
        image1X: 20,
        image1Y: 20,
        image1Width: 300,
        image1Height: 200,
        image2: 'test',
        image2X: 20,
        image2Y: 240,
        image2Width: 300,
        image2Height: 200,
        format: 'html'
      },
      resultUrl: '',
      apiUrl: '',
      isLoading: false,
      error: null,
      examples: [
        {
          title: '基本的な合成',
          description: 'テスト画像を使用した基本的な合成例',
          params: {
            baseImage: 'test',
            image1: 'test',
            image1X: 20,
            image1Y: 20,
            image1Width: 300,
            image1Height: 200,
            image2: 'test',
            image2X: 20,
            image2Y: 240,
            image2Width: 300,
            image2Height: 200,
            format: 'html'
          }
        },
        {
          title: 'カスタム配置',
          description: '画像の位置とサイズを調整した例',
          params: {
            baseImage: 'test',
            image1: 'test',
            image1X: 100,
            image1Y: 100,
            image1Width: 400,
            image1Height: 300,
            image2: 'test',
            image2X: 500,
            image2Y: 100,
            image2Width: 200,
            image2Height: 200,
            format: 'html'
          }
        },
        {
          title: 'S3画像の使用',
          description: 'S3に保存された画像を使用した例',
          params: {
            baseImage: 'test',
            image1: 's3://imageprocessorapistack-testimagesbucket4ab1f113-sjc4fwt3v47u/images/circle_red.png',
            image1X: 20,
            image1Y: 20,
            image1Width: 300,
            image1Height: 200,
            image2: 's3://imageprocessorapistack-testimagesbucket4ab1f113-sjc4fwt3v47u/images/rectangle_blue.png',
            image2X: 20,
            image2Y: 240,
            image2Width: 300,
            image2Height: 200,
            format: 'html'
          }
        }
      ]
    };
  },
  methods: {
    buildApiUrl() {
      const url = new URL(this.apiBaseUrl);
      
      // パラメータを追加
      Object.keys(this.params).forEach(key => {
        if (this.params[key] !== null && this.params[key] !== undefined) {
          url.searchParams.append(key, this.params[key]);
        }
      });
      
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
        console.error('Error generating image:', error);
        this.error = error.message || 'Unknown error';
        
        // エラーが発生した場合、PNG形式で再試行
        try {
          const retryUrl = new URL(this.apiUrl);
          retryUrl.searchParams.set('format', 'png');
          const retryResponse = await axios.get(retryUrl.toString(), { responseType: 'blob' });
          this.resultUrl = URL.createObjectURL(retryResponse.data);
          this.error = null; // エラーをクリア
        } catch (retryError) {
          console.error('Retry failed:', retryError);
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

.form-container, .result-container {
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

input, select {
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
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
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

@media (max-width: 768px) {
  .main-content {
    flex-direction: column;
  }
  
  .form-container, .result-container {
    width: 100%;
  }
  
  .example-card {
    min-width: 100%;
  }
}
</style>
