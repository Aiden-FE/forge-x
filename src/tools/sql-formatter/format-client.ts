/**
 * 主线程 Worker 生命周期管理（正则测试器 MatchClient 先例）。
 *
 * 规格约定：一律 Worker 执行（依赖随 Worker dynamic import），300ms 实时防抖在
 * 组件层完成；本层保证任何时刻至多一个 Worker 在跑——运行中收到新请求时旧 Worker
 * 直接废弃（dispose），结果只回给最新一次运行。
 *
 * 防看门狗阙值：格式化是确定性 CPU 任务（1 MiB < 2s 为手动验收项），10s 未响应
 * 视为异常，以错误态收尾并保持页面可交互。依赖浏览器 Worker，不做 node 自动化测试。
 */
import type { SqlFormatOutcome, SqlFormatRequest } from './sqlEngine'

/** 超时上限：远超 1 MiB 输入的 2s 预期，仅兜底异常挂起。 */
export const WATCHDOG_MS = 10_000

const timeoutOutcome: SqlFormatOutcome = { ok: false, error: 'formatting timeout' }

export class FormatClient {
  private worker: Worker | null = null
  private timer: number | undefined
  private runId = 0

  /** 发起一次运行。onResult 至多回调一次，且仅对最新一次运行生效。 */
  run(req: SqlFormatRequest, onResult: (res: SqlFormatOutcome) => void): void {
    this.dispose()
    const id = ++this.runId

    const finish = (res: SqlFormatOutcome): void => {
      if (id !== this.runId) return // 已被更新的运行取代
      this.dispose()
      onResult(res)
    }

    let worker: Worker
    try {
      worker = new Worker(new URL('./format.worker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      finish({ ok: false, error: e instanceof Error ? e.message : String(e) })
      return
    }
    this.worker = worker

    this.timer = window.setTimeout(() => finish(timeoutOutcome), WATCHDOG_MS)

    worker.onmessage = (e: MessageEvent<SqlFormatOutcome>) => finish(e.data)
    worker.onerror = (e: ErrorEvent) => finish({ ok: false, error: e.message || 'Worker error' })

    worker.postMessage(req)
  }

  /** 终止当前 Worker 并清掉计时器；组件卸载时调用。 */
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
