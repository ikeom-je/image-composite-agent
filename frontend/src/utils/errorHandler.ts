/**
 * エラーハンドリングユーティリティ
 */

interface ErrorContext {
  source?: string
  componentInfo?: string
  instance?: string
  type?: string
  url?: string
  endpoint?: string
}

/**
 * カスタムエラークラス
 */
export class NetworkError extends Error {
  constructor(message: string, public context?: any) {
    super(message)
    this.name = 'NetworkError'
  }
}

export class ServerError extends Error {
  constructor(message: string, public context?: any) {
    super(message)
    this.name = 'ServerError'
  }
}

export class ValidationError extends Error {
  constructor(message: string, public context?: any) {
    super(message)
    this.name = 'ValidationError'
  }
}

interface RetryOptions {
  maxAttempts?: number
  context?: any
}

class ErrorHandler {
  /**
   * エラーを処理する
   */
  handleError(error: any, context: ErrorContext = {}) {
    // コンソールにエラーを出力
    console.error('[ErrorHandler]', {
      error: error,
      context: context,
      timestamp: new Date().toISOString()
    })

    // 開発環境では詳細なエラー情報を表示
    if (import.meta.env.DEV) {
      console.group('[ErrorHandler] Detailed Error Information')
      console.error('Error:', error)
      console.log('Context:', context)
      console.log('Stack:', error?.stack)
      console.groupEnd()
    }

    // 本番環境では必要に応じてエラー報告サービスに送信
    // 例: Sentry, LogRocket, etc.
    if (import.meta.env.PROD) {
      // TODO: エラー報告サービスへの送信実装
    }
  }

  /**
   * ネットワークエラーを処理する
   */
  handleNetworkError(error: any, url?: string) {
    this.handleError(error, {
      source: 'network_error',
      type: 'network',
      url: url
    })
  }

  /**
   * APIエラーを処理する
   */
  handleApiError(error: any, endpoint?: string) {
    this.handleError(error, {
      source: 'api_error',
      type: 'api',
      endpoint: endpoint
    })
  }

  /**
   * リトライ機能付きで関数を実行する
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const { maxAttempts = 3, context = {} } = options
    let lastError: any

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        
        if (attempt === maxAttempts) {
          this.handleError(error, {
            ...context,
            source: 'retry_exhausted',
            attempts: attempt
          })
          throw error
        }

        // リトライ前に少し待機
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }

    throw lastError
  }
}

// シングルトンインスタンスをエクスポート
export default new ErrorHandler()