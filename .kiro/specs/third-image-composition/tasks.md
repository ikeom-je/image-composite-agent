# 第3画像合成機能 - 実装計画

## 実装タスク

- [x] 1. 三角形テスト画像を生成する
  - Pillowライブラリを使用して緑色の三角形画像を生成する
  - 透過背景（アルファチャンネル）対応のPNG形式で保存する
  - lambda/python/images/triangle_green.pngとして保存する
  - 画像サイズは400x400ピクセル、緑色（#22c55e）で作成する
  - _Requirements: 3.1, 3.2_

- [x] 2. 三角形画像をS3にアップロードする
  - 既存のアップロードスクリプト（scripts/upload-test-images.sh）を拡張する
  - triangle_green.pngをテストバケットのimages/ディレクトリにアップロードする
  - アップロード後にS3での画像アクセス権限を確認する
  - 既存の画像（circle_red.png, rectangle_blue.png, aws-logo.png）と同じ場所に配置する
  - _Requirements: 3.3, 3.4_

- [x] 3. Lambda関数の画像取得エンジンを拡張する
  - fetch_image関数でimage3タイプの処理を追加する
  - image_type="image3"の場合にtriangle_green.pngを自動選択する機能を実装する
  - 既存のimage1（circle_red.png）、image2（rectangle_blue.png）の動作を維持する
  - テスト画像指定時の分岐処理を拡張する
  - _Requirements: 3.4, 3.5, 5.1, 5.2_

- [x] 4. Lambda関数の画像合成エンジンを拡張する
  - create_composite_image関数にimage3パラメータを追加する
  - 3つの画像を順序通り（image1 → image2 → image3）に合成する処理を実装する
  - image3がNoneの場合は既存の2画像合成処理を実行する（後方互換性）
  - アルファチャンネル対応の合成処理を3画像に拡張する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.2_

- [x] 5. Lambda関数のハンドラーを拡張する
  - handler関数でimage3パラメータの解析処理を追加する
  - image3の位置・サイズパラメータ（image3X, image3Y, image3Width, image3Height）を処理する
  - image3パラメータが指定されない場合の後方互換性を保持する
  - 3画像の並列取得処理を実装する（ThreadPoolExecutorのmax_workersを3に拡張）
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3_

- [x] 6. HTMLレスポンス生成を3画像対応に拡張する
  - generate_html_response関数にimage3パラメータを追加する
  - 3画像合成の場合の技術情報表示を実装する
  - 合成パラメータテーブルにImage3の行を追加する
  - S3リソース情報に合成画像3の情報を追加する
  - API使用例を3画像対応に更新する
  - _Requirements: 1.1, 1.5, 5.4_

- [x] 7. フロントエンドの画像選択UIを実装する
  - 3画像の選択を横並びテーブル形式で表示するコンポーネントを作成する
  - 画像1（必須）、画像2（必須）、画像3（オプション）の選択フォームを実装する
  - 各画像でテスト画像とS3画像を選択できるプルダウンメニューを作成する
  - image3が選択されていない場合は設定項目を無効化する
  - _Requirements: 4.1, 4.2_

- [x] 8. フロントエンドの位置・サイズ設定UIを実装する
  - 3画像の位置・サイズ設定を横並びテーブル形式で表示する
  - X座標、Y座標、幅、高さの数値入力フィールドを各画像に対して作成する
  - image3が選択されていない場合は入力フィールドを無効化する
  - テーブルのレスポンシブデザインを実装する（横スクロール対応）
  - _Requirements: 4.3, 2.1, 2.2, 2.3, 2.4_

- [x] 9. フロントエンドの画像生成ボタンを改善する
  - 目立つデザインのボタンコンポーネントを実装する
  - グラデーション背景とホバーエフェクトを追加する
  - ローディング状態の表示（スピナーアニメーション）を実装する
  - 2画像/3画像合成に応じたボタンテキストの動的変更を実装する
  - 必須パラメータ未入力時のボタン無効化を実装する
  - _Requirements: 4.4_

- [x] 10. フロントエンドのAPI通信機能を拡張する
  - buildApiUrl関数にimage3パラメータの処理を追加する
  - image3が選択されている場合のみパラメータを送信する
  - image3の位置・サイズパラメータ（image3X, image3Y, image3Width, image3Height）を送信する
  - 既存の2画像合成APIとの後方互換性を保持する
  - _Requirements: 4.4, 5.1, 5.2_

