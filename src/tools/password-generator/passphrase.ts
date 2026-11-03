/**
 * 口令短语 / PIN / 十六进制 生成纯逻辑（零第三方依赖）。
 *
 * 术语见 CONTEXT.md：口令短语（Passphrase，英文词表单语，词数 3–10、
 * 分隔符与大小写档位可调）、理论熵（Theoretical Entropy，词表口径 =
 * log₂(词数^词数)）、生成类非实时（Generators Are Not Live）。
 *
 * 采样惯例与 password.ts 完全同源（均匀 + 拒绝采样）：
 * - 词表 7776 > 256，单字节不够 → `sampleIndex` 以多字节（2 字节 65536）
 *   拒绝采样：丢弃不完整余数区间的越界值后取模，每索引严格等概率；
 * - PIN / Hex 池 ≤ 16，直接复用 password.ts 的 `sampleInt`（单字节）。
 *
 * 词表本身不在此模块 import——数据模块 wordlist.ts 由 UI 在选中 passphrase
 * 模式时 dynamic import（触达加载），生成函数以词表数组注入。
 */

import { cryptoByteSource, sampleInt } from './password'
import type { ByteSource } from './password'

/** 随机源契约沿用 password.ts（重新导出，供生成函数调用方与测试注入）。 */
export type { ByteSource }

/* ---------- 口令短语（passphrase） ---------- */

export const MIN_WORDS = 3
export const MAX_WORDS = 10
export const DEFAULT_WORDS = 4

/** 分隔符档位（默认 `-`）。 */
export const SEPARATORS = ['-', ' ', '.', '_'] as const
export type Separator = (typeof SEPARATORS)[number]
export const DEFAULT_SEPARATOR: Separator = '-'

/** 大小写档位：全小写 / 首字母大写（逐词）。 */
export type PassphraseCase = 'lower' | 'capitalize'

export interface PassphraseOptions {
  words: number
  separator: Separator
  casing: PassphraseCase
}

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  words: DEFAULT_WORDS,
  separator: DEFAULT_SEPARATOR,
  casing: 'lower',
}

/** 词数 3–10 的整数；非法返回 null（UI 错误态）。 */
export function validateWordCount(value: number): number | null {
  if (!Number.isInteger(value)) return null
  if (value < MIN_WORDS || value > MAX_WORDS) return null
  return value
}

/** 首字母大写逐词应用：仅词首字符大写，其余原样（连字符词 t-shirt → T-shirt）。 */
export function capitalizeWord(word: string): string {
  if (word === '') return word
  return word[0]!.toUpperCase() + word.slice(1)
}

/* ---------- 多字节拒绝采样（词表 > 256 需要） ---------- */

const BYTE_MAX_PLUS_ONE = 256

/**
 * 从 [0, size) 均匀取索引：每次请求 2 字节拼成 65536 个等概率值，
 * 丢弃不完整余数区间的越界值并重采（与 password.ts sampleInt 同一口径）。
 * size ∈ [1, 65536]；词表 7776 的拒绝率 ≈ 5.1%。
 */
export function sampleIndex(random: ByteSource, size: number): number {
  const space = BYTE_MAX_PLUS_ONE * BYTE_MAX_PLUS_ONE
  const limit = Math.floor(space / size) * size
  for (;;) {
    const bytes = random(2)
    const value = bytes[0]! * BYTE_MAX_PLUS_ONE + bytes[1]!
    if (value < limit) return value % size
  }
}

/* ---------- 生成 ---------- */

/** 新模式批量上限：生成类平台惯例 1–1000（spec.md 附录 §3）。 */
export const GEN_MIN_COUNT = 1
export const GEN_MAX_COUNT = 1000

/** 新模式数量 1–1000 的整数；非法返回 null（UI 错误态）。 */
export function validateGenCount(value: number): number | null {
  if (!Number.isInteger(value)) return null
  if (value < GEN_MIN_COUNT || value > GEN_MAX_COUNT) return null
  return value
}

