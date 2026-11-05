/**
 * XML↔JSON 双向转换纯逻辑（UI 无关）。
 *
 * 术语与口径见根目录 CONTEXT.md：
 * - 语义保真 (Semantic Fidelity)：XML→JSON→XML 的承诺是**语义等价**而非字节级
 *   一致——元素、属性、文本、CDATA 内容往返语义一致；注释、XML 声明、DOCTYPE、
 *   处理指令与规范级空白为**已声明的丢失项**；混合内容（元素同时含文本与子元素）
 *   中文本与子元素的相对顺序不保证（fast-xml-parser 非 preserveOrder 模式，保序档
 *   出界）。
 * - 良构校验 (Well-formedness Check)：XML 侧以浏览器原生 DOMParser 为权威，
 *   只到良构不到 schema；错误行/列做容忍引擎差异的提取，失败降级原文展示。
 * - 值保真：`parseTagValue: false` + `parseAttributeValue: false`——值一律字符串
 *   无损（`007` / `1.00` / 身份证号不变形，镜像 csv-json 决议）。
 *
 * 映射约定（fast-xml-parser v5，帮助区速览表同源）：
 *   属性 → `@_` 前缀键；文本 → `#text`；同名重复标签 → 数组；CDATA → `#cdata`
 *   （cdataPropName 开启）；命名空间前缀原样保留不特判。
 *   注意 v5 的 `ignoreAttributes` 默认为 `true`（丢属性），必须显式 `false`
 *   才能兑现「属性 `@_` 前缀」的映射约定。
 *
 * fast-xml-parser@5 为首用 dynamic import（平台规则：第三方依赖不进首屏包），
 * 解析器与构建器实例缓存，两方向与所有输出路径共享同一配置。
 */

// Type-only: never enters the bundle; the value import is dynamic (below).
import type { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { locateXmlErrorPosition, parseWithDomParser } from '@/lib/xmlWellformed'

/** 粘贴（textarea）输入上限：1 MiB（UTF-8 字节计，共享单源 @/lib/pasteLimit）。 */
export { PASTE_MAX_BYTES, isPasteWithinLimit, utf8ByteLength } from '@/lib/pasteLimit'

/** 实时防抖间隔（规格：转换/校验类 300ms，共享单源 @/lib/pasteLimit）。 */
export { CONVERT_DEBOUNCE_MS } from '@/lib/pasteLimit'

import { isPasteWithinLimit } from '@/lib/pasteLimit'

export type Direction = 'xml-to-json' | 'json-to-xml'

export type XmlJsonErrorCode =
  | 'empty'
  | 'pasteTooLarge'
  | 'xmlNotWellFormed'
  | 'jsonInvalid'
  | 'jsonRootInvalid'
  | 'convert'

export interface XmlJsonError {
  code: XmlJsonErrorCode
  /** 库/解析器的原始信息（行/列由结构化字段携带，不混入 message）。 */
  message?: string
  /** 1-based 行号（良构/JSON 位置错误时存在）。 */
  line?: number
  /** 1-based 列号（良构/JSON 位置错误时存在）。 */
  column?: number
}

export type ConversionOutcome =
  | { ok: true; value: string }
  | { ok: false; error: XmlJsonError }

/* ------------------------------------------------------------------ *
 * 尺寸上限（共享单源 @/lib/pasteLimit：快速路径 + 精确 UTF-8 计数）
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 良构错误行/列容忍提取（正则组与 DOMParser 投影单源 src/lib/xmlWellformed.ts，
 * 与 xml-formatter 共享）
 * ------------------------------------------------------------------ */

export interface XmlErrorLocation {
  /** 引擎给出的描述（提取失败时为整段首行，供降级原文展示）。 */
  message: string
  line?: number
  column?: number
}


/**
 * 从 parsererror 文本中容忍提取行/列。任一形态命中即返回；全部未命中时
 * 行/列为 undefined、message 取首行（降级原文展示，不虚构位置）。
 */
export function locateXmlError(report: string): XmlErrorLocation {
  const firstLine = report.split(/\r?\n/).find((line) => line.trim() !== '') ?? ''
  const hit = locateXmlErrorPosition(report)
  if (!hit) return { message: firstLine.trim() || report.trim() }
  return { message: hit.message || firstLine.trim(), line: hit.line, column: hit.column }
}

/* ------------------------------------------------------------------ *
 * JSON.parse 位置错误提取（纯函数；offset → 行/列换算）
 * ------------------------------------------------------------------ */

export interface JsonErrorLocation {
  line?: number
  column?: number
}

/**
 * 从 `JSON.parse` 的报错信息中提取位置：现代 V8 报错同时含 `position N` 与
 * `(line L column C)`，优先取引擎自算的 line/column（免偏移换算歧义）；无该
 * 形态时把 `position N`（0-based 偏移）在原文上换算为 1-based 行/列。未携带
 * 位置信息时返回空对象（呈现降级为无定位报错）。
 */
export function locateJsonError(input: string, message: string): JsonErrorLocation {
  const lineColumn = message.match(/line\s+(\d+)\D+column\s+(\d+)/i)
  if (lineColumn) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) }
  }

  const position = message.match(/position\s+(\d+)/i)
  if (position) {
    const offset = Number(position[1])
    let line = 1
    let column = 1
    for (let index = 0; index < offset && index < input.length; index += 1) {
      if (input[index] === '\n') {
        line += 1
        column = 1
      } else {
        column += 1
      }
    }
    return { line, column }
  }

  return {}
}

