/**
 * 进制转换器纯逻辑：任意 2–36 进制整数互转（BigInt 实现）。
 *
 * 约定（见规格 `.scratch/hot-tools-v0.3.0/issues/07-base-converter-spec.md` 与
 * CONTEXT.md「进制」「前缀记法」）：
 * - 任意长度整数，BigInt 承载，无小数、无位宽/补码概念；支持前导负号。
 * - 解析侧字母一律大小写不敏感（0-9A-Z 字母表）；输出侧由开关决定大写。
 * - 前缀记法 `0b/0o/0x` 仅对固定 2/8/16 三个字段生效；十进制与自定义进制
 *   无前缀概念（即使自定义基数恰好是 2/8/16 也不加、不识别前缀）。
 * - 解析遇到第一个非法字符即失败，报告其位置（用于「定位到字符」的报错）。
 */

export const MIN_RADIX = 2
export const MAX_RADIX = 36

/** 2–36 进制的数字字母表；10 以上依次用 A–Z 表示 10–35。 */
export const DIGIT_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** 五个输入字段；custom 为自定义进制字段（基数由用户输入决定）。 */
export type FieldKey = 'bin' | 'oct' | 'dec' | 'hex' | 'custom'

/** 四个常显字段的固定进制。 */
export const FIELD_RADIXES: Record<Exclude<FieldKey, 'custom'>, number> = {
  bin: 2,
  oct: 8,
  dec: 10,
  hex: 16,
}

export const FIELD_KEYS: FieldKey[] = ['bin', 'oct', 'dec', 'hex', 'custom']

/** 2/8/16 的前缀记法；其余进制无前缀概念。 */
const PREFIX_NOTATION: Record<number, string> = { 2: '0b', 8: '0o', 16: '0x' }

export function isRadixValid(radix: number): boolean {
  return Number.isInteger(radix) && radix >= MIN_RADIX && radix <= MAX_RADIX
}

/**
 * 归一化用户输入的基数：非有限值或越界返回 null（对应字段错误态），
 * 小数向零截断。
 */
export function normalizeRadix(raw: number): number | null {
  if (!Number.isFinite(raw)) return null
  const radix = Math.trunc(raw)
  if (!isRadixValid(radix)) return null
  return radix
}

export type ParseResult =
  | { status: 'ok'; value: bigint }
  | { status: 'empty' }
  | { status: 'invalid'; index: number; char?: string }

function digitValue(ch: string): number | null {
  const i = DIGIT_ALPHABET.indexOf(ch.toUpperCase())
  return i === -1 ? null : i
}

/**
 * 按指定进制解析整数字符串。
 *
 * - 两端空白忽略；内部空白、任何不在字母表前 `radix` 位内的字符均为非法，
 *   报告第一个非法字符的 index（基于去空白后的文本）与字符本身。
 * - 前导 `-` 表示负数；`-` 后无数字视为非法（index 指向应出现数字的位置）。
 * - 前缀记法仅当 radix ∈ {2, 8, 16} 时识别：与该进制匹配则剥离，不匹配
 *   按非法字符处理（定位到前缀字母）；其余进制一律不识别前缀。
 * - radix 越界属于编程错误，抛 RangeError。
 */
