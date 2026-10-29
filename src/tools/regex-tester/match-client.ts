/**
 * 主线程 Worker 生命周期管理（ReDoS 防护的主防线）。
 *
 * 规格约定：每次运行重建 Worker；单次运行上限 1.5s，超时即 `terminate`
 * 并以 timedOut 响应收尾，页面保持可交互。运行中收到新请求时旧 Worker
 * 直接废弃（dispose），保证任何时刻至多一个 Worker 在跑。
 *
 * 依赖浏览器 Worker，不做 node 自动化测试；其终止语义的可测部分
 * （引擎内超时自查、timeoutResponse 形态）在 regex-engine.spec.ts 覆盖。
 */
import { TIMEOUT_MS, timeoutResponse } from './regex-engine'
import type { MatchRequest, MatchResponse } from './regex-engine'

export class MatchClient {
  private worker: Worker | null = null
  private timer: number | undefined
  private runId = 0

  /** 发起一次运行。onResult 至多回调一次，且仅对最新一次运行生效。 */
  run(req: MatchRequest, onResult: (res: MatchResponse) => void): void {
    this.dispose()
    const id = ++this.runId

    const finish = (res: MatchResponse): void => {
      if (id !== this.runId) return // 已被更新的运行取代
      this.dispose()
      onResult(res)
    }

    let worker: Worker
    try {
      worker = new Worker(new URL('./match.worker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      finish({ ...timeoutResponse(), timedOut: false, durationMs: 0, error: describeError(e) })
      return
    }
    this.worker = worker

    // 主防线：1.5s 未响应即 terminate（灾难性回溯时不惜代价止损）
    this.timer = window.setTimeout(() => finish(timeoutResponse()), TIMEOUT_MS)

    worker.onmessage = (e: MessageEvent<MatchResponse>) => finish(e.data)
    worker.onerror = (e: ErrorEvent) =>
      finish({ ...timeoutResponse(), timedOut: false, durationMs: 0, error: e.message || 'Worker error' })

    worker.postMessage(req)
  }

  /** 终止当前 Worker 并清掉计时器；空模式等待态与组件卸载时调用。 */
  dispose(): void {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer)
      this.timer = undefined
    }
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
