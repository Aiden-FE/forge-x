/**
 * 主线程 Worker 生命周期管理（bcrypt 哈希/校验的 promise 化调用）。
 *
 * 与正则测试器不同：bcrypt 慢是特性（工作因子即故意设计的计算开销），
 * 不设超时终止；单 Worker 常驻，bcryptjs 只在 Worker 内 dynamic import 一次。
 * 组件卸载 dispose 后未决 promise 一律 reject；调用方以自身 job 计数
 * 丢弃过期结果（组件内惯例，同 hash-checksum）。
 */
import type { BcryptHashInput, BcryptRequest, BcryptResponse, BcryptVerifyInput } from './bcrypt'

export class BcryptClient {
  private worker: Worker | null = null
  private pending = new Map<number, (res: BcryptResponse) => void>()
  private nextId = 1

  /** 发起一次运行；resolve 为该请求的响应。 */
  run(req: BcryptHashInput | BcryptVerifyInput): Promise<BcryptResponse> {
    return new Promise((resolve, reject) => {
      let worker: Worker
      try {
        worker = this.ensureWorker()
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
        return
      }
      const id = this.nextId++
      this.pending.set(id, resolve)
      const message: BcryptRequest = { ...req, id }
      worker.postMessage(message)
    })
  }

  /** 终止 Worker；未决调用以 ok:false 错误响应收尾（调用方经 job 计数丢弃）。 */
  dispose(): void {
    for (const resolve of this.pending.values()) {
      resolve({ id: -1, kind: 'hash', ok: false, error: 'disposed' })
    }
    this.pending.clear()
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./bcrypt.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<BcryptResponse>) => {
      const resolve = this.pending.get(e.data.id)
      if (resolve) {
        this.pending.delete(e.data.id)
        resolve(e.data)
      }
    }
    worker.onerror = (e: ErrorEvent) => {
      const error = e.message || 'Worker error'
      for (const resolve of this.pending.values()) {
        resolve({ id: -1, kind: 'hash', ok: false, error })
      }
      this.pending.clear()
    }
    this.worker = worker
    return worker
  }
}
