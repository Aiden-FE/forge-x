/**
 * JSON · YAML · TOML 互转纯逻辑（10 票扩展）。
 *
 * - 六方向转换：源/目标格式各取 JSON / YAML / TOML（from === to 时为同格式
 *   规范化）；统一入口 convertFormat（异步——smol-toml 首用 dynamic import，
 *   首屏第三方增量 0 不变，见平台附录 §1）。
 * - 值保真口径（票据锁定）：
 *   - smol-toml 解析 `integersAsBigInt: 'asNeeded'`：> 2^53−1 的整数保 BigInt；
 *     序列化 `numbersAsFloat: true`：`1.0` 不降级为 `1`。
 *   - TOML → JSON/YAML：大整数字符串化、datetime（TomlDate）经 toISOString()
 *     降级为字符串——原形态字面保留（date/time 字面原样，datetime 补齐 ISO T
 *     与毫秒）；两者均以 notices 显式声明，不静默。
 *   - 逆向不复活：JSON/YAML 字符串 → TOML 仍是字符串，不恢复 datetime/整数
 *     类型；TOML 字面 `007`（前导零）按规范拒绝并给出行列定位。
 *   - `unsafeKeyBehaviour: 'keep'`（JSON.parse 同语义）：`__proto__` 等键作
 *     为自身属性保留；降级克隆一律逐键 Object.defineProperty 重建——绝不用
 *     Object.assign / 普通赋值整表拷贝（避免原型污染语义）。
 *   - 注释丢失（TOML/YAML 源的注释不保留）由 UI 常驻声明。
 *   - legacy TomlDate（useLegacyDate，跨 webview 稳）：精度为毫秒，亚毫秒
 *     （TOML 允许 µs）截断——已声明限制。
 * - 词法错误带行/列定位（JSON position、YAML mark、TOML TomlError line/column）。
 */

import { CORE_SCHEMA, dump, load, mergeTag } from 'js-yaml'

const yamlSchema = CORE_SCHEMA.withTags(mergeTag)

/** 实时防抖间隔（转换类工具平台约定，附录 §2）。 */
export const CONVERT_DEBOUNCE_MS = 300

export type ConversionFormat = 'json' | 'yaml' | 'toml'

/** @deprecated 兼容旧名：等价于 ConversionFormat。 */
export type ConversionSource = ConversionFormat

export class ConversionSyntaxError extends Error {
  readonly source: ConversionSource
  readonly line?: number
  readonly column?: number

  constructor(options: {
    source: ConversionSource
    message: string
    line?: number
    column?: number
  }) {
    super(options.message)
    this.name = 'ConversionSyntaxError'
    this.source = options.source
    this.line = options.line
    this.column = options.column
  }
}

/* ------------------------------------------------------------------ *
 * 值保真声明（10 票）：转换动态产生、UI 显式呈现的降级事件
 * ------------------------------------------------------------------ */

export type ConversionNoticeCode = 'bigint-stringified' | 'datetime-stringified'

export interface ConversionNotice {
  code: ConversionNoticeCode
  count: number
}

export type FormatConversionOutcome =
  | { ok: true; value: string; notices: ConversionNotice[] }
  | { ok: false; error: ConversionSyntaxError }

/* ------------------------------------------------------------------ *
 * smol-toml（首用 dynamic import，平台附录 §1）
 * ------------------------------------------------------------------ */

type TomlModule = typeof import('smol-toml')

let cachedToml: TomlModule | null = null

async function loadToml(): Promise<TomlModule> {
  if (!cachedToml) {
    cachedToml = await import('smol-toml')
  }
  return cachedToml
}

/* ------------------------------------------------------------------ *
 * 输入解析（三种源格式；行列定位）
 * ------------------------------------------------------------------ */

function isEmptyInput(value: string): boolean {
  return value.trim().length === 0
}

