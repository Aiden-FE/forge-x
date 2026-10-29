/**
 * 匹配 Worker 薄壳：只做「收消息 → executeRequest → 回消息」。
 *
 * 真正的编排逻辑（构建 RegExp、执行循环、分组收集、上限判断、替换预览）
 * 全部在 regex-engine.ts（可单测）；本文件不做自动化测试（node 环境无 Worker）。
 * ReDoS 兜底在主线程：1.5s 未响应即 terminate 并重建（见 match-client.ts）。
 */
import { executeRequest } from './regex-engine'
import type { MatchRequest, MatchResponse } from './regex-engine'

// 不引入 webworker lib：用最小结构描述 DedicatedWorkerGlobalScope 的所需面
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<MatchRequest>) => void) | null
  postMessage: (msg: MatchResponse) => void
}

ctx.onmessage = (e: MessageEvent<MatchRequest>) => {
  ctx.postMessage(executeRequest(e.data))
}
