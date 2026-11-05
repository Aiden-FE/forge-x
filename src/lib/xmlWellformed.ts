/**
 * XML 良构错误行/列容忍提取——共享单源（票据 04「DOMParser 为校验权威 + 行/列容忍提取」；
 * 票据 05 明示「复用 04 权威与行/列呈现」）。
 *
 * 引擎差异（Chromium/WebKit/Firefox 的 parsererror 文案各形）由正则组容忍；
 * 全部未命中返回 null——调用方降级为原文展示，不虚构位置。
 * 使用方：xml-formatter（extractParserError 适配层）与 xml-json（locateXmlError 适配层）。
 */

/**
 * DOMParser 结果的引擎无关投影（注入缝）：只暴露 parsererror 文本。
 * 测试注入 Chromium/WebKit 形态的快照即可覆盖各引擎差异；生产默认实现走平台
 * 原生 DOMParser（票据 04/05 共用的校验权威，浏览器/WebView 均内置）。
 */
export type ParseXml = (xml: string) => { parserErrorText: string | null }

/**
 * 生产权威：原生 DOMParser 解析 'application/xml'。
 * parsererror 无论作为文档子元素还是根元素都能取到（getElementsByTagName
 * 覆盖两形态，无需 querySelector + 根元素回退两条路径）。
 */
export function parseWithDomParser(xml: string): { parserErrorText: string | null } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const errorEl =
    doc.getElementsByTagName('parsererror')[0] ??
    (doc.documentElement?.nodeName.toLowerCase() === 'parsererror' ? doc.documentElement : null)
  return { parserErrorText: errorEl?.textContent ?? null }
}

/** Chromium/libxml2：`error on line 3 at column 8: <描述>` */
const CHROMIUM_POSITION_RE = /error on line (\d+) at column (\d+)(?::\s*([^\n]*))?/i
/** Firefox：`lineNumber: 2, columnNumber: 5` */
const CAMEL_POSITION_RE = /lineNumber\s*[:=]?\s*(\d+)\D{0,3}columnNumber\s*[:=]?\s*(\d+)/i
/** WebKit / 通用：`line 2, column 7: <描述>` / `(line 2, column 9)` */
const PLAIN_POSITION_RE = /\bline\s+(\d+),?\s+column\s+(\d+)(?:\s*:?\s*([^\n]*))?/i

const POSITION_PATTERNS = [CHROMIUM_POSITION_RE, CAMEL_POSITION_RE, PLAIN_POSITION_RE] as const

export interface XmlErrorPosition {
  line: number
  column: number
  /** 引擎给出的错误描述（组捕获缺失时为空串）。 */
  message: string
}

function cleanMessage(raw: string | undefined): string {
  return (raw ?? '').replace(/[)\]]+\s*$/, '').trim()
}

/**
 * 从 parsererror 文本中提取行/列（1-based）。任一形态命中即返回；
 * 全部未命中返回 null（调用方降级原文展示）。
 */
export function locateXmlErrorPosition(report: string): XmlErrorPosition | null {
  if (!report) return null
  for (const pattern of POSITION_PATTERNS) {
    const match = report.match(pattern)
    if (!match) continue
    return {
      line: Number(match[1]),
      column: Number(match[2]),
      message: cleanMessage(match[3]),
    }
  }
  return null
}