function findJsonLocation(input: string, error: unknown): {
  line?: number
  column?: number
} {
  const message = error instanceof Error ? error.message : ''
  const location = message.match(/line\s+(\d+)\D+column\s+(\d+)|position\s+(\d+)/i)
  if (!location) {
    return {}
  }

  if (location[1] !== undefined && location[2] !== undefined) {
    return { line: Number(location[1]), column: Number(location[2]) }
  }

  const offset = Number(location[3])
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

function findYamlLocation(error: unknown): {
  line?: number
  column?: number
} {
  const mark = (error as { mark?: { line?: unknown; column?: unknown } }).mark
  if (
    typeof mark?.line === 'number' &&
    typeof mark.column === 'number'
  ) {
    return { line: mark.line + 1, column: mark.column + 1 }
  }

  return {}
}

function parseJsonValue(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch (error) {
    const location = findJsonLocation(input, error)
    throw new ConversionSyntaxError({
      source: 'json',
      message: error instanceof Error ? error.message : 'Invalid JSON',
      ...location,
    })
  }
}

function parseYamlValue(input: string): unknown {
  try {
    return load(input, { schema: yamlSchema })
  } catch (error) {
    const location = findYamlLocation(error)
    throw new ConversionSyntaxError({
      source: 'yaml',
      message: error instanceof Error ? error.message : 'Invalid YAML',
      ...location,
    })
  }
}

async function parseTomlValue(input: string): Promise<unknown> {
  const toml = await loadToml()
  try {
    return toml.parse(input, {
      // 保真组合拳（票据锁定）：仅超出安全整数范围的值用 BigInt 承载。
      integersAsBigInt: 'asNeeded',
      // legacy TomlDate：不依赖 Temporal（webview 可用性不稳）；精度毫秒（声明）。
      useLegacyDate: true,
      // JSON.parse 同语义：__proto__ 等键保留为自身属性，不静默丢弃/报错。
      unsafeKeyBehaviour: 'keep',
    })
  } catch (error) {
    if (error instanceof toml.TomlError) {
      throw new ConversionSyntaxError({
        source: 'toml',
        message: error.message,
        line: error.line,
        column: error.column,
      })
    }
    throw new ConversionSyntaxError({
      source: 'toml',
      message: error instanceof Error ? error.message : 'Invalid TOML',
    })
  }
}

/* ------------------------------------------------------------------ *
 * TOML 原生值降级（目标为 JSON/YAML 时；记数入 notices）
 * ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 递归克隆为 JSON 安全值：BigInt → 十进制字符串、TomlDate → toISOString()
 * 字面（原形态）。不 Object.assign / 不普通赋值整表拷贝：`__proto__` 等键逐个
 * defineProperty 重建为自身属性（普通赋值会写原型而非自身键）。
 */
function degradeTomlNatives(
  value: unknown,
  TomlDateCtor: TomlModule['TomlDate'],
  notices: Map<ConversionNoticeCode, number>,
): unknown {
  if (typeof value === 'bigint') {
    notices.set('bigint-stringified', (notices.get('bigint-stringified') ?? 0) + 1)
    return value.toString()
  }
  if (value instanceof TomlDateCtor) {
    notices.set('datetime-stringified', (notices.get('datetime-stringified') ?? 0) + 1)
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return value.map((item) => degradeTomlNatives(item, TomlDateCtor, notices))
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      const degraded = degradeTomlNatives(value[key], TomlDateCtor, notices)
      Object.defineProperty(out, key, {
        value: degraded,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    return out
  }
  return value
}

/* ------------------------------------------------------------------ *
 * 序列化（三种目标格式）
 * ------------------------------------------------------------------ */

const YAML_DUMP_OPTIONS = {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
} as const

function stringifyYamlValue(value: unknown): string {
  return dump(value, YAML_DUMP_OPTIONS)
}

async function stringifyTomlValue(value: unknown): Promise<string> {
  const toml = await loadToml()
  // numbersAsFloat：无小数部分的浮点数不降级为整数（`1.0` 保持 `1.0`）。
  return toml.stringify(value, { numbersAsFloat: true })
}

/* ------------------------------------------------------------------ *
 * 六方向统一入口
 * ------------------------------------------------------------------ */

/**
 * 按源/目标格式转换。from === to 时为同格式规范化（parse + 再序列化）。
 * 错误一律以 ConversionSyntaxError 返回（不抛出），携带源格式与行列定位。
 */
export async function convertFormat(
  input: string,
  from: ConversionFormat,
  to: ConversionFormat,
): Promise<FormatConversionOutcome> {
  if (isEmptyInput(input)) {
    return {
      ok: false,
      error: new ConversionSyntaxError({ source: from, message: 'empty input' }),
    }
  }

  let parsed: unknown
  try {
    parsed = from === 'json'
      ? parseJsonValue(input)
      : from === 'yaml'
        ? parseYamlValue(input)
        : await parseTomlValue(input)
  } catch (error) {
    return { ok: false, error: error as ConversionSyntaxError }
  }

  const notices: Map<ConversionNoticeCode, number> = new Map()
  try {
    // TOML 源的 BigInt / TomlDate：目标为 TOML（规范化）时原样保留（原生可
    // 序列化）；目标为 JSON/YAML 时降级并计数（声明化，不静默）。
    let value = parsed
    if (from === 'toml' && to !== 'toml') {
      const toml = await loadToml()
      value = degradeTomlNatives(parsed, toml.TomlDate, notices)
    }

    const output = to === 'json'
      ? JSON.stringify(value, null, 2)
      : to === 'yaml'
        ? stringifyYamlValue(value)
        : await stringifyTomlValue(value)

    return { ok: true, value: output, notices: [...notices].map(([code, count]) => ({ code, count })) }
  } catch (error) {
    return {
      ok: false,
      error: new ConversionSyntaxError({
        source: to,
        message: error instanceof Error ? error.message : 'Conversion failed',
      }),
    }
  }
}

/* ------------------------------------------------------------------ *
 * 旧同步 API（JSON↔YAML 双向，既有测试与调用方兼容；逻辑与上面共享）
 * ------------------------------------------------------------------ */

export function jsonToYaml(input: string): string {
  if (isEmptyInput(input)) {
    throw new ConversionSyntaxError({
      source: 'json',
      message: 'empty input',
    })
  }

  return stringifyYamlValue(parseJsonValue(input))
}

export function yamlToJson(input: string): string {
  if (isEmptyInput(input)) {
    throw new ConversionSyntaxError({
      source: 'yaml',
      message: 'empty input',
    })
  }

  return JSON.stringify(parseYamlValue(input), null, 2)
}