- [x] 11. フロントエンドの使用例を3画像対応に拡張する
  - 3画像合成の使用例プリセットを作成する
  - 「基本的な3画像合成」（円・四角・三角）の使用例を実装する
  - 「三角形を中央配置」の使用例を実装する
  - 使用例選択時に3画像のパラメータを適切に設定する機能を実装する
  - 既存の2画像使用例との共存を実装する
  - _Requirements: 4.5_

- [ ] 12. Lambda関数のユニットテストを実装する
  - 3画像合成処理のテストケースを作成する
  - 後方互換性（2画像合成）のテストケースを作成する
  - 三角形画像取得のテストケースを作成する
  - image3パラメータの検証テストケースを作成する
  - エラーハンドリングのテストケースを作成する
  - _Requirements: 6.1, 6.4_

- [ ] 13. API統合テスト（Playwright）を実装する
  - 基本的な3画像合成APIのテストケースを作成する
  - 2画像合成の後方互換性テストケースを作成する
  - image3オプションパラメータのテストケースを作成する
  - 三角形画像使用のテストケースを作成する
  - パラメータバリデーションのテストケースを作成する
  - _Requirements: 6.2, 6.4, 6.5_

- [ ] 14. フロントエンドE2Eテストを実装する
  - 第3画像選択フォームの表示テストを作成する
  - 3画像合成実行のテストケースを作成する
  - 位置・サイズ設定テーブルの操作テストを作成する
  - 画像生成ボタンの動作テストを作成する
  - 3画像合成使用例の動作テストを作成する
  - _Requirements: 6.3, 6.4_

- [ ] 15. 全体統合テストと動作検証を実行する
  - 全てのユニットテストを実行して結果を確認する
  - 全てのE2Eテストを実行して結果を確認する
  - 手動テストで3画像合成のエンドツーエンド動作を確認する
  - 後方互換性の手動テストを実行する
  - パフォーマンステストを実行する（3画像処理時間の確認）
  - _Requirements: 6.5_

- [x] 16. デプロイメントとドキュメント整備を完了する
  - 本番環境への3画像合成機能デプロイを実行する
  - 三角形画像のS3アップロードを実行する
  - README.mdに3画像合成機能の説明を追加する
  - AmazonQ.mdに3画像合成の実装ガイドを追加する
  - history.mdに開発履歴を記録する
  - バージョンを2.3.0に更新する
  - _Requirements: 全般_

## 実装の詳細仕様

### 三角形画像生成の仕様
```python
# scripts/generate_triangle_image.py
def generate_triangle_image():
    """
    三角形テスト画像の生成仕様:
    - サイズ: 400x400ピクセル
    - 色: 緑色 (#22c55e / RGB: 34, 197, 94)
    - 背景: 透明（アルファチャンネル = 0）
    - 形状: 正三角形（上向き）
    - 頂点位置: 上(200, 100), 左下(100, 300), 右下(300, 300)
    - 保存形式: PNG
    - 保存先: lambda/python/images/triangle_green.png
    """
```

### Lambda関数拡張の仕様
```python
# image_processor.py の拡張仕様
def handler(event, context):
    """
    パラメータ処理の拡張:
    - image3: オプションパラメータ（未指定時はNone）
    - image3X: デフォルト値 20
    - image3Y: デフォルト値 20  
    - image3Width: デフォルト値 300
    - image3Height: デフォルト値 200
    - 並列取得: max_workers=3（image3が指定されている場合）
    - 後方互換性: image3未指定時は既存の2画像合成処理
    """

def create_composite_image(base_img, image1, image2, image3=None, 
                          img1_params, img2_params, img3_params=None):
    """
    合成順序の仕様:
    1. base_img（ベース画像）
    2. image1を合成
    3. image2を合成  
    4. image3を合成（指定されている場合のみ）
    
    アルファチャンネル処理:
    - 全ての画像でRGBAモードを使用
    - 透過情報を保持した合成処理
    - paste()の第3引数にマスクを指定
    """
```

