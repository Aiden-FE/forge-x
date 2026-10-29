/**
 * 文本大小写转换纯逻辑：切词 + 七种样式定形 + 输入截断。
 *
 * 术语见 CONTEXT.md：词边界（Word Boundary）/ 缩写词组（Acronym Group）/
 * 虚词（Stopword）/ 不透明词（Opaque Word）。
 *
 * 规格见 `.scratch/hot-tools-v0.3.0/issues/08-text-case-spec.md`：
 * - 七样式：camel / pascal / snake / constant / kebab / title / sentence。
 * - 词边界：空白、标点、`_`、`-`、大小写转换处、中西文切换处。
 * - 连续大写 = 缩写词组（整体切分、定形时按样式归一，如 HTTP → Http）；
 *   数字并入前词；CJK 为不透明词原样透传。
 * - sentence case 为行级：该行第一个拉丁字母大写、行内其余拉丁字母小写。
 * - 无 locale 选项，一律 JS 原生大小写语义（ß → SS 合法）。
 */

export type CaseStyle =
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'constant'
  | 'kebab'
  | 'title'
  | 'sentence'

export const CASE_STYLES: readonly CaseStyle[] = [
  'camel',
  'pascal',
  'snake',
  'constant',
  'kebab',
  'title',
  'sentence',
]

/**
 * Title Case 英文虚词表（24 词）：
 * 冠词 + 并列连词 + 短介词。行首/行尾位置的虚词不适用，照常大写。
 */
export const STOPWORDS: readonly string[] = [
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'so',
  'yet',
  'of',
  'in',
  'on',
  'at',
  'to',
  'by',
  'as',
  'with',
  'from',
  'into',
  'onto',
  'over',
  'upon',
  'via',
  'per',
]

const STOPWORD_SET: ReadonlySet<string> = new Set(STOPWORDS)

/** 输入字节上限：1 MiB，超出截断并提示（平台文本上限惯例）。 */
export const MAX_INPUT_BYTES = 1024 * 1024

export interface WordToken {
  /** `caseable`：参与大小写的词（拉丁等有大小写的字母词）；`opaque`：CJK 不透明词。 */
  kind: 'caseable' | 'opaque'
  text: string
}

const RE_LETTER = /\p{L}/u
const RE_MARK = /\p{M}/u
const RE_DIGIT = /\p{Nd}/u
const RE_UPPER = /\p{Lu}|\p{Lt}/u
const RE_LOWER = /\p{Ll}/u
const RE_FIRST_LETTER = /\p{L}/u

function isAsciiCp(ch: string): number {
  if (ch.length === 1) {
    const c = ch.charCodeAt(0)
    if (c < 128) return c
  }
  return -1
}

function isUpperChar(ch: string): boolean {
  const c = isAsciiCp(ch)
  if (c >= 0) return c >= 0x41 && c <= 0x5a
  return RE_UPPER.test(ch)
}

function isLowerChar(ch: string): boolean {
  const c = isAsciiCp(ch)
  if (c >= 0) return c >= 0x61 && c <= 0x7a
  return RE_LOWER.test(ch)
}

function isDigitChar(ch: string): boolean {
  const c = isAsciiCp(ch)
  if (c >= 0) return c >= 0x30 && c <= 0x39
  return RE_DIGIT.test(ch)
}

/** 词内字符：字母（含重音与非拉丁字母）、组合记号、数字。其余一律是分隔符。 */
function isWordChar(ch: string): boolean {
  const c = isAsciiCp(ch)
  if (c >= 0) {
    return (
      (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39)
    )
  }
  return RE_LETTER.test(ch) || RE_MARK.test(ch) || RE_DIGIT.test(ch)
}

/** CJK：汉字、假名、谚文音节等不透明词字符。 */
function isCjkCodePoint(cp: number): boolean {
  return (
    (cp >= 0x3040 && cp <= 0x30ff) || // 平假名 + 片假名
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 统一表意文字
    (cp >= 0xac00 && cp <= 0xd7af) || // 谚文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意文字
    (cp >= 0x20000 && cp <= 0x2ffff) // CJK 扩展 B–F
  )
}

/**
 * caseable 词内部的新词起点判定（调用时保证 chars[i] 是词字符且与前字符同词）。
 * - 驼峰：前为小写/数字、当前大写 → 新词（version2|Update）。
 * - 缩写词组收尾：前为大写、当前大写、后为小写 → 新词（HTTP|Server）。
 */
function startsCaseableWord(chars: string[], i: number): boolean {
  const cur = chars[i]
  if (!isUpperChar(cur)) return false
  const prev = chars[i - 1]
  if (isDigitChar(prev) || !isUpperChar(prev)) return true
  const next = chars[i + 1]
  return next !== undefined && isLowerChar(next)
}

/**
 * 把一行内容切分为词序列。
 *
 * 词边界（CONTEXT.md「词边界」）：分隔符（空白/标点/`_`/`-`）一律切词；
 * 大小写转换处切词；中西文切换处切词。连续大写整体构成缩写词组；
 * 数字并入前词、纯数字自成词；CJK 连续段整体构成一个不透明词。
 */
