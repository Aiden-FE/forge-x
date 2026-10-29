/**
 * 文本统计纯逻辑模块（零第三方依赖）。
 *
 * 口径与术语见 CONTEXT.md：
 * - 码点（Code Point）：Unicode 编号单位，与 UTF-16 code unit 不同；
 * - 字素（Grapheme）：用户感知的「一个字符」（ZWJ emoji 序列、带组合符字母各算 1）；
 * - 统计词：连续拉丁/数字段计 1（词内 `'`、`-` 不拆词），每个汉字计 1 词；
 * - 阅读时长：拉丁词 200 词/分钟 + CJK 字 300 字/分钟，四舍五入到分钟。
 */

/** 输入上限：1 MiB（UTF-8 字节），超限截断并提示（平台惯例）。 */
export const MAX_INPUT_BYTES = 1024 * 1024

/** 阅读速率：拉丁词 200 词/分钟。 */
export const LATIN_WORDS_PER_MINUTE = 200
/** 阅读速率：CJK 字 300 字/分钟。 */
export const CJK_CHARS_PER_MINUTE = 300

// ---- 码点 ----

/** Unicode 码点计数（for..of 按码点迭代，与 `.length` 的 code unit 口径不同）。 */
export function countCodePoints(text: string): number {
  let n = 0
  for (const _ of text) n++
  return n
}

/**
 * Unicode 空白字符数：Zs（空格分隔符）加 `\t`、`\n`、`\r`（规格口径）。
 * 注意 `\v`、`\f`、U+2028/2029（Zl/Zp）不在口径内。
 */
const WHITESPACE_RE = /[\t\n\r \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g

export function countWhitespace(text: string): number {
  return (text.match(WHITESPACE_RE) ?? []).length
}

// ---- 字素 ----

type GraphemeSegmenter = { segment(input: string): Iterable<unknown> }

let segmenter: GraphemeSegmenter | null | undefined

/** Intl.Segmenter 可用性探测（决定字素行的「不可探测」分支）。 */
export function hasGraphemeSegmenter(): boolean {
  return typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function'
}

function getSegmenter(): GraphemeSegmenter | null {
  if (segmenter !== undefined) return segmenter
  segmenter = hasGraphemeSegmenter()
    ? (new (Intl as unknown as { Segmenter: new (l?: string, o?: { granularity: string }) => GraphemeSegmenter }).Segmenter(
        undefined,
        { granularity: 'grapheme' },
      ) as GraphemeSegmenter)
    : null
  return segmenter
}

/** 组合标记（Mn/Mc/Me，含变体选择符 U+FE00–FE0F）与 emoji 肤色修饰符。 */
const EXTEND_RE = /[\p{M}\p{Emoji_Modifier}]/uy

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff
}

/**
 * 简化字素聚类（Intl.Segmenter 不可用环境的回退，零依赖、确定式）。
 * 覆盖：ZWJ emoji 序列（👨‍👩‍👧）、组合标记（e + U+0301）、变体选择符、
 * 肤色修饰符（👍🏻）、keycap（1️⃣）、区域指示符对（🇨🇳）、CRLF。
 * 简化点（不追求完整 UAX #29）：Hangul jamo 分解与 tag 序列不做特殊处理；
 * ZWJ 后的码点无条件并入当前簇（面向 emoji 序列，非 emoji 场景的 ZWJ 极罕见）。
 */
export function countGraphemesSimple(text: string): number {
  const n = text.length
  let count = 0
  let i = 0
  while (i < n) {
    count++
    const first = text.codePointAt(i)!
    i += first > 0xffff ? 2 : 1
    if (first === 0x0d && i < n && text.charCodeAt(i) === 0x0a) {
      i++ // CRLF 是一个字素
      continue
    }
    if (isRegionalIndicator(first) && i < n && isRegionalIndicator(text.codePointAt(i)!)) {
      i += 2 // 区域指示符成对（旗帜）
    }
    // Extend 链与 ZWJ 连接
    for (;;) {
      if (i < n) {
        EXTEND_RE.lastIndex = i
        if (EXTEND_RE.test(text)) {
          i = EXTEND_RE.lastIndex
          continue
        }
        if (text.codePointAt(i) === 0x200d /* ZWJ */) {
          i++
          if (i < n) {
            const next = text.codePointAt(i)!
            i += next > 0xffff ? 2 : 1 // ZWJ 后的码点并入本簇
          }
          continue
        }
      }
      break
    }
  }
  return count
}

/**
 * 字素计数：Intl.Segmenter 优先（完整 UAX #29 语义），
 * 不可用时回退到简化聚类；两者皆依赖运行时，正常环境恒返回数值。
 * 「不可探测」分支由 shouldShowGraphemes 的 null 入参承载。
 */
export function countGraphemes(text: string): number | null {
  const seg = getSegmenter()
  if (seg) {
    let n = 0
    for (const _ of seg.segment(text)) n++
    return n
  }
  return countGraphemesSimple(text)
}

/** 字素行可见性（条件行）：不可探测（null）或与码点数相等时隐藏。 */
export function shouldShowGraphemes(graphemes: number | null, codePoints: number): boolean {
  return graphemes !== null && graphemes !== codePoints
}

// ---- 字节（UTF-8） ----

const encoder = new TextEncoder()

export function countBytes(text: string): number {
  return encoder.encode(text).length
}

// ---- 统计词 ----

