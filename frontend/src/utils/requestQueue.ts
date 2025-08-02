/**
 * リクエストキューイングシステム - v2.4.0
 * 同時リクエスト制限とパフォーマンス最適化
 */

interface QueuedRequest {
  id: string;
  request: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: number;
  timestamp: number;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private activeRequests = new Set<string>();
  private maxConcurrentRequests: number;
  private requestCounter = 0;

  constructor(maxConcurrentRequests = 3) {
    this.maxConcurrentRequests = maxConcurrentRequests;
  }

  /**
   * リクエストをキューに追加
   * @param request 実行するリクエスト関数
   * @param priority 優先度（高いほど先に実行）
   * @returns Promise
   */
  async enqueue<T>(
    request: () => Promise<T>,
    priority = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestCounter}_${Date.now()}`
      
      const queuedRequest: QueuedRequest = {
        id,
        request,
        resolve,
        reject,
        priority,
        timestamp: Date.now(),
      }

      // 優先度順でキューに挿入
      const insertIndex = this.queue.findIndex(
        item => item.priority < priority
      )
      
      if (insertIndex === -1) {
        this.queue.push(queuedRequest)
      } else {
        this.queue.splice(insertIndex, 0, queuedRequest)
      }

      console.log(`[RequestQueue] Enqueued request ${id}, queue size: ${this.queue.length}`)
      
      // キューを処理
      this.processQueue()
    })
  }

  /**
   * キューを処理
   */
  private async processQueue(): Promise<void> {
    // 同時実行数の制限をチェック
    if (this.activeRequests.size >= this.maxConcurrentRequests) {
      console.log(`[RequestQueue] Max concurrent requests reached (${this.maxConcurrentRequests})`)
      return
    }

    // キューが空の場合は何もしない
    if (this.queue.length === 0) {
      return
    }

    // 次のリクエストを取得
    const queuedRequest = this.queue.shift()!
    this.activeRequests.add(queuedRequest.id)

    console.log(`[RequestQueue] Processing request ${queuedRequest.id}, active: ${this.activeRequests.size}`)

    try {
      // リクエストを実行
      const result = await queuedRequest.request()
      queuedRequest.resolve(result)
    } catch (error) {
      console.error(`[RequestQueue] Request ${queuedRequest.id} failed:`, error)
      queuedRequest.reject(error)
    } finally {
      // アクティブリクエストから削除
      this.activeRequests.delete(queuedRequest.id)
      
      console.log(`[RequestQueue] Completed request ${queuedRequest.id}, active: ${this.activeRequests.size}`)
      
      // 次のリクエストを処理
      setTimeout(() => this.processQueue(), 10)
    }
  }

  /**
   * キューの状態を取得
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      activeRequests: this.activeRequests.size,
      maxConcurrentRequests: this.maxConcurrentRequests,
      totalProcessed: this.requestCounter,
    }
  }

  /**
   * キューをクリア
   */
  clear() {
    // 待機中のリクエストをキャンセル
    this.queue.forEach(request => {
      request.reject(new Error('Request queue cleared'))
    })
    
    this.queue = []
    console.log('[RequestQueue] Queue cleared')
  }

  /**
   * 最大同時実行数を設定
   */
  setMaxConcurrentRequests(max: number) {
    this.maxConcurrentRequests = Math.max(1, max)
    console.log(`[RequestQueue] Max concurrent requests set to ${this.maxConcurrentRequests}`)
    
    // 新しい制限に基づいてキューを処理
    this.processQueue()
  }

  /**
   * 古いリクエストをタイムアウト
   */
  cleanupOldRequests(maxAge = 300000) { // 5分
    const now = Date.now()
    const initialLength = this.queue.length
    
    this.queue = this.queue.filter(request => {
      const age = now - request.timestamp
      if (age > maxAge) {
        request.reject(new Error('Request timeout'))
        return false
      }
      return true
    })
    
    const removed = initialLength - this.queue.length
    if (removed > 0) {
      console.log(`[RequestQueue] Cleaned up ${removed} old requests`)
    }
  }
}

// シングルトンインスタンス
export const requestQueue = new RequestQueue(3)

// 定期的なクリーンアップ
setInterval(() => {
  requestQueue.cleanupOldRequests()
}, 60000) // 1分ごと

export default requestQueue