export function splitWords(line: string): WordToken[] {
  const chars = Array.from(line)
  const words: WordToken[] = []
  let buffer = ''
  let kind: WordToken['kind'] | null = null

  const flush = (): void => {
    if (buffer && kind) words.push({ kind, text: buffer })
    buffer = ''
    kind = null
  }

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (isCjkCodePoint(ch.codePointAt(0) as number)) {
      if (kind !== 'opaque') flush()
      kind = 'opaque'
      buffer += ch
      continue
    }
    if (isWordChar(ch)) {
      if (kind !== 'caseable' || startsCaseableWord(chars, i)) flush()
      kind = 'caseable'
      buffer += ch
      continue
    }
    flush() // 分隔符
  }
  flush()
  return words
}

/**
 * 词定形：第一个字母大写 + 其余字母小写（HTTP → Http、straße → Straße）。
 * 无字母的纯数字词原样返回。ß → SS 等 JS 原生语义生效。
 */
function capitalizeWord(word: string): string {
  const match = RE_FIRST_LETTER.exec(word)
  if (!match) return word
  const start = match.index
  const end = start + match[0].length
  return (
    word.slice(0, start) + word.slice(start, end).toUpperCase() + word.slice(end).toLowerCase()
  )
}

/** 各样式的词间分隔（camel/pascal 无缝拼接；CJK 不透明词参与拼接）。 */
const JOINERS: Record<CaseStyle, string> = {
  camel: '',
  pascal: '',
  snake: '_',
  constant: '_',
  kebab: '-',
  title: ' ',
  sentence: ' ',
}

/**
 * 单词按样式定形。CJK 不透明词恒透传。
 * camel 首词小写、其余词首字母大写（位置计 CJK 词，实现按位定形）。
 * Title：非行首/行尾的虚词小写，其余词首字母大写。
 */
function formatWord(word: WordToken, style: CaseStyle, index: number, total: number): string {
  if (word.kind === 'opaque') return word.text
  switch (style) {
    case 'snake':
    case 'kebab':
      return word.text.toLowerCase()
    case 'constant':
      return word.text.toUpperCase()
    case 'camel':
      return index === 0 ? word.text.toLowerCase() : capitalizeWord(word.text)
    case 'pascal':
      return capitalizeWord(word.text)
    case 'title': {
      const atEdge = index === 0 || index === total - 1
      if (!atEdge && STOPWORD_SET.has(word.text.toLowerCase())) return word.text.toLowerCase()
      return capitalizeWord(word.text)
    }
    case 'sentence':
      return word.text.toLowerCase()
  }
}

/**
 * sentence case（行级）：全部词小写后，该行第一个拉丁字母大写。
 * 纯数字词不含字母，跳过继续向后找（`123 abc` → `123 Abc`）。
 */
function joinSentence(words: WordToken[]): string {
  const parts = words.map((w) => formatWord(w, 'sentence', 0, words.length))
  for (let i = 0; i < words.length; i++) {
    if (words[i].kind === 'opaque') continue
    const match = RE_FIRST_LETTER.exec(parts[i])
    if (!match) continue
    const start = match.index
    const end = start + match[0].length
    parts[i] =
      parts[i].slice(0, start) + parts[i].slice(start, end).toUpperCase() + parts[i].slice(end)
    break
  }
  return parts.join(' ')
}

const RE_LEADING_WS = /^\s*/
const RE_TRAILING_WS = /\s*$/

/**
 * 单行转换。
 *
 * - 行首/行尾空白原样保留（含 `\r`，CRLF 结构因此保留）。
 * - 词间分隔符按目标样式重写：连续分隔符折叠为一个样式分隔符。
 * - 词序列之外的首尾分隔符丢弃。
 * - 无词的行（空行、纯符号行）原样返回。
 */
export function convertLine(line: string, style: CaseStyle): string {
  const lead = RE_LEADING_WS.exec(line)?.[0] ?? ''
  const rest = line.slice(lead.length)
  const trail = RE_TRAILING_WS.exec(rest)?.[0] ?? ''
  const core = rest.slice(0, rest.length - trail.length)
  const words = splitWords(core)
  if (words.length === 0) return line
  const joined =
    style === 'sentence'
      ? joinSentence(words)
      : words.map((w, i) => formatWord(w, style, i, words.length)).join(JOINERS[style])
  return lead + joined + trail
}

/** 多行逐行转换（按 `\n` 拆行、逐行独立、换行结构保留）。 */
export function convertCase(input: string, style: CaseStyle): string {
  if (input === '') return ''
  return input
    .split('\n')
    .map((line) => convertLine(line, style))
    .join('\n')
}

export interface TruncationResult {
  text: string
  truncated: boolean
}

/** 按 UTF-8 字节把输入截断到 1 MiB 内，码点对齐（不劈开多字节字符）。 */
export function truncateInput(input: string): TruncationResult {
  const bytes = new TextEncoder().encode(input)
  if (bytes.length <= MAX_INPUT_BYTES) return { text: input, truncated: false }
  let cut = MAX_INPUT_BYTES
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut-- // 回退到码点起始字节
  const text = new TextDecoder().decode(bytes.subarray(0, cut))
  return { text, truncated: true }
}