/* ------------------------------------------------------------------ *
 * 良构校验（DOMParser 为权威；浏览器 API，测试环境为 happy-dom）
 * ------------------------------------------------------------------ */

export interface XmlWellFormedness {
  ok: boolean
  /** 良构失败时的描述（已提取行/列后的干净文本）。 */
  message: string
  line?: number
  column?: number
}

/**
 * 以平台原生 DOMParser 做 XML 良构前置校验（标签闭合、名字合法、实体可解析、
 * 无重复属性；不到 schema/命名空间语义）。不加载外部实体、零网络请求——
 * 无 XXE 面。行/列提取容忍引擎差异（见 locateXmlError），失败降级原文。
 * DOMParser 投影与 xml-formatter 共享单源（@/lib/xmlWellformed parseWithDomParser）。
 */
export function checkXmlWellFormed(xml: string): XmlWellFormedness {
  const { parserErrorText } = parseWithDomParser(xml)
  if (parserErrorText === null) return { ok: true, message: '' }

  const report = parserErrorText
  const located = locateXmlError(report)
  return { ok: false, ...located }
}

/** 良构校验器（可注入：测试环境注入与浏览器 Chromium 行径一致的替身）。 */
export type XmlWellFormednessChecker = (xml: string) => XmlWellFormedness

export interface ConvertOptions {
  /**
   * 良构校验器，默认为 checkXmlWellFormed（浏览器原生 DOMParser）。
   * 注入点沿 markdown-html loadSanitizer 先例：生产路径固定浏览器权威，
   * 测试在 happy-dom 解析器缺口（不支持 CDATA / DOCTYPE 内部子集）上
   * 注入 Chromium 同径替身。
   */
  checkWellFormed?: XmlWellFormednessChecker
}

/* ------------------------------------------------------------------ *
 * fast-xml-parser（首用 dynamic import；解析器/构建器各缓存一个实例）
 * ------------------------------------------------------------------ */

/**
 * 双方向共用的映射口径（库默认零配置 + 两处显式偏离）：
 * - `ignoreAttributes: false`：v5 默认 true 会丢属性，显式关掉以兑现 `@_` 映射；
 * - `parseTagValue/parseAttributeValue: false`：值一律字符串无损（规格锁定）；
 * - `cdataPropName: '#cdata'`：CDATA 独立成键（规格：开启）；
 * - `ignoreDeclaration/ignorePiTags: true`：声明与处理指令为已声明丢失项；
 *   `commentPropName` 保持 false——注释丢弃、无保留开关（规格锁定）。
 */
