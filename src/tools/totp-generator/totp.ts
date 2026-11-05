/**
 * TOTP 验证器纯逻辑层（0 依赖，RFC 6238 + RFC 4648 自实现）。
 *
 * 口径与术语见 CONTEXT.md：
 * - TOTP 验证器：基于 RFC 6238 生成时序一次性验证码；条目参数独立（算法/位数/周期）；
 * - 时效码（Time-Based Code）：时间驱动的「生成类非实时」显式豁免对象——参数变更立即重算；
 * - 记住条目（Remembered Entry）：显式 opt-in 本地持久化，明文存储 + 常驻警示 + 一键清除。
 *
 * WebCrypto HMAC（SHA-1/SHA-256/SHA-512 原生）+ 自写 base32 解码（RFC 4648，
 * 容错：去空白/连字符、大小写、缺省 padding）+ 动态截断。
 */

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export const ALGORITHMS: TotpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512']
export const DIGITS_OPTIONS = [6, 8] as const
export const PERIOD_OPTIONS = [30, 60] as const
export const DEFAULT_ALGORITHM: TotpAlgorithm = 'SHA1'
export const DEFAULT_DIGITS = 6
export const DEFAULT_PERIOD = 30

const HASH_NAMES: Record<TotpAlgorithm, 'SHA-1' | 'SHA-256' | 'SHA-512'> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
}

// ---- base32（RFC 4648，容错解码） ----

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export interface Base32DecodeResult {
  ok: boolean
  bytes: Uint8Array
  /** 非法字符（去空白/连字符并大写化后仍不在 A–Z2–7 内的字符），定位报错用。 */
  invalidChars: string[]
}

/**
 * base32 容错解码：自动去空白/连字符，大小写容错，缺省 padding 容错。
 * 非法字符收集返回（该处错误，不整段拒绝）。
 */
export function decodeBase32(input: string): Base32DecodeResult {
  const cleaned = input.replace(/[\s-]/g, '').replace(/=/g, '').toUpperCase()
  const invalidChars: string[] = []
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) {
      if (!invalidChars.includes(ch)) invalidChars.push(ch)
      continue
    }
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return { ok: invalidChars.length === 0 && out.length > 0, bytes: new Uint8Array(out), invalidChars }
}

/** base32 编码（otpauth:// URI 导出用，无 padding）。 */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

// ---- TOTP 核心（RFC 6238） ----

export function counterAt(unixSeconds: number, period: number): number {
  return Math.floor(unixSeconds / period)
}

/** 当前窗口剩余秒数（t=0..period-1 → remaining = period - t%period；边界处瞬间换码）。 */
export function remainingSeconds(unixSeconds: number, period: number): number {
  return period - (Math.floor(unixSeconds) % period)
}

/** HOTP 动态截断（RFC 4226 §5.3）+ 模 10^digits。 */
export async function hotp(
  secretBytes: Uint8Array,
  counter: number,
  algorithm: TotpAlgorithm,
  digits: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes as BufferSource,
    { name: 'HMAC', hash: HASH_NAMES[algorithm] },
    false,
    ['sign'],
  )
  // 8 字节大端计数器（64 位拆高低 32 位）
  const message = new Uint8Array(8)
  const view = new DataView(message.buffer)
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  const offset = mac[mac.length - 1]! & 0x0f
  const binary =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!
  return String(binary % 10 ** digits).padStart(digits, '0')
}

/** TOTP = HOTP(counter = floor(unixSeconds / period))。 */
export async function generateTotp(params: {
  secretBytes: Uint8Array
  unixSeconds: number
  algorithm?: TotpAlgorithm
  digits?: number
  period?: number
}): Promise<string> {
  const algorithm = params.algorithm ?? DEFAULT_ALGORITHM
  const digits = params.digits ?? DEFAULT_DIGITS
  const period = params.period ?? DEFAULT_PERIOD
  return hotp(params.secretBytes, counterAt(params.unixSeconds, period), algorithm, digits)
}

// ---- otpauth:// URI ----

/** 条目类型：TOTP（时间驱动）或 HOTP（计数器驱动，见 CONTEXT.md「计数器驱动」）。 */
export type OtpauthType = 'totp' | 'hotp'

export interface OtpauthParams {
  issuer: string
  account: string
  /** 规范化 base32 secret（大写、无空白/连字符、无 padding）。 */
  secret: string
  algorithm: TotpAlgorithm
  digits: number
  period: number
  /** 'hotp' 时携带；缺省视为 'totp'（与既有调用方/旧存储兼容）。 */
  type?: OtpauthType
  /** HOTP 条目当前计数器；type='hotp' 时有意义。 */
  counter?: number
}