export interface WordCounts {
  /** 词总数 = 拉丁词 + CJK 字 */
  total: number
  /** 拉丁/数字词数（连续字母数字段，词内 `'`、`-` 不拆词） */
  latin: number
  /** CJK 汉字数（每字 1 词，同时用于阅读时长的 CJK 口径） */
  cjk: number
}

/** 汉字（\p{Script=Han} 覆盖 CJK 统一表意文字及兼容区，确定式、不依赖词典）。 */
const HAN_RE = /\p{Script=Han}/gu
/** 拉丁/数字词：连续字母数字段，词内单个 `'` 或 `-` 不拆词。 */
const WORD_RE = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu

export function countWords(text: string): WordCounts {
  const cjk = (text.match(HAN_RE) ?? []).length
  // 汉字逐字计词，替换为分隔符后再数拉丁/数字段
  const latin = (text.replace(HAN_RE, ' ').match(WORD_RE) ?? []).length
  return { total: cjk + latin, latin, cjk }
}

// ---- 行与段落 ----

const NEWLINE_SPLIT_RE = /\r\n|\n|\r/
const TRAILING_NEWLINE_RE = /(?:\r\n|\n|\r)$/

/**
 * 行数：按 `\r\n`/`\n`/`\r` 切分后的行数；空输入 = 0；
 * 末尾有换行不多计空行（尾随换行符属于最后一行）。
 */
export function countLines(text: string): number {
  if (text.length === 0) return 0
  return text.replace(TRAILING_NEWLINE_RE, '').split(NEWLINE_SPLIT_RE).length
}

/** 段落数：连续非空行块（仅空白的行视为空行）；空输入 = 0。 */
export function countParagraphs(text: string): number {
  if (text.length === 0) return 0
  let count = 0
  let inBlock = false
  for (const line of text.split(NEWLINE_SPLIT_RE)) {
    if (line.trim() === '') {
      inBlock = false
    } else if (!inBlock) {
      count++
      inBlock = true
    }
  }
  return count
}

// ---- 阅读时长 ----

export interface ReadingTime {
  /** 四舍五入后的分钟数；underOne 时为 0 */
  minutes: number
  /** 不足 1 分钟（文案「< 1 分钟」留给 locale） */
  underOne: boolean
}

/** 拉丁词 ×200 词/分钟 + CJK 字 ×300 字/分钟，合成后四舍五入到分钟。 */
export function readingTime(latinWords: number, cjkChars: number): ReadingTime | null {
  if (latinWords === 0 && cjkChars === 0) return null
  const raw = latinWords / LATIN_WORDS_PER_MINUTE + cjkChars / CJK_CHARS_PER_MINUTE
  const minutes = Math.round(raw)
  return minutes < 1 ? { minutes: 0, underOne: true } : { minutes, underOne: false }
}

// ---- 汇总 ----

export interface TextStats {
  /** 字符（含空白）= 码点数 */
  codePoints: number
  /** 字符（不含空白）= 码点数 − Unicode 空白字符数 */
  codePointsNoWhitespace: number
  /** Unicode 空白字符数 */
  whitespace: number
  /** 字素数（用户感知字符）；不可探测时为 null */
  graphemes: number | null
  /** 字素条件行是否显示（不相等且可探测） */
  showGraphemes: boolean
  /** UTF-8 编码字节数 */
  bytes: number
  /** 词数（统计词口径） */
  words: number
  /** 拉丁/数字词数（阅读时长用） */
  latinWords: number
  /** CJK 汉字数（阅读时长用） */
  cjkChars: number
  lines: number
  paragraphs: number
  /** 阅读时长；无内容（0 词 0 字）时为 null（UI 隐藏该行） */
  reading: ReadingTime | null
}

export function computeStats(text: string): TextStats {
  const codePoints = countCodePoints(text)
  const whitespace = countWhitespace(text)
  const graphemes = countGraphemes(text)
  const words = countWords(text)
  return {
    codePoints,
    codePointsNoWhitespace: codePoints - whitespace,
    whitespace,
    graphemes,
    showGraphemes: shouldShowGraphemes(graphemes, codePoints),
    bytes: countBytes(text),
    words: words.total,
    latinWords: words.latin,
    cjkChars: words.cjk,
    lines: countLines(text),
    paragraphs: countParagraphs(text),
    reading: readingTime(words.latin, words.cjk),
  }
}

// ---- 1 MiB 输入上限 ----

export interface InputLimitResult {
  /** 截断后的文本（未超限时与输入相同） */
  text: string
  truncated: boolean
}

function utf8ByteLen(cp: number): number {
  if (cp <= 0x7f) return 1
  if (cp <= 0x7ff) return 2
  if (cp <= 0xffff) return 3
  return 4
}

/**
 * 输入上限：超过 1 MiB（UTF-8 字节）时在码点边界截断，绝不产生半个字符。
 * 快路径：UTF-8 字节数 ≤ 3 × UTF-16 code unit 数，短于该上界的输入必然安全。
 */
export function enforceInputLimit(text: string): InputLimitResult {
  if (text.length * 3 <= MAX_INPUT_BYTES) return { text, truncated: false }
  let bytes = 0
  let end = 0
  for (const ch of text) {
    const b = utf8ByteLen(ch.codePointAt(0)!)
    if (bytes + b > MAX_INPUT_BYTES) return { text: text.slice(0, end), truncated: true }
    bytes += b
    end += ch.length
  }
  return { text, truncated: false }
}
