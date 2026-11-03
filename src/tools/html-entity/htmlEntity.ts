/**
 * HTML 实体转义纯逻辑（0 依赖；解码走浏览器原生 DOMParser，零词典）。
 *
 * 术语与口径见 CONTEXT.md：
 * - 字符引用（Character Reference）：命名（&amp;）与数字（十进制 &#35; / 十六进制
 *   &#x23;）两种语法；数字语法对所有 Unicode 字符永远可用（含星面 emoji 代理对）；
 * - 仅解码不解析（Decode-Only）：解码只转换字符引用，不解析标签——解析前把 `<`
 *   预转义为 &lt;，标签按字面保留；DOMParser 文档为 inert（不执行脚本、不加载资源）；
 * - HTML 实体转义：escape 只做五个必需实体 & < > " ' → &amp; &lt; &gt; &quot; &#39;
 *   （撇号产出口径是 &#39; 不是 &apos;）。
 *
 * 未知命名实体的行级定位（规格 §2）：对输入行做字符引用 token 扫描，逐 token
 * 独立解码——解码结果与 token 原文相同即「parser 不认识」（如 &unknownname;），
 * 标记行级错误。该检测在输入侧进行，`Tom&amp;Jerry;` 解码出的 `&Jerry;` 不会被
 * 误报（&amp; 在输入侧是已知 token）。无分号历史实体（&amp）按 HTML5 原生规则
 * 由 DOMParser 处理，不自定义容错。
 */

/** escape 方向：五个 XML 必需实体（撇号用数字形式 &#39;，不用 &apos;）。 */
const ESCAPE_TABLE: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(input: string): string {
  let out = ''
  for (const ch of input) {
    out += ESCAPE_TABLE[ch] ?? ch
  }
  return out
}

/**
 * 字符引用 token：命名（&name;、无分号 &name）、十进制 &#NNN;、十六进制 &#xHHH;
 * （无分号形式均含，跟随 HTML5 原生口径）。`&` 后非字母/# 的（如 AT&T）不是 token。
 */
const CHAR_REF_RE = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[a-zA-Z][a-zA-Z0-9]*;?)/g

/** 行切分：\r\n / \n / \r（平台惯例，与 diffchecker/text-stats 同口径）。 */
const LINE_SPLIT_RE = /\r\n|\n|\r/

export interface UnescapeLineResult {
  /** 1-based 行号 */
  line: number
  /** 该行解码结果（未知实体残留按 parser 原样保留） */
  text: string
  /** 该行内 parser 不认识的命名实体（token 原文，去重） */
  unknownEntities: string[]
}

export interface UnescapeResult {
  /** 逐行结果（行号保留） */
  lines: UnescapeLineResult[]
  /** 全文解码输出（\n 连接） */
  text: string
  /** 是否存在未知命名实体行 */
  ok: boolean
}

// ---- DOMParser 访问（惰性；node 无 DOM 时调用即报错，模块导入无副作用） ----

function parseInert(fragment: string): string {
  const parser = new DOMParser()
  // 仅解码不解析：`<` 预转义 → 标签按字面保留；解析在 inert 文档中进行
  const doc = parser.parseFromString(`<body>${fragment.replace(/</g, '&lt;')}</body>`, 'text/html')
  return doc.body.textContent
}

const tokenCache = new Map<string, string>()

/** 单个字符引用 token 的独立解码（缓存；token 语法受限，不含标签风险）。 */
export function decodeCharRef(token: string): string {
  const cached = tokenCache.get(token)
  if (cached !== undefined) return cached
  const decoded = parseInert(token)
  tokenCache.set(token, decoded)
  return decoded
}

/** 解析单行：解码字符引用 + 未知命名实体检测。 */
export function unescapeLine(rawLine: string, lineNumber: number): UnescapeLineResult {
  if (!rawLine.includes('&')) {
    return { line: lineNumber, text: rawLine, unknownEntities: [] }
  }

  // 未知命名实体检测（输入侧 token 扫描）：仅对带分号形式判定——解码结果与原文
  // 相同即 parser 不认识（&unknownname;）。无分号形式（&amp、AT&T）按 HTML5 原生
  // 规则由 parser 宽容处理为字面文本，不作为错误（不自定义容错）。
  const unknowns: string[] = []
  const seen = new Set<string>()
  for (const match of rawLine.matchAll(CHAR_REF_RE)) {
    const token = match[0]
    if (!token.endsWith(';')) continue
    if (seen.has(token)) continue
    seen.add(token)
    if (decodeCharRef(token) === token) {
      unknowns.push(token)
    }
  }

  return { line: lineNumber, text: parseInert(rawLine), unknownEntities: unknowns }
}

/** 全文逐行解码：`&unknownname;` 行级错误定位，他行照常（非法输入只错该处）。 */
export function unescapeHtml(input: string): UnescapeResult {
  if (input === '') {
    return { lines: [], text: '', ok: true }
  }
  const rawLines = input.split(LINE_SPLIT_RE)
  const lines = rawLines.map((rawLine, index) => unescapeLine(rawLine, index + 1))
  return {
    lines,
    text: lines.map((l) => l.text).join('\n'),
    ok: lines.every((l) => l.unknownEntities.length === 0),
  }
}

/** 输入上限：1 MiB（UTF-8 字节），超限截断并提示（平台惯例）。 */
export const MAX_INPUT_BYTES = 1024 * 1024

function utf8ByteLen(cp: number): number {
  if (cp <= 0x7f) return 1
  if (cp <= 0x7ff) return 2
  if (cp <= 0xffff) return 3
  return 4
}

/** 1 MiB 截断：码点边界，绝不产生半个字符。 */
export function enforceInputLimit(text: string): { text: string; truncated: boolean } {
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
