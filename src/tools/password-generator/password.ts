/**
 * 密码生成器纯逻辑：池构造、拒绝采样、理论熵。
 *
 * 术语见 CONTEXT.md：理论熵（Theoretical Entropy）、易混淆字符（Confusable
 * Characters）、生成类非实时（Generators Are Not Live）。
 *
 * 随机源以 `ByteSource` 注入：生产用 `cryptoByteSource`（crypto.getRandomValues），
 * 测试注入确定性序列/PRNG。字符取样一律使用拒绝采样——按池大小截断 256 个字节
 * 值的不完整余数区间，越界值丢弃重采，每字符严格等概率；不使用对原始字节取模的
 * 捷径（存在模偏差）。
 */

/** 字符类标识。符号集为显式常量（全部可打印 ASCII 符号、不含空格，32 字符）。 */
export type CharClassId = 'lower' | 'upper' | 'digits' | 'symbols'

export interface CharClass {
  id: CharClassId
  charset: string
}

export const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
export const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const DIGITS = '0123456789'
export const SYMBOLS = `!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`

/** 易混淆字符：整组排除开关按此集合生效（CONTEXT.md）。 */
export const CONFUSABLE_CHARS = '0OoIl1'

export const CHAR_CLASSES: readonly CharClass[] = [
  { id: 'lower', charset: LOWERCASE },
  { id: 'upper', charset: UPPERCASE },
  { id: 'digits', charset: DIGITS },
  { id: 'symbols', charset: SYMBOLS },
]

export const MIN_LENGTH = 8
export const MAX_LENGTH = 128
export const DEFAULT_LENGTH = 20
export const MIN_COUNT = 1
export const MAX_COUNT = 100
export const COUNT_PRESETS = [1, 5, 10, 20] as const

export interface Policy {
  classes: Record<CharClassId, boolean>
  length: number
  excludeConfusable: boolean
  /** 自定义排除字符（原始输入；解析时去重、忽略空白），与混淆开关叠加。 */
  customExcluded: string
}

export const DEFAULT_POLICY: Policy = {
  classes: { lower: true, upper: true, digits: true, symbols: true },
  length: DEFAULT_LENGTH,
  excludeConfusable: false,
  customExcluded: '',
}

/* ---------- 随机源 ---------- */

/** 请求 count 个随机字节。生产实现必须来自密码学安全随机源。 */
export type ByteSource = (count: number) => Uint8Array

export const cryptoByteSource: ByteSource = (count) =>
  crypto.getRandomValues(new Uint8Array(count))

/* ---------- 池构造 ---------- */

export interface PoolBuild {
  /** 全池（各类有效字符集的并集） */
  pool: string
  /** 每个已开类的有效字符集（保证「每已开类至少一字符」时按类取样用） */
  classPools: Array<{ id: CharClassId; chars: string }>
}

export type PoolError = 'no-class' | 'class-empty'
export type PoolResult = ({ ok: true } & PoolBuild) | { ok: false; error: PoolError }

/** 解析自定义排除输入：唯一字符、忽略空白。 */
export function parseExclusions(input: string): string[] {
  const seen = new Set<string>()
  for (const ch of input) {
    if (/\s/.test(ch)) continue
    seen.add(ch)
  }
  return [...seen]
}

/**
 * 依策略构造字符池。任一已开类的有效池为空（混淆开关 + 自定义排除后）即错误——
 * 此时「每已开类至少一字符」的保证无法满足；全部类关闭同为错误。
 */
export function buildPool(policy: Policy): PoolResult {
  const enabled = CHAR_CLASSES.filter((c) => policy.classes[c.id])
  if (enabled.length === 0) return { ok: false, error: 'no-class' }

  const excluded = new Set(parseExclusions(policy.customExcluded))
  if (policy.excludeConfusable) for (const ch of CONFUSABLE_CHARS) excluded.add(ch)

  const classPools = enabled.map((c) => ({
    id: c.id,
    chars: [...c.charset].filter((ch) => !excluded.has(ch)).join(''),
  }))

  const empty = classPools.find((c) => c.chars.length === 0)
  if (empty) return { ok: false, error: 'class-empty' }

  const pool = classPools.map((c) => c.chars).join('')
  return { ok: true, pool, classPools }
}

