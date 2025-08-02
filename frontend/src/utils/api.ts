/**
 * API サービス - v2.4.0
 * 画像合成APIとの通信を管理（TypeScript版）
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios'
import type { 
  CompositeRequest, 
  CompositeResponse, 
  UploadRequest, 
  UploadResponse, 
  UploadedImage,
  ApiResponse 
} from '@/types'
import { useConfigStore } from '@/stores/config'
import errorHandler, { NetworkError, ServerError, ValidationError } from './errorHandler'
import { requestQueue } from './requestQueue'

/**
 * APIサービスクラス
 */
class ApiService {
  private client: AxiosInstance | null = null
  private initialized = false

  /**
   * APIクライアントを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    const configStore = useConfigStore()
    await configStore.loadConfig()

    // Axiosインスタンスを作成
    this.client = axios.create({
      timeout: 30000, // 30秒タイムアウト
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // リクエストインターセプター
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[ApiService] ${config.method?.toUpperCase()} ${config.url}`)
        return config
      },
      (error) => {
        console.error('[ApiService] Request error:', error)
        return Promise.reject(error)
      }
    )

    // レスポンスインターセプター
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log(`[ApiService] Response ${response.status} from ${response.config.url}`)
        return response
      },
      (error) => {
        console.error('[ApiService] Response error:', error)
        return Promise.reject(error)
      }
    )

    this.initialized = true
    console.log('[ApiService] Initialized successfully')
  }

  /**
   * 画像合成APIを呼び出し（リクエストキューイング付き）
   * @param request 合成リクエスト
   * @returns 合成結果
   */
  async generateComposite(request: CompositeRequest): Promise<CompositeResponse> {
    await this.initialize()

    const configStore = useConfigStore()
    const apiUrl = configStore.apiUrl

    console.log('[ApiService] Generating composite with request:', request)

    // リクエストキューイングを使用してパフォーマンス最適化
    return await requestQueue.enqueue(
      async () => {
        return await errorHandler.executeWithRetry(
          async () => {
            try {
              const params = this.buildCompositeParams(request)
              
              const response = await this.client!.get(apiUrl, {
                params,
                responseType: request.outputFormat === 'html' ? 'text' : 'text',
                timeout: 60000, // 60秒タイムアウト（Lambda最適化に合わせて）
              })

              console.log('[ApiService] Composite generation successful')

              return {
                success: true,
                data: response.data,
                version: '2.4.0',
                processingTime: this.extractProcessingTime(response),
              }
            } catch (error: any) {
              // パラメータエラーの場合
              if (error.response?.status === 400) {
                throw new ValidationError(
                  error.response.data?.message || 'リクエストパラメータが正しくありません',
                  {
                    request,
                    responseData: error.response.data,
                  }
                )
              }

              // サーバーエラーの場合
              if (error.response?.status >= 500) {
                throw new ServerError(
                  error.response.data?.message || 'サーバーでエラーが発生しました',
                  {
                    request,
                    responseData: error.response.data,
                  }
                )
              }

              // その他のエラー
              throw error
            }
          },
          {
            context: {
              operation: 'generateComposite',
              request,
              apiUrl,
            },
            maxAttempts: 2, // キューイング使用時はリトライ回数を減らす
          }
        )
      },
      1 // 高優先度（画像合成は重要な処理）
    )
  }

