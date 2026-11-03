/**
 * 格式化 Worker 薄壳：只做「收消息 → formatSql → 回消息」。
 *
 * sql-formatter 依赖随 Worker 的 dynamic import 落入异步块（规格 §0 打包断言：
 * 依赖必须在异步块且 ≤80 KB gzip），主线程零负担。真正的选项组装、错误归一、
 * 边界钳制全部在 sqlEngine.ts（node 可单测）；本文件不做自动化测试（node 无 Worker），
 * 与正则测试器的 Worker 薄壳先例一致。
 */
import { formatSql } from './sqlEngine'
import type { SqlFormatRequest, SqlFormatResponse } from './sqlEngine'

// 不引入 webworker lib：用最小结构描述 DedicatedWorkerGlobalScope 的所需面
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SqlFormatRequest>) => void) | null
  postMessage: (msg: SqlFormatResponse) => void
}

ctx.onmessage = (e: MessageEvent<SqlFormatRequest>) => {
  void formatSql(e.data.input, e.data.options).then((res) => ctx.postMessage(res))
}
