/**
 * bcrypt Worker 薄壳：只做「收消息 → handleBcryptRequest → 回消息」。
 *
 * bcryptjs 在 Worker 内 dynamic import（首用加载，主线程零阻塞）；
 * 真正的编排逻辑全部在 bcrypt.ts（可单测）；本文件不做自动化测试
 * （node 环境无 Worker）。bcrypt 计算语义为显式动作且工作因子即开销，
 * 不设超时终止——慢是特性（工作因子语义），不同于 ReDoS 防护的止损语义。
 */
import { handleBcryptRequest } from './bcrypt'
import type { BcryptRequest, BcryptResponse } from './bcrypt'

// 不引入 webworker lib：用最小结构描述 DedicatedWorkerGlobalScope 的所需面
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<BcryptRequest>) => void) | null
  postMessage: (msg: BcryptResponse) => void
}

ctx.onmessage = (e: MessageEvent<BcryptRequest>) => {
  void handleBcryptRequest(e.data).then((res) => ctx.postMessage(res))
}