export function generatePassphrases(
  wordlist: readonly string[],
  options: PassphraseOptions,
  count: number,
  random: ByteSource = cryptoByteSource,
): string[] {
  const wordCount = validateWordCount(options.words)
  if (wordCount === null) throw new RangeError(`word count out of range [${MIN_WORDS}, ${MAX_WORDS}]: ${options.words}`)
  if (validateGenCount(count) === null) throw new RangeError(`count out of range [${GEN_MIN_COUNT}, ${GEN_MAX_COUNT}]: ${count}`)
  if (wordlist.length === 0) throw new Error('wordlist is empty')

  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const words: string[] = []
    for (let k = 0; k < wordCount; k++) {
      const word = wordlist[sampleIndex(random, wordlist.length)]!
      words.push(options.casing === 'capitalize' ? capitalizeWord(word) : word)
    }
    out.push(words.join(options.separator))
  }
  return out
}

/* ---------- PIN ---------- */

export const PIN_LENGTHS = [4, 6, 8] as const
export type PinLength = (typeof PIN_LENGTHS)[number]
export const DEFAULT_PIN_LENGTH: PinLength = 6

export function validatePinLength(value: number): value is PinLength {
  return (PIN_LENGTHS as readonly number[]).includes(value)
}

/** 生成一条 PIN：每字符独立均匀取自 0–9（sampleInt 单字节拒绝采样）。 */
export function generatePin(length: PinLength, random: ByteSource = cryptoByteSource): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String(sampleInt(random, 10))
  return out
}

export function generatePins(length: PinLength, count: number, random: ByteSource = cryptoByteSource): string[] {
  if (!validatePinLength(length)) throw new RangeError(`pin length must be one of ${PIN_LENGTHS.join('/')}: ${length}`)
  if (validateGenCount(count) === null) throw new RangeError(`count out of range [${GEN_MIN_COUNT}, ${GEN_MAX_COUNT}]: ${count}`)
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(generatePin(length, random))
  return out
}

/* ---------- 十六进制 ---------- */

export const HEX_LENGTHS = [8, 16, 32] as const
export type HexLength = (typeof HEX_LENGTHS)[number]
export const DEFAULT_HEX_LENGTH: HexLength = 16

export function validateHexLength(value: number): value is HexLength {
  return (HEX_LENGTHS as readonly number[]).includes(value)
}

const HEX_CHARS = '0123456789abcdef'

/** 生成一条小写十六进制串：每字符独立均匀取自 0–f。 */
export function generateHex(length: HexLength, random: ByteSource = cryptoByteSource): string {
  let out = ''
  for (let i = 0; i < length; i++) out += HEX_CHARS[sampleInt(random, 16)]!
  return out
}

export function generateHexTokens(length: HexLength, count: number, random: ByteSource = cryptoByteSource): string[] {
  if (!validateHexLength(length)) throw new RangeError(`hex length must be one of ${HEX_LENGTHS.join('/')}: ${length}`)
  if (validateGenCount(count) === null) throw new RangeError(`count out of range [${GEN_MIN_COUNT}, ${GEN_MAX_COUNT}]: ${count}`)
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(generateHex(length, random))
  return out
}

/* ---------- 理论熵（沿用既有术语与 display idioms） ---------- */

/**
 * 理论熵：
 * - passphrase（词表口径）= 词数 × log₂(词表大小)，7776 词 4 词默认 ≈ 51.7 bit；
 * - PIN = 位数 × log₂(10)；Hex = 字符数 × log₂(16)。
 * 复用 password.ts 的长度 × log₂(池大小) 形态与强弱档位。
 */
export function passphraseEntropy(wordlistSize: number, words: number): number {
  return words * Math.log2(wordlistSize)
}

export function pinEntropy(length: number): number {
  return length * Math.log2(10)
}

export function hexEntropy(length: number): number {
  return length * Math.log2(16)
}
