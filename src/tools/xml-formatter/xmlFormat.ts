/**
 * XML 格式化/压缩纯逻辑（UI 无关）。
 *
 * 术语与口径见 CONTEXT.md「良构校验 (Well-formedness Check)」：
 * - 校验权威是平台原生 DOMParser（只判良构：标签闭合、名字合法、实体可解析、
 *   无重复属性；不到 schema/命名空间语义——_Avoid_ 行是硬边界）；
 * - 错误呈现做容忍引擎差异的行/列提取（Chromium/WebKit parsererror 双正则），
 *   提取失败降级原文展示；
 * - xml-formatter `throwOnFailure: true` 兜底：库自身检测到解析失败时抛错，
 *   绝不输出静默修复的结果（输出保留旧值由组件层约定承担）。
 *
 * 排版口径（票据 04 定死不暴露，唯一 UI 选项 = 缩进 2/4/Tab）：
 * lineSeparator '\n'（覆盖库默认 '\r\n'）、collapseContent 开、自闭合 `<tag/>`
 * 紧凑（whiteSpaceAtEndOfSelfclosingTag 关）、`<tag></tag>` 保真
 * （forceSelfClosingEmptyTag 关）、attributeQuotes double、尊重
 * `xml:space="preserve"`（库原生行为，选库理由）。
 *
 * xml-formatter 首用 dynamic import（平台规则：第三方依赖不进首屏包）。
 */

/** 粘贴（textarea）输入上限：1 MiB，按 UTF-8 字节计。 */
export const PASTE_MAX_BYTES = 1024 * 1024

export type XmlToolMode = 'format' | 'minify'

/** 缩进档位：2 空格（默认）/ 4 空格 / Tab——唯一排版选项。 */
export type IndentChoice = '2' | '4' | 'tab'

export function indentationFor(choice: IndentChoice): string {
  if (choice === '4') return '    '
  if (choice === 'tab') return '\t'
  return '  '
}

/* ------------------------------------------------------------------ *
 * 输入上限（UTF-8 字节；码点按整体编码计数，无代理对切分问题）
 * ------------------------------------------------------------------ */

const encoder = new TextEncoder()

export function utf8ByteLength(text: string): number {
  return encoder.encode(text).length
}

/** 超过 1 MiB 返回 true。快速路径：UTF-8 下每 UTF-16 码单元至多 3 字节。 */
export function exceedsPasteLimit(text: string): boolean {
  if (text.length * 3 <= PASTE_MAX_BYTES) return false
  return utf8ByteLength(text) > PASTE_MAX_BYTES
}

/* ------------------------------------------------------------------ *
 * 良构校验：DOMParser 为权威 + 行/列容忍提取
 * ------------------------------------------------------------------ */

export interface XmlErrorPosition {
  /** 1-based 行号 */
  line: number
  /** 1-based 列号 */
  column: number
  /** 引擎给出的错误描述（可空） */
  message: string
}

// Chromium/libxml2 形态："…error on line 3 at column 8: Opening and ending tag mismatch…"
const CHROMIUM_POSITION_RE = /error on line (\d+) at column (\d+)(?::\s*(.*))?/
// WebKit 形态："…(line 2, column 9)…" / "…at line 2, column 9: msg…"
const WEBKIT_POSITION_RE = /line\s+(\d+)\s*,\s*column\s+(\d+)\s*:?\s*(.*)/i

function cleanMessage(raw: string | undefined): string {
  return (raw ?? '').replace(/[)\]]+\s*$/, '').trim()
}

/**
 * parsererror 文本 → 行/列（容忍式提取，纯函数）。
 * 双正则先后尝试（Chromium 在前、更特异），均未命中返回 null（调用方降级原文展示）。
 */
export function extractParserError(text: string): XmlErrorPosition | null {
  if (!text) return null
  const chromium = text.match(CHROMIUM_POSITION_RE)
  if (chromium) {
    return { line: Number(chromium[1]), column: Number(chromium[2]), message: cleanMessage(chromium[3]) }
  }
  const webkit = text.match(WEBKIT_POSITION_RE)
  if (webkit) {
    return { line: Number(webkit[1]), column: Number(webkit[2]), message: cleanMessage(webkit[3]) }
  }
  return null
}