const MAPPING_OPTIONS = {
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  cdataPropName: '#cdata' as const,
  commentPropName: false as const,
  ignoreDeclaration: true,
  ignorePiTags: true,
  removeNSPrefix: false,
}

let cachedParser: XMLParser | null = null
let cachedBuilder: XMLBuilder | null = null

async function loadParser(): Promise<XMLParser> {
  if (!cachedParser) {
    const { XMLParser: Parser } = await import('fast-xml-parser')
    cachedParser = new Parser(MAPPING_OPTIONS)
  }
  return cachedParser
}

async function loadBuilder(): Promise<XMLBuilder> {
  if (!cachedBuilder) {
    const { XMLBuilder: Builder } = await import('fast-xml-parser')
    cachedBuilder = new Builder({
      ...MAPPING_OPTIONS,
      format: true,
      indentBy: '  ',
      suppressEmptyNode: false,
    })
  }
  return cachedBuilder
}

/* ------------------------------------------------------------------ *
 * 方向管线
 * ------------------------------------------------------------------ */

/**
 * JSON→XML 的顶层约束：XML 只能有单一根元素，故顶层必须是**恰好一个键**的
 * plain object（该键即根元素名）。顶层标量/数组/多键对象产出的 XML 必然
 * 非良构（多根或无名），按「尽力构建」口径直接拒绝并给明确报错。
 * 根名以 `@_`（属性）或 `#`（文本/CDATA 约定键）开头时同样无法命名元素，拒绝。
 */
function validateJsonRoot(value: unknown): XmlJsonError | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { code: 'jsonRootInvalid' }
  }
  const keys = Object.keys(value)
  if (keys.length !== 1) {
    return { code: 'jsonRootInvalid' }
  }
  const rootName = keys[0]!
  if (rootName.startsWith('@_') || rootName.startsWith('#')) {
    return { code: 'jsonRootInvalid' }
  }
  return null
}

/** XML→JSON：DOMParser 前置良构校验 → fast-xml-parser 解析 → 2 空格缩进 JSON。 */
export async function xmlToJson(
  xml: string,
  options: ConvertOptions = {},
): Promise<ConversionOutcome> {
  if (xml.trim() === '') return { ok: false, error: { code: 'empty' } }
  if (!isPasteWithinLimit(xml)) return { ok: false, error: { code: 'pasteTooLarge' } }

  const checkWellFormed = options.checkWellFormed ?? checkXmlWellFormed
  const wellFormedness = checkWellFormed(xml)
  if (!wellFormedness.ok) {
    return {
      ok: false,
      error: {
        code: 'xmlNotWellFormed',
        message: wellFormedness.message,
        line: wellFormedness.line,
        column: wellFormedness.column,
      },
    }
  }

  try {
    const parser = await loadParser()
    const parsed = parser.parse(xml)
    return { ok: true, value: JSON.stringify(parsed, null, 2) }
  } catch (caught) {
    return { ok: false, error: { code: 'convert', message: errorMessage(caught) } }
  }
}

/** JSON→XML：JSON.parse 位置错误呈现 → 单一根元素校验 → fast-xml-parser 构建。 */
export async function jsonToXml(json: string): Promise<ConversionOutcome> {
  if (json.trim() === '') return { ok: false, error: { code: 'empty' } }
  if (!isPasteWithinLimit(json)) return { ok: false, error: { code: 'pasteTooLarge' } }

  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Invalid JSON'
    return { ok: false, error: { code: 'jsonInvalid', message, ...locateJsonError(json, message) } }
  }

  const rootError = validateJsonRoot(value)
  if (rootError) return { ok: false, error: rootError }

  try {
    const builder = await loadBuilder()
    return { ok: true, value: builder.build(value) }
  } catch (caught) {
    return { ok: false, error: { code: 'convert', message: errorMessage(caught) } }
  }
}

/** 统一入口：按方向分派（组件防抖后调用）。 */
export async function convert(
  text: string,
  direction: Direction,
  options: ConvertOptions = {},
): Promise<ConversionOutcome> {
  return direction === 'xml-to-json' ? xmlToJson(text, options) : jsonToXml(text)
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}
