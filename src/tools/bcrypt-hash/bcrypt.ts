/**
 * bcrypt 哈希/校验纯逻辑层（Worker 与单测共用）。
 *
 * 口径与术语见 CONTEXT.md：
 * - 工作因子（Cost Factor）：计算轮数为 2^工作因子，工具内范围 4–15，默认 10；
 * - 截断语义（Truncation Semantics）：bcrypt 只运算密码的前 72 字节（UTF-8），
 *   超出部分静默忽略——工具警示但按截断继续执行，绝不拒绝；
 * - 校验三态：匹配 / 不匹配 / 格式非法。
 *
 * bcryptjs ≈9.2 KB gzip，一律 dynamic import（首屏第三方增量 0）。
 * 本模块被 Worker 引入，也在 node 单测中直接运行（bcryptjs 为纯 JS）。
 */

/** 工作因子允许范围（bcrypt 理论 4–31，浏览器体验上限取 15 ≈ 秒级）。 */
export const MIN_COST = 4
export const MAX_COST = 15
export const DEFAULT_COST = 10
/** 超过该值提示「约秒级耗时」（cost 13 起体感明显变慢）。 */
export const SLOW_COST_THRESHOLD = 12

/** bcrypt 截断语义：仅前 72 字节参与运算。 */
export const BCRYPT_MAX_BYTES = 72

/** 输出为完整 60 字符 modular crypt 格式。 */
export const HASH_LENGTH = 60

/**
 * bcrypt modular crypt 格式（含 $2a/$2b/$2y 三前缀，PHP password_hash 产 $2y$）：
 * `$2a$` + 2 位工作因子 + 22 字符 salt + 31 字符摘要（base64 变体字符集 [./A-Za-z0-9]）。
 */
export const BCRYPT_HASH_RE = /^\$2[aby]\$(\d{2})\$([./A-Za-z0-9]{22})([./A-Za-z0-9]{31})$/

/** 哈希结构解析四段：前缀 / 工作因子 / salt / 摘要。 */
export interface BcryptSegments {
  prefix: string
  cost: string
  salt: string
  digest: string
}

/** 合法哈希拆解四段；非法格式返回 null（不拆解，呈「格式非法」态）。 */
export function parseBcryptHash(hash: string): BcryptSegments | null {
  const m = BCRYPT_HASH_RE.exec(hash)
  if (!m) return null
  return { prefix: m[0].slice(0, 4), cost: m[1]!, salt: m[2]!, digest: m[3]! }
}

/** 格式校验：60 字符正则判定（含 $2a/$2b/$2y 前缀）。 */
export function isBcryptFormat(hash: string): boolean {
  return BCRYPT_HASH_RE.test(hash)
}

/** UTF-8 字节长度（截断警示口径）。 */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** 超过 72 字节即触发警示（警示但不拒绝，与真实服务端行为一致）。 */
export function exceedsTruncationLimit(text: string): boolean {
  return utf8ByteLength(text) > BCRYPT_MAX_BYTES
}

/**
 * 截断语义的字符串呈现：按 UTF-8 字节截到前 72 字节，不拆散多字节字符。
 * 仅用于展示与测试口径；实际哈希/校验把原文交给 bcryptjs，
 * 由库在字节层静默截断——与服务端（OpenBSD/PHP）行为一致。
 */
export function truncateTo72Bytes(text: string): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= BCRYPT_MAX_BYTES) return text
  let end = BCRYPT_MAX_BYTES
  // 回退到不拆散 UTF-8 序列的边界（续字节为 0b10xxxxxx）
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--
  return new TextDecoder().decode(bytes.slice(0, end))
}

/** 校验三态。 */
export type VerifyStatus = 'match' | 'mismatch' | 'invalid-format'

export function clampCost(cost: number): number {
  return Math.min(MAX_COST, Math.max(MIN_COST, Math.round(cost)))
}

// ---- bcryptjs 操作（dynamic import；Worker 内调用） ----

type BcryptjsModule = typeof import('bcryptjs')

let bcryptModule: BcryptjsModule | null = null

/** 库默认前缀（v3 产 $2b$），不提供前缀切换选项。 */
async function loadBcrypt(): Promise<BcryptjsModule> {
  if (!bcryptModule) {
    bcryptModule = await import('bcryptjs')
  }
  return bcryptModule
}

/** 生成哈希：库默认前缀、60 字符输出、内部随机 salt。 */
export async function hashPassword(password: string, cost: number): Promise<string> {
  const lib = await loadBcrypt()
  return lib.hash(password, clampCost(cost))
}

/** 校验：先做格式正则判定（非法直接三态之 invalid-format），再进库比对。 */
export async function verifyPassword(password: string, hash: string): Promise<VerifyStatus> {
  if (!isBcryptFormat(hash)) return 'invalid-format'
  const lib = await loadBcrypt()
  const ok = await lib.compare(password, hash)
  return ok ? 'match' : 'mismatch'
}

// ---- Worker 协议 ----

export type BcryptHashInput = { kind: 'hash'; password: string; cost: number }
export type BcryptVerifyInput = { kind: 'verify'; password: string; hash: string }
export type BcryptRequest = (BcryptHashInput | BcryptVerifyInput) & { id: number }

export type BcryptResponse =
  | { id: number; kind: 'hash'; ok: true; hash: string }
  | { id: number; kind: 'hash'; ok: false; error: string }
  | { id: number; kind: 'verify'; ok: true; status: VerifyStatus }
  | { id: number; kind: 'verify'; ok: false; error: string }

/** Worker 编排入口：收请求 → 执行 → 回响应（薄壳 Worker 调用此处）。 */
export async function handleBcryptRequest(req: BcryptRequest): Promise<BcryptResponse> {
  try {
    if (req.kind === 'hash') {
      return { id: req.id, kind: 'hash', ok: true, hash: await hashPassword(req.password, req.cost) }
    }
    return {
      id: req.id,
      kind: 'verify',
      ok: true,
      status: await verifyPassword(req.password, req.hash),
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    if (req.kind === 'hash') {
      return { id: req.id, kind: 'hash', ok: false, error }
    }
    return { id: req.id, kind: 'verify', ok: false, error }
  }
}