/**
 * DOMParser 结果的引擎无关投影（注入缝）：只暴露 parsererror 文本。
 * 测试注入 Chromium/WebKit 形态的快照即可覆盖各引擎差异；默认实现走平台
 * 原生 DOMParser（生产权威，浏览器/WebView 均内置）。
 */
export type ParseXml = (xml: string) => { parserErrorText: string | null }

function parseWithDomParser(xml: string): { parserErrorText: string | null } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  let text: string | null = doc.querySelector('parsererror')?.textContent ?? null
  if (text === null && doc.documentElement && doc.documentElement.nodeName.toLowerCase() === 'parsererror') {
    text = doc.documentElement.textContent
  }
  return { parserErrorText: text }
}

export interface WellformednessOutcome {
  ok: boolean
  /** 提取成功时的行/列（ok=false 且无 position = 降级原文展示）。 */
  position?: XmlErrorPosition
  /** parsererror 原文（降级展示用）。 */
  rawErrorText?: string
}

/** 良构判定：parsererror 元素存在即不良构；行/列容忍提取。 */
export function checkWellformed(xml: string, parse: ParseXml = parseWithDomParser): WellformednessOutcome {
  const { parserErrorText } = parse(xml)
  if (!parserErrorText) return { ok: true }
  const position = extractParserError(parserErrorText)
  return position
    ? { ok: false, position, rawErrorText: parserErrorText }
    : { ok: false, rawErrorText: parserErrorText }
}

/* ------------------------------------------------------------------ *
 * 排版/压缩（xml-formatter，首用 dynamic import）
 * ------------------------------------------------------------------ */

type XmlFormatFn = typeof import('xml-formatter').default

let cachedFormatter: XmlFormatFn | null = null

async function loadFormatter(): Promise<XmlFormatFn> {
  if (!cachedFormatter) {
    cachedFormatter = (await import('xml-formatter')).default
  }
  return cachedFormatter
}

export type XmlToolErrorCode = 'empty' | 'pasteTooLarge' | 'notWellFormed' | 'convert'

export interface XmlToolError {
  code: XmlToolErrorCode
  /** 库错误消息（convert 兜底）或 parsererror 原文（降级展示）。 */
  message?: string
  position?: XmlErrorPosition
}

export type XmlToolOutcome =
  | { ok: true; value: string }
  | { ok: false; errors: XmlToolError[] }

/**
 * 单一入口：空/超限 → DOMParser 良构校验 → xml-formatter 排版或压缩。
 * 任一步失败返回 errors（组件据此保留旧输出）；排版选项按票据定死传入。
 */
export async function runXmlTool(
  text: string,
  mode: XmlToolMode,
  indent: IndentChoice = '2',
  parse: ParseXml = parseWithDomParser,
): Promise<XmlToolOutcome> {
  if (text.trim() === '') {
    return { ok: false, errors: [{ code: 'empty' }] }
  }
  if (exceedsPasteLimit(text)) {
    return { ok: false, errors: [{ code: 'pasteTooLarge' }] }
  }
  const wellformed = checkWellformed(text, parse)
  if (!wellformed.ok) {
    return {
      ok: false,
      errors: [{
        code: 'notWellFormed',
        message: wellformed.rawErrorText,
        position: wellformed.position,
      }],
    }
  }
  const format = await loadFormatter()
  try {
    const value = mode === 'minify'
      ? format.minify(text, { throwOnFailure: true })
      : format(text, {
          indentation: indentationFor(indent),
          lineSeparator: '\n',
          collapseContent: true,
          throwOnFailure: true,
          attributeQuotes: 'double',
          whiteSpaceAtEndOfSelfclosingTag: false,
          forceSelfClosingEmptyTag: false,
        })
    return { ok: true, value }
  } catch (caught) {
    return {
      ok: false,
      errors: [{ code: 'convert', message: caught instanceof Error ? caught.message : String(caught) }],
    }
  }
}
