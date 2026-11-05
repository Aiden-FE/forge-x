/**
 * XML 良构错误行/列容忍提取——共享单源（票据 04「DOMParser 为校验权威 + 行/列容忍提取」；
 * 票据 05 明示「复用 04 权威与行/列呈现」）。
 *
 * 引擎差异（Chromium/WebKit/Firefox 的 parsererror 文案各形）由正则组容忍；
 * 全部未命中返回 null——调用方降级为原文展示，不虚构位置。
 * 使用方：xml-formatter（extractParserError 适配层）与 xml-json（locateXmlError 适配层）。
 */

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
