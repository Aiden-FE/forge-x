/**
 * URL 查询编辑器纯逻辑（0 依赖、自解析、不用 URLSearchParams——其串行化会把
 * `/`→`%2F`、空格→`+`，破坏未编辑参数的字节保真；CONTEXT.md 原样保真）。
 *
 * 术语与口径见 CONTEXT.md：
 * - 原样保真（Raw Fidelity）：未编辑参数按原始字节输出（原有百分号编码、+、
 *   编码大小写一律不动），只有编辑过的参数才重编码（encodeURIComponent，空格 → %20）；
 * - 参数实例（Param Instance）：一行 = 查询串中参数的一次出现，同名键不合并，
 *   行序 = 输出顺序；key-only 行输出不带 =；
 * - 解码按 urlencoded 惯例 + = 空格；%ZZ 类无效编码 → 该行错误，其余行照常
 *   （非法输入只错该处）。
 */

/** 参数实例：双层存储 = 原始子串（rawKey/rawValue）+ 解码值（key/value）。 */
export interface ParamRow {
  /** 行的稳定标识（Vue 列表 key），自增分配 */
  uid: number
  /** 原始 key 子串（原样保真的输出依据） */
  rawKey: string
  /** 原始 value 子串；null = key-only 行（无 =） */
  rawValue: string | null
  /** 解码后的 key（+ = 空格；解码失败时等于 rawKey 并置 keyError） */
  key: string
  /** 解码后的 value；key-only 行为 '' */
  value: string
  /** 用户编辑过 key → 输出按 encodeURIComponent(key) 重编码 */
  keyEdited: boolean
  /** 用户编辑过 value → 输出按 encodeURIComponent(value) 重编码 */
  valueEdited: boolean
  /** key 含无效百分号编码（行级错误） */
  keyError: boolean
  /** value 含无效百分号编码（行级错误） */
  valueError: boolean
}

export type QueryMode = 'url' | 'query'

/** 骨架元信息：query 两侧的字节级原文。 */
export interface DocMeta {
  mode: QueryMode
  /** query 之前的全部原文：URL 模式 = protocol/host/path（含 '?'，有 query 时）；参数串模式 = '?' 或 '' */
  head: string
  /** query 之后的全部原文（'#frag' 含 '#'，或 ''），字节级原样保留 */
  tail: string
}

export interface ParsedDoc extends DocMeta {
  rows: ParamRow[]
}

/** 解码一个原始子串：+ = 空格，百分号解码；无效编码（%ZZ、残缺、坏代理对）→ 错误。 */
export function decodePart(raw: string): { ok: true; value: string } | { ok: false } {
  const withSpaces = raw.replace(/\+/g, ' ')
  try {
    return { ok: true, value: decodeURIComponent(withSpaces) }
  } catch {
    return { ok: false }
  }
}

let uidSeed = 0
/** 新增行分配稳定 uid（Vue 列表 key 用）。 */
export function nextRowUid(): number {
  return ++uidSeed
}

/** 解析查询串段（不含 '?' 与 '#frag' 骨架）：一行一个参数实例，空段也保留为行。 */
export function parseQueryBody(body: string): ParamRow[] {
  if (body === '') return []
  const rows: ParamRow[] = []
  for (const segment of body.split('&')) {
    const eq = segment.indexOf('=')
    const rawKey = eq === -1 ? segment : segment.slice(0, eq)
    const rawValue = eq === -1 ? null : segment.slice(eq + 1)
    const decodedKey = decodePart(rawKey)
    const decodedValue = rawValue === null ? { ok: true as const, value: '' } : decodePart(rawValue)
    rows.push({
      uid: nextRowUid(),
      rawKey,
      rawValue,
      key: decodedKey.ok ? decodedKey.value : rawKey,
      value: decodedValue.ok ? decodedValue.value : rawValue ?? '',
      keyEdited: false,
      valueEdited: false,
      keyError: !decodedKey.ok,
      valueError: !decodedValue.ok,
    })
  }
  return rows
}

/**
 * 输入形态自动识别（规格 §1）：含 '://' 或以 '/?' 开头 → URL 模式，
 * protocol/host/path/hash 只读、只编辑 query；否则纯参数串模式（?a=1 或 a=1）。
 */
export function detectMode(input: string): QueryMode {
  if (input.includes('://')) return 'url'
  if (input.startsWith('/?')) return 'url'
  return 'query'
}

/** 解析整段输入为可编辑文档：head/tail 原样保留，rows 可编辑。 */
export function parseQueryInput(input: string): ParsedDoc {
  if (input === '') return { mode: 'query', head: '', tail: '', rows: [] }

  const mode = detectMode(input)
  if (mode === 'query') {
    // 参数串模式：'?a=1' 或 'a=1' 皆可；'#' 不做特殊切分，按原始字节留在参数值里
    const leading = input.startsWith('?')
    return {
      mode,
      head: leading ? '?' : '',
      tail: '',
      rows: parseQueryBody(leading ? input.slice(1) : input),
    }
  }

  // URL 模式：第一个 '?'（在 '#' 之前）开 query；'#' 起为 fragment 原样保留
  const hashIdx = input.indexOf('#')
  const qIdx = input.indexOf('?')
  const hasQuery = qIdx !== -1 && (hashIdx === -1 || qIdx < hashIdx)
  if (hasQuery) {
    const head = input.slice(0, qIdx + 1)
    const body = input.slice(qIdx + 1, hashIdx === -1 ? input.length : hashIdx)
    const tail = hashIdx === -1 ? '' : input.slice(hashIdx)
    return { mode, head, tail, rows: parseQueryBody(body) }
  }
  // 无 query：head = '#' 前的全部，tail = '#' 起（含 '#'）
  const head = hashIdx === -1 ? input : input.slice(0, hashIdx)
  const tail = hashIdx === -1 ? '' : input.slice(hashIdx)
  return { mode, head, tail, rows: [] }
}

/** 重编码口径：encodeURIComponent（空格 → %20，不用 + 的歧义历史口径）。 */
export function encodePart(value: string): string {
  return encodeURIComponent(value)
}

/** 单行序列化：key-only 且未填值 → 无 '='；编辑过的部分重编码。 */
export function serializeRow(row: ParamRow): string {
  const key = row.keyEdited ? encodePart(row.key) : row.rawKey
  if (row.rawValue === null && !row.valueEdited) return key // key-only 行输出不带 =
  const value = row.valueEdited ? encodePart(row.value) : row.rawValue!
  return `${key}=${value}`
}

/**
 * 重组输出：未编辑参数按原始字节，编辑过的才重编码；行序即输出顺序，
 * 开启排序时按解码 key 字典序（稳定排序，等键保持实例序）。
 */
export function buildOutput(meta: DocMeta, rows: readonly ParamRow[], sortOn: boolean): string {
  const ordered = sortOn
    ? [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    : rows
  const body = ordered.map(serializeRow).join('&')
  // URL 模式原本无 query 而用户添加了行：在 head 与 body 之间补 '?'（骨架其余字节不动）
  const needsMark = body !== '' && meta.mode === 'url' && !meta.head.endsWith('?')
  return meta.head + (needsMark ? '?' : '') + body + meta.tail
}