  /**
   * 署名付きアップロードURLを取得
   * @param fileInfo ファイル情報
   * @returns 署名付きURL情報
   */
  async getPresignedUploadUrl(fileInfo: UploadRequest): Promise<ApiResponse<any>> {
    await this.initialize()

    const configStore = useConfigStore()
    const uploadApiUrl = configStore.uploadApiUrl

    console.log('[ApiService] Getting presigned upload URL for:', fileInfo)

    return await errorHandler.executeWithRetry(
      async () => {
        try {
          const response = await this.client!.post(`${uploadApiUrl}/presigned-url`, fileInfo)

          console.log('[ApiService] Presigned URL obtained successfully')

          return {
            success: true,
            data: response.data,
          }
        } catch (error: any) {
          if (error.response?.status === 400) {
            throw new ValidationError(
              error.response.data?.message || 'ファイル情報が正しくありません',
              {
                fileInfo,
                responseData: error.response.data,
              }
            )
          }

          throw error
        }
      },
      {
        context: {
          operation: 'getPresignedUploadUrl',
          fileInfo,
          uploadApiUrl,
        },
        maxAttempts: 2,
      }
    )
  }

  /**
   * アップロード済み画像一覧を取得
   * @returns 画像一覧
   */
  async getUploadedImages(): Promise<ApiResponse<UploadedImage[]>> {
    await this.initialize()

    const configStore = useConfigStore()
    const uploadApiUrl = configStore.uploadApiUrl

    console.log('[ApiService] Getting uploaded images list')

    return await errorHandler.executeWithRetry(
      async () => {
        const response = await this.client!.get(`${uploadApiUrl}/images`)

        console.log('[ApiService] Uploaded images list obtained successfully')

        return {
          success: true,
          data: response.data,
        }
      },
      {
        context: {
          operation: 'getUploadedImages',
          uploadApiUrl,
        },
        maxAttempts: 3,
      }
    )
  }

  /**
   * ファイルをアップロード
   * @param file アップロードするファイル
   * @param onProgress 進捗コールバック
   * @returns アップロード結果
   */
  async uploadImage(file: File, onProgress?: (progress: number) => void): Promise<ApiResponse<UploadedImage>> {
    console.log('[ApiService] Starting image upload:', file.name)

    try {
      // 1. 署名付きURLを取得
      const presignedResponse = await this.getPresignedUploadUrl({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      })

      if (!presignedResponse.success || !presignedResponse.data) {
        throw new Error('Failed to get presigned URL')
      }

      // 2. S3にアップロード
      await this.uploadFileToS3(file, presignedResponse.data, onProgress)

      // 3. アップロード完了後の画像情報を返す
      const uploadedImage: UploadedImage = {
        id: this.generateImageId(),
        fileName: file.name,
        fileSize: file.size,
        uploadDate: new Date().toISOString(),
        fullUrl: presignedResponse.data.fileUrl || '',
      }

      console.log('[ApiService] Image upload completed successfully')

      return {
        success: true,
        data: uploadedImage,
      }
    } catch (error: any) {
      console.error('[ApiService] Image upload failed:', error)
      throw error
    }
  }

  /**
   * アップロード済み画像を削除
   * @param imageId 画像ID
   * @returns 削除結果
   */
  async deleteUploadedImage(imageId: string): Promise<ApiResponse<void>> {
    await this.initialize()

    const configStore = useConfigStore()
    const uploadApiUrl = configStore.uploadApiUrl

    console.log('[ApiService] Deleting uploaded image:', imageId)

    return await errorHandler.executeWithRetry(
      async () => {
        await this.client!.delete(`${uploadApiUrl}/images/${imageId}`)

        console.log('[ApiService] Image deleted successfully')

        return {
          success: true,
        }
      },
      {
        context: {
          operation: 'deleteUploadedImage',
          imageId,
          uploadApiUrl,
        },
        maxAttempts: 2,
      }
    )
  }