export type OtpauthParseError =
  | 'not-otpauth'
  | 'no-secret'
  | 'invalid-secret'
  | 'invalid-params'
  | 'no-counter'
  | 'invalid-counter'

export type OtpauthParseResult =
  | { ok: true; params: OtpauthParams }
  | { ok: false; reason: OtpauthParseError }

/**
 * otpauth:// URI 整段解析：issuer 取 query `issuer=` 优先、label 前缀 `Issuer:account` 兜底；
 * algorithm/digits/period 带入并校验（SHA1|SHA256|SHA512 / 6|8 / 30|60），非法参数整条报错。
 * `otpauth://hotp/` 为计数器条目：counter 必填（缺失 no-counter、非法 invalid-counter），
 * period 对 HOTP 无意义（出现也忽略）。
 */
export function parseOtpauthUri(uri: string): OtpauthParseResult {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return { ok: false, reason: 'not-otpauth' }
  }
  if (url.protocol !== 'otpauth:' || (url.host !== 'totp' && url.host !== 'hotp')) {
    return { ok: false, reason: 'not-otpauth' }
  }
  const type: OtpauthType = url.host === 'hotp' ? 'hotp' : 'totp'
  // label：decodeURIComponent 容错（未编码的冒号也接受）
  let label = ''
  try {
    label = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  } catch {
    label = url.pathname.replace(/^\/+/, '')
  }
  const colon = label.indexOf(':')
  const labelIssuer = colon > -1 ? label.slice(0, colon).trim() : ''
  const account = colon > -1 ? label.slice(colon + 1).trim() : label.trim()
  if (account.length === 0) return { ok: false, reason: 'invalid-params' }

  const issuer = (url.searchParams.get('issuer') ?? labelIssuer).trim()
  const secretRaw = url.searchParams.get('secret') ?? ''
  if (secretRaw.length === 0) return { ok: false, reason: 'no-secret' }
  const decoded = decodeBase32(secretRaw)
  if (!decoded.ok) return { ok: false, reason: 'invalid-secret' }

  const algorithm = normalizeAlgorithm(url.searchParams.get('algorithm'))
  if (url.searchParams.get('algorithm') && algorithm === null) return { ok: false, reason: 'invalid-params' }
  const digits = normalizeDigits(url.searchParams.get('digits'))
  if (url.searchParams.get('digits') !== null && digits === null) return { ok: false, reason: 'invalid-params' }
  const period = normalizePeriod(url.searchParams.get('period'))
  if (url.searchParams.get('period') !== null && period === null) return { ok: false, reason: 'invalid-params' }

  let counter: number | undefined
  if (type === 'hotp') {
    const counterRaw = url.searchParams.get('counter')
    if (counterRaw === null) return { ok: false, reason: 'no-counter' }
    const normalized = normalizeHotpCounterInput(counterRaw)
    if (!normalized.ok) return { ok: false, reason: 'invalid-counter' }
    counter = normalized.value
  }

  return {
    ok: true,
    params: {
      issuer,
      account,
      secret: encodeBase32(decoded.bytes),
      algorithm: algorithm ?? DEFAULT_ALGORITHM,
      digits: digits ?? DEFAULT_DIGITS,
      period: period ?? DEFAULT_PERIOD,
      // totp 结果保持既有六字段形状（type/counter 仅 hotp 携带，缺省即 totp）
      ...(type === 'hotp' ? { type, counter } : {}),
    },
  }
}