export function parseIntInRadix(input: string, radix: number): ParseResult {
  if (!isRadixValid(radix)) throw new RangeError(`radix out of range [${MIN_RADIX}, ${MAX_RADIX}]: ${radix}`)

  const text = input.trim()
  if (text === '') return { status: 'empty' }

  let negative = false
  let rest = text
  if (rest.startsWith('-')) {
    negative = true
    rest = rest.slice(1)
  }
  let offset = text.length - rest.length

  // 前缀记法：仅固定 2/8/16 识别。头部形如 0b/0o/0x 时必须与该字段进制
  // 匹配，匹配则剥离，不匹配按非法字符处理（定位到前缀字母）；
  // 其余进制（十进制、自定义进制）一律不识别前缀。
  const notation = PREFIX_NOTATION[radix]
  if (notation !== undefined) {
    const lowerHead = rest.slice(0, 2).toLowerCase()
    const isPrefixShaped = lowerHead === '0b' || lowerHead === '0o' || lowerHead === '0x'
    if (isPrefixShaped) {
      if (lowerHead === notation) {
        rest = rest.slice(2)
        offset += 2
      } else {
        return { status: 'invalid', index: offset + 1, char: lowerHead[1] }
      }
    }
  }

  if (rest.length === 0) {
    return { status: 'invalid', index: offset, char: undefined }
  }

  const base = BigInt(radix)
  let acc = 0n
  for (let i = 0; i < rest.length; i++) {
    const digit = digitValue(rest[i])
    if (digit === null || digit >= radix) {
      return { status: 'invalid', index: offset + i, char: rest[i] }
    }
    acc = acc * base + BigInt(digit)
  }
  return { status: 'ok', value: negative ? -acc : acc }
}

export interface FormatOptions {
  radix: number
  /** 数字字母（10–35）是否大写；前缀记法本身保持小写。 */
  uppercase?: boolean
  /** 是否加前缀；仅 radix ∈ {2, 8, 16} 时生效（十进制与自定义进制无前缀概念）。 */
  prefix?: boolean
}

/** 按进制格式化 BigInt；radix 越界属于编程错误，抛 RangeError。 */
export function formatBigInt(value: bigint, options: FormatOptions): string {
  if (!isRadixValid(options.radix)) throw new RangeError(`radix out of range [${MIN_RADIX}, ${MAX_RADIX}]: ${options.radix}`)
  const negative = value < 0n
  const abs = negative ? -value : value
  let digits = abs.toString(options.radix)
  if (options.uppercase) digits = digits.toUpperCase()
  const notation = options.prefix ? PREFIX_NOTATION[options.radix] : undefined
  return `${negative ? '-' : ''}${notation ?? ''}${digits}`
}

export interface ConverterState {
  /** 输出字母大写开关。 */
  uppercase: boolean
  /** 前缀记法开关（仅作用于固定 bin/oct/hex 字段）。 */
  prefix: boolean
  /** 自定义进制字段的基数。 */
  customRadix: number
}

/** 某一字段当前使用的进制（custom 字段取用户基数）。 */
export function fieldRadix(key: FieldKey, customRadix: number): number {
  return key === 'custom' ? customRadix : FIELD_RADIXES[key]
}

/** 格式化单个字段：custom 字段即使基数是 2/8/16 也不加前缀。 */
export function formatField(value: bigint, key: FieldKey, state: ConverterState): string {
  const radix = fieldRadix(key, state.customRadix)
  const prefix = state.prefix && key !== 'custom'
  return formatBigInt(value, { radix, uppercase: state.uppercase, prefix })
}

/** 一次性格式化全部五个字段。 */
export function formatAll(value: bigint, state: ConverterState): Record<FieldKey, string> {
  const out = {} as Record<FieldKey, string>
  for (const key of FIELD_KEYS) out[key] = formatField(value, key, state)
  return out
}

// ---- 码点联动行 ----

export type CodePointInfo =
  | { kind: 'char'; char: string; label: string }
  | { kind: 'control'; label: string }
  | { kind: 'none' }

/** 最大 Unicode 码点（0x10FFFF）。 */
const MAX_CODE_POINT = 0x10ffff

/**
 * 当前数值作为 Unicode 码点的展示形态：
 * - 0–0x10FFFF：可打印字符（含空格）→ char；不可打印（C0 0x00–0x1F、
 *   DEL 0x7F、C1 0x80–0x9F 控制区）→ control，显示 `U+XXXX` 标记；
 * - 负数或超出范围 → none（显示「—」）。
 * 纯码点映射，不引入字符名称词典。
 */
export function codePointOf(value: bigint): CodePointInfo {
  if (value < 0n || value > BigInt(MAX_CODE_POINT)) return { kind: 'none' }
  const cp = Number(value)
  const label = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
  const isControl = cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)
  if (isControl) return { kind: 'control', label }
  return { kind: 'char', char: String.fromCodePoint(cp), label }
}