  /**
   * ファイルをS3にアップロード
   * @param file アップロードするファイル
   * @param presignedData 署名付きURL情報
   * @param onProgress 進捗コールバック
   * @returns アップロード結果
   */
  private async uploadFileToS3(
    file: File, 
    presignedData: any, 
    onProgress?: (progress: number) => void
  ): Promise<void> {
    console.log('[ApiService] Uploading file to S3:', file.name)

    return await errorHandler.executeWithRetry(
      async () => {
        try {
          const formData = new FormData()

          // 署名付きURLのフィールドを追加
          if (presignedData.fields) {
            Object.keys(presignedData.fields).forEach(key => {
              formData.append(key, presignedData.fields[key])
            })
          }

          // ファイルを最後に追加
          formData.append('file', file)

          await axios.post(presignedData.url, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
              if (onProgress && progressEvent.total) {
                const percentCompleted = Math.round(
                  (progressEvent.loaded * 100) / progressEvent.total
                )
                onProgress(percentCompleted)
              }
            },
          })

          console.log('[ApiService] File uploaded to S3 successfully')
        } catch (error: any) {
          if (error.response?.status === 403) {
            throw new ValidationError(
              'ファイルのアップロード権限がありません',
              {
                fileName: file.name,
                fileSize: file.size,
                responseData: error.response?.data,
              }
            )
          }

          throw error
        }
      },
      {
        context: {
          operation: 'uploadFileToS3',
          fileName: file.name,
          fileSize: file.size,
          presignedUrl: presignedData.url,
        },
        maxAttempts: 2,
      }
    )
  }

  /**
   * ヘルスチェック
   * @returns APIが利用可能かどうか
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize()

      // 簡単なテスト画像合成でヘルスチェック
      const response = await this.generateComposite({
        image1: { url: 'test', position: { x: 0, y: 0 } },
        image2: { url: 'test', position: { x: 100, y: 100 } },
        outputFormat: 'png'
      })

      return response.success
    } catch (error) {
      console.warn('[ApiService] Health check failed:', error)
      return false
    }
  }

  /**
   * 合成パラメータを構築
   * @param request 合成リクエスト
   * @returns URLパラメータ
   */
  private buildCompositeParams(request: CompositeRequest): Record<string, any> {
    const params: Record<string, any> = {
      image1: request.image1.url,
      image1_x: request.image1.position.x,
      image1_y: request.image1.position.y,
      image2: request.image2.url,
      image2_x: request.image2.position.x,
      image2_y: request.image2.position.y,
      format: request.outputFormat || 'png',
    }

    // オプションパラメータ
    if (request.image1.opacity !== undefined) {
      params.image1_opacity = request.image1.opacity
    }
    if (request.image1.scale !== undefined) {
      params.image1_scale = request.image1.scale
    }
    if (request.image1.rotation !== undefined) {
      params.image1_rotation = request.image1.rotation
    }

    if (request.image2.opacity !== undefined) {
      params.image2_opacity = request.image2.opacity
    }
    if (request.image2.scale !== undefined) {
      params.image2_scale = request.image2.scale
    }
    if (request.image2.rotation !== undefined) {
      params.image2_rotation = request.image2.rotation
    }

    // 3番目の画像
    if (request.image3) {
      params.image3 = request.image3.url
      params.image3_x = request.image3.position.x
      params.image3_y = request.image3.position.y

      if (request.image3.opacity !== undefined) {
        params.image3_opacity = request.image3.opacity
      }
      if (request.image3.scale !== undefined) {
        params.image3_scale = request.image3.scale
      }
      if (request.image3.rotation !== undefined) {
        params.image3_rotation = request.image3.rotation
      }
    }

    // キャンバスサイズ
    if (request.canvasSize) {
      params.canvas_width = request.canvasSize.width
      params.canvas_height = request.canvasSize.height
    }

    return params
  }

  /**
   * レスポンスから処理時間を抽出
   * @param response Axiosレスポンス
   * @returns 処理時間（ミリ秒）
   */
  private extractProcessingTime(response: AxiosResponse): number {
    // X-Processing-Timeヘッダーから取得
    const processingTime = response.headers['x-processing-time']
    if (processingTime) {
      return parseFloat(processingTime)
    }

    // デフォルト値
    return 0
  }

  /**
   * 画像IDを生成
   * @returns ユニークな画像ID
   */
  private generateImageId(): string {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// シングルトンインスタンス
export const apiService = new ApiService()

export default apiService