### フロントエンドUI仕様
```vue
<!-- 画像選択テーブルの仕様 -->
<table class="images-selection-table">
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
      <td>画像選択</td>
      <td>
        <!-- image1のプルダウン: デフォルト "test" (円) -->
        <select v-model="params.image1">
          <option value="test">テスト画像 (円)</option>
          <option value="s3://...">S3画像選択肢</option>
        </select>
      </td>
      <td>
        <!-- image2のプルダウン: デフォルト "test" (四角) -->
        <select v-model="params.image2">
          <option value="test">テスト画像 (四角)</option>
          <option value="s3://...">S3画像選択肢</option>
        </select>
      </td>
      <td>
        <!-- image3のプルダウン: デフォルト "" (選択しない) -->
        <select v-model="params.image3">
          <option value="">選択しない</option>
          <option value="test">テスト画像 (三角)</option>
          <option value="s3://...">S3画像選択肢</option>
        </select>
      </td>
    </tr>
  </tbody>
</table>

<!-- 位置・サイズ設定テーブルの仕様 -->
<table class="position-size-table">
  <thead>
    <tr>
      <th>設定項目</th>
      <th>画像1</th>
      <th>画像2</th>
      <th>画像3 {{ params.image3 ? '' : '(無効)' }}</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>X座標</td>
      <td><input v-model.number="params.image1X" type="number" /></td>
      <td><input v-model.number="params.image2X" type="number" /></td>
      <td><input v-model.number="params.image3X" type="number" :disabled="!params.image3" /></td>
    </tr>
    <!-- Y座標、幅、高さも同様 -->
  </tbody>
</table>
```

### 画像生成ボタンの仕様
```vue
<button 
  @click="generateImage" 
  :disabled="isLoading || !params.image1 || !params.image2"
  class="generate-button"
>
  <span v-if="isLoading">
    <!-- スピナーアニメーション -->
    <svg class="animate-spin">...</svg>
    生成中...
  </span>
  <span v-else>
    🎨 {{ params.image3 ? '3画像を合成' : '2画像を合成' }}
  </span>
</button>

<style>
.generate-button {
  /* グラデーション背景 */
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  /* ホバーエフェクト */
  transform: scale(1.05) on hover;
  /* 最小サイズ */
  min-width: 200px;
  min-height: 56px;
  /* その他のスタイル */
}
</style>
```

### テスト仕様

#### ユニットテスト仕様
```python
class TestThirdImageComposition(unittest.TestCase):
    def test_three_image_composition(self):
        """3画像合成の基本動作テスト"""
        # 3つのテスト画像を準備
        # create_composite_image関数を呼び出し
        # 結果画像のサイズ、モード、透過情報を検証
        
    def test_backward_compatibility(self):
        """後方互換性テスト（image3=None）"""
        # image3をNoneで呼び出し
        # 既存の2画像合成と同じ結果になることを確認
        
    def test_triangle_image_fetch(self):
        """三角形画像取得テスト"""
        # fetch_image("test", "image3")を呼び出し
        # triangle_green.pngが取得されることを確認
```

#### E2Eテスト仕様
```typescript
test.describe('3画像合成機能', () => {
  test('基本的な3画像合成API', async ({ request }) => {
    const response = await request.get(
      '/images/composite?image1=test&image2=test&image3=test'
    );
    expect(response.status()).toBe(200);
  });
  
  test('フロントエンド3画像選択', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 第3画像を選択
    await page.selectOption('select[v-model="params.image3"]', 'test');
    
    // 画像生成ボタンをクリック
    await page.click('button:has-text("3画像を合成")');
    
    // 結果画像が表示されることを確認
    await expect(page.locator('.result-image')).toBeVisible();
  });
});
```

## デフォルト値の設定

### Lambda関数のデフォルト値
```python
# 第3画像のデフォルトパラメータ
DEFAULT_IMAGE3_PARAMS = {
    'x': 20,        # 左上に配置
    'y': 20,        # 左上に配置  
    'width': 300,   # 標準サイズ
    'height': 200   # 標準サイズ
}
```

### フロントエンドのデフォルト値
```javascript
// Vue.jsコンポーネントのデフォルト値
data() {
  return {
    params: {
      // 既存パラメータ
      baseImage: 'test',
      image1: 'test',
      image2: 'test',
      
      // 新規パラメータ
      image3: '',           // 空文字（選択しない）
      image3X: 20,          // 左上
      image3Y: 20,          // 左上
      image3Width: 300,     // 標準サイズ
      image3Height: 200,    // 標準サイズ
      
      // その他既存パラメータ
      format: 'html'
    }
  };
}
```

## バージョン管理

### バージョン更新の仕様
- **現在のバージョン**: v2.2.0
- **新しいバージョン**: v2.3.0（新機能追加のためマイナーバージョンアップ）
- **更新対象ファイル**:
  - `package.json`: version フィールド
  - `lambda/python/image_processor.py`: HTMLレスポンスのタイトル
  - `README.md`: タイトルと説明
  - `history.md`: 開発履歴の追加

### 更新内容
- 3画像合成機能の追加
- 三角形テスト画像の追加
- フロントエンドUIの改善（テーブル形式、目立つボタン）
- 後方互換性の完全保持
- 包括的なテストカバレッジの追加