/* ---------- 校验 ---------- */

/** 长度必须为 MIN_LENGTH–MAX_LENGTH 的整数；非法返回 null（UI 错误态）。 */
export function validateLength(value: number): number | null {
  if (!Number.isInteger(value)) return null
  if (value < MIN_LENGTH || value > MAX_LENGTH) return null
  return value
}

/** 数量必须为 MIN_COUNT–MAX_COUNT 的整数；非法返回 null（UI 错误态）。 */
export function validateCount(value: number): number | null {
  if (!Number.isInteger(value)) return null
  if (value < MIN_COUNT || value > MAX_COUNT) return null
  return value
}

/* ---------- 拒绝采样 ---------- */

const BYTE_RANGE = 256

/**
 * 从 [0, size) 均匀取整数：丢弃 256 中不完整余数区间的越界字节并重采。
 * size 必须在 1–256（本工具池最大 94，单字节足够）。
 */
export function sampleInt(random: ByteSource, size: number): number {
  const limit = Math.floor(BYTE_RANGE / size) * size
  for (;;) {
    const byte = random(1)[0]!
    if (byte < limit) return byte % size
  }
}

function pickChar(random: ByteSource, chars: string): string {
  return chars[sampleInt(random, chars.length)]!
}

/** Fisher–Yates 原地洗牌（索引同样经拒绝采样，保证均匀）。 */
function shuffle<T>(items: T[], random: ByteSource): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = sampleInt(random, i + 1)
    const tmp = items[i]!
    items[i] = items[j]!
    items[j] = tmp
  }
}

/* ---------- 生成 ---------- */

export type GenerateError = PoolError | 'invalid-length' | 'invalid-count'
export type GenerateResult = { ok: true; passwords: string[] } | { ok: false; error: GenerateError }

/** 生成单行：每已开类先各取一字符（预留位），其余全池取样，最后整体洗牌。 */
function generateOne(build: PoolBuild, length: number, random: ByteSource): string {
  const chars: string[] = []
  for (const cp of build.classPools) chars.push(pickChar(random, cp.chars))
  for (let i = chars.length; i < length; i++) chars.push(pickChar(random, build.pool))
  shuffle(chars, random)
  return chars.join('')
}

export function generatePasswords(
  policy: Policy,
  count: number,
  random: ByteSource = cryptoByteSource,
): GenerateResult {
  const validCount = validateCount(count)
  if (validCount === null) return { ok: false, error: 'invalid-count' }
  const length = validateLength(policy.length)
  if (length === null) return { ok: false, error: 'invalid-length' }

  const build = buildPool(policy)
  if (!build.ok) return build

  const passwords: string[] = []
  for (let i = 0; i < validCount; i++) passwords.push(generateOne(build, length, random))
  return { ok: true, passwords }
}

/* ---------- 理论熵（CONTEXT.md: Theoretical Entropy） ---------- */

/**
 * 理论熵 = 长度 × log₂(池大小)。这是「该密码按构造应有的强度」，
 * 不是对任意口令的经验破解估计。
 */
export function theoreticalEntropy(poolSize: number, length: number): number {
  return length * Math.log2(poolSize)
}

export type StrengthTier = 'weak' | 'medium' | 'strong'

/** 档位边界：<40 弱、40–79.99… 中、≥80 强。 */
export const WEAK_THRESHOLD = 40
export const STRONG_THRESHOLD = 80

export function strengthTier(bits: number): StrengthTier {
  if (bits >= STRONG_THRESHOLD) return 'strong'
  if (bits >= WEAK_THRESHOLD) return 'medium'
  return 'weak'
}