/** 生成 otpauth:// URI（QR 展示/复制迁移用）。HOTP 形态带 counter、不带 period。 */
export function buildOtpauthUri(params: OtpauthParams): string {
  const label = params.issuer ? `${params.issuer}:${params.account}` : params.account
  const query = new URLSearchParams({
    secret: params.secret,
  })
  if (params.issuer) query.set('issuer', params.issuer)
  query.set('algorithm', params.algorithm)
  query.set('digits', String(params.digits))
  if (params.type === 'hotp') {
    query.set('counter', String(params.counter ?? 0))
    return `otpauth://hotp/${encodeURIComponent(label)}?${query.toString()}`
  }
  query.set('period', String(params.period))
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`
}

/** counter 手输/URI 参数校验：非负整数（≤ MAX_SAFE_INTEGER），其余拒绝。 */
export function normalizeHotpCounterInput(raw: string): { ok: true; value: number } | { ok: false } {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return { ok: false }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) return { ok: false }
  return { ok: true, value }
}

/**
 * 步进口径：返回 counter+1 的**下一个值**，不改原条目——步进只能是用户的显式动作
 * （按钮点击后由调用方赋值），自动步进是失步事故之源（CONTEXT.md「计数器驱动」_Avoid_）。
 */
export function advanceHotpCounter(entry: { counter?: number }): number {
  return (entry.counter ?? 0) + 1
}

/** 粘码校验：精确匹配当前 counter（无 ±1 窗口——窗口重同步出界）；粘贴空白容错。 */
export async function verifyHotpCode(
  secretBytes: Uint8Array,
  counter: number,
  algorithm: TotpAlgorithm,
  digits: number,
  code: string,
): Promise<boolean> {
  const expected = await hotp(secretBytes, counter, algorithm, digits)
  return code.trim() === expected
}

function normalizeAlgorithm(raw: string | null): TotpAlgorithm | null {
  if (raw === null) return null
  const upper = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return (ALGORITHMS as string[]).includes(upper) ? (upper as TotpAlgorithm) : null
}

function normalizeDigits(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  return (DIGITS_OPTIONS as readonly number[]).includes(n) ? n : null
}

function normalizePeriod(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  return (PERIOD_OPTIONS as readonly number[]).includes(n) ? n : null
}

// ---- 条目模型与持久化（记住条目 opt-in） ----

export interface TotpEntry {
  id: string
  issuer: string
  account: string
  /** 规范化 base32 secret（大写、无空白、无 padding）。 */
  secret: string
  algorithm: TotpAlgorithm
  digits: number
  period: number
  /** 记住条目：显式 opt-in 明文本地持久化。 */
  remember: boolean
  /** 'hotp' 为计数器驱动条目；缺省 'totp'（旧存储/既有调用方兼容）。 */
  type?: OtpauthType
  /** HOTP 条目当前计数器（计数器驱动：变更即重算、绝不自动步进）。 */
  counter?: number
}

/** 条目标识口径：issuer + 账户名（缺一侧不出现悬空分隔符）。 */
export function entryLabel(entry: Pick<TotpEntry, 'issuer' | 'account'>): string {
  return [entry.issuer.trim(), entry.account.trim()]
    .filter((part) => part.length > 0)
    .join(' · ')
}

export const STORAGE_KEY = 'forgex.totp.remembered'

/** 读取已记住条目（localStorage 明文；坏数据一律丢弃不抛错）。 */
export function loadRememberedEntries(): TotpEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const entries: TotpEntry[] = []
    for (const item of parsed) {
      const entry = normalizeStoredEntry(item)
      if (entry) entries.push(entry)
    }
    return entries
  } catch {
    return []
  }
}

/** opt-in 持久化：仅 remember=true 的条目入库（HOTP 条目连带 type/counter）。 */
export function saveRememberedEntries(entries: TotpEntry[]): void {
  const remembered = entries
    .filter((e) => e.remember)
    .map(({ id, issuer, account, secret, algorithm, digits, period, remember, type, counter }) => ({
      id,
      issuer,
      account,
      secret,
      algorithm,
      digits,
      period,
      remember,
      ...(type === 'hotp' ? { type, counter: counter ?? 0 } : {}),
    }))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered))
  } catch {
    // 存储不可用（隐私模式等）：静默降级为会话内有效
  }
}

/** 清除全部已记住条目（一键出口）。 */
export function clearRememberedEntries(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}

function normalizeStoredEntry(item: unknown): TotpEntry | null {
  if (typeof item !== 'object' || item === null) return null
  const e = item as Record<string, unknown>
  if (typeof e.secret !== 'string' || e.secret.length === 0) return null
  const decoded = decodeBase32(e.secret)
  if (!decoded.ok) return null
  const type: OtpauthType = e.type === 'hotp' ? 'hotp' : 'totp'
  const counterNormalized =
    type === 'hotp' && typeof e.counter === 'number' && Number.isSafeInteger(e.counter) && e.counter >= 0
      ? e.counter
      : type === 'hotp'
        ? 0
        : undefined
  return {
    id: typeof e.id === 'string' ? e.id : newEntryId(),
    issuer: typeof e.issuer === 'string' ? e.issuer : '',
    account: typeof e.account === 'string' ? e.account : '',
    secret: e.secret,
    algorithm: normalizeAlgorithm(typeof e.algorithm === 'string' ? e.algorithm : null) ?? DEFAULT_ALGORITHM,
    digits: normalizeDigits(typeof e.digits === 'number' ? String(e.digits) : null) ?? DEFAULT_DIGITS,
    period: normalizePeriod(typeof e.period === 'number' ? String(e.period) : null) ?? DEFAULT_PERIOD,
    remember: true,
    type,
    ...(type === 'hotp' ? { counter: counterNormalized } : {}),
  }
}

/** 条目 id（会话内唯一即可，crypto 随机）。 */
export function newEntryId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
