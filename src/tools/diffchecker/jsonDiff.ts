/**
 * JSON 结构化 diff 纯逻辑（10 票扩展）——树遍历 0 依赖自实现，不依赖 Vue。
 *
 * 口径（票据锁定 + CONTEXT.md）：
 * - 两输入先各自 JSON.parse；解析错误按侧定位（行/列），互不掩盖。
 * - 输出变更路径清单：JSON Pointer 风格路径（RFC 6901 转义）+ 增/删/改 +
 *   旧值→新值预览；顺序为文档序合并（镜像文档布局，见 walk 注释）。
 * - 数组按索引对齐：同下标递归、单侧越界段整段增/删；移动检测与 LCS 对齐
 *   属出界（声明，不做）。
 * - 空态：双空 → both-empty；单侧空 → 按全部删除/全部新增正常呈现（沿
 *   diffchecker 空状态口径）。
 * - 相等语义：按 JSON 值深度相等（类型严格：1 与 "1" 不等）。
 */

export type JsonDiffSide = 'left' | 'right'

export interface JsonParseIssue {
  side: JsonDiffSide
  message: string
  line?: number
  column?: number
}

export type JsonChangeType = 'added' | 'removed' | 'changed'

export interface JsonChange {
  type: JsonChangeType
  /** RFC 6901 JSON Pointer（`~`→`~0`、`/`→`~1`）；根路径为空串。 */
  path: string
  /** removed / changed 携带旧值。 */
  oldValue?: unknown
  /** added / changed 携带新值。 */
  newValue?: unknown
}

export type JsonDiffStatus = 'same' | 'both-empty' | 'diff'

export interface JsonDiffResult {
  status: JsonDiffStatus
  changes: JsonChange[]
  addedCount: number
  removedCount: number
  changedCount: number
}

export type JsonDiffOutcome =
  | { ok: true; result: JsonDiffResult }
  | { ok: false; issues: JsonParseIssue[] }

/* ------------------------------------------------------------------ *
 * JSON.parse 与行/列定位
 * ------------------------------------------------------------------ */

/**
 * 定位 JSON.parse 语法错误在原文中的行/列（1 基）。
 *
 * V8 消息三形态（按优先级）：
 * 1. `... in JSON at position N (line X column Y)` —— 多行输入常见，直接取；
 * 2. `... in JSON at position N`（旧 V8）—— 由 offset 换算行列；
 * 3. `Unexpected token 'X', "..." is not valid JSON`（单行输入常见）——
 *    消息不带位置，退化为在原文中定位 token 的首个**非字符串上下文**
 *    出现处（跳过字符串字面量，避免 `"x]"` 里的 ] 误导定位）。
 * 其余（如不带 token 的截断错误）尽力而为：不强行给出位置。
 */
function findJsonLocation(input: string, error: unknown): {
  line?: number
  column?: number
} {
  const message = error instanceof Error ? error.message : ''
  const location = message.match(/line\s+(\d+)\D+column\s+(\d+)|position\s+(\d+)/i)
  if (location) {
    if (location[1] !== undefined && location[2] !== undefined) {
      return { line: Number(location[1]), column: Number(location[2]) }
    }
    return offsetToLineColumn(input, Number(location[3]))
  }

  const token = message.match(/Unexpected token '(.+?)'/i)
  if (token) {
    const offset = findTokenOutsideStrings(input, token[1])
    // 旧 V8 的 `position` 报在 token 结束处（如 `{"ok": ]}` → 8），
    // 回退定位对齐该语义，保证跨环境行列一致。
    if (offset >= 0) return offsetToLineColumn(input, offset + token[1].length)
  }

  return {}
}

function offsetToLineColumn(input: string, offset: number): { line: number; column: number } {
  const bounded = Math.min(Math.max(offset, 0), input.length)
  let line = 1
  let column = 1
  for (let index = 0; index < bounded; index += 1) {
    if (input[index] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

/** 在原文中定位 token 首个非字符串上下文出现处（0 基 offset；未找到 -1）。 */
function findTokenOutsideStrings(input: string, token: string): number {
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char === '"') {
      // 跳过整个字符串字面量（处理 \" 转义）。
      index += 1
      while (index < input.length) {
        if (input[index] === '\\') {
          index += 2
          continue
        }
        if (input[index] === '"') break
        index += 1
      }
      continue
    }
    if (input.startsWith(token, index)) return index
  }
  return -1
}

type ParsedSide = { ok: true; value: unknown } | { ok: false; issue: JsonParseIssue }

/** 解析单侧输入；空串/纯空白视为「无值」（undefined），不算解析错误。 */
function parseSide(text: string, side: JsonDiffSide): ParsedSide {
  if (text.trim() === '') return { ok: true, value: undefined }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return {
      ok: false,
      issue: {
        side,
        message: error instanceof Error ? error.message : 'Invalid JSON',
        ...findJsonLocation(text, error),
      },
    }
  }
}

/* ------------------------------------------------------------------ *
 * 树遍历（0 依赖）
 * ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON 值深度相等（类型严格：number 1 ≠ string "1"）。 */
export function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => jsonDeepEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(b, key) && jsonDeepEqual(a[key], b[key]),
    )
  }
  return false
}

function escapePointerKey(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

function walk(left: unknown, right: unknown, path: string, changes: JsonChange[]): void {
  if (jsonDeepEqual(left, right)) return

  // 单侧缺失（含单侧空输入场景）：整 subtree 一条记录，不再下钻枚举。
  if (left === undefined) {
    changes.push({ type: 'added', path, newValue: right })
    return
  }
  if (right === undefined) {
    changes.push({ type: 'removed', path, oldValue: left })
    return
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    // 数组按索引对齐：同下标递归；越界段整段增/删（移动/LCS 出界）。
    const shared = Math.min(left.length, right.length)
    for (let index = 0; index < shared; index += 1) {
      walk(left[index], right[index], `${path}/${index}`, changes)
    }
    for (let index = shared; index < right.length; index += 1) {
      changes.push({ type: 'added', path: `${path}/${index}`, newValue: right[index] })
    }
    for (let index = shared; index < left.length; index += 1) {
      changes.push({ type: 'removed', path: `${path}/${index}`, oldValue: left[index] })
    }
    return
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    // 文档序合并：按左文档键序下钻（改/删），右文档中先于下一个共有键
    // 出现的新增键就地插入——清单顺序镜像文档布局，不把新增堆到对象末尾。
    // （共有键在两侧文档中的相对次序不同时，以左文档为准；游标单调不回扫。）
    const rightKeys = Object.keys(right)
    const rightIndex = new Map<string, number>()
    rightKeys.forEach((key, index) => rightIndex.set(key, index))
    let cursor = 0
    const emitAddedBefore = (target: number): void => {
      for (; cursor < target; cursor += 1) {
        const key = rightKeys[cursor]
        if (key === undefined) continue
        if (!Object.prototype.hasOwnProperty.call(left, key)) {
          changes.push({
            type: 'added',
            path: `${path}/${escapePointerKey(key)}`,
            newValue: right[key],
          })
        }
      }
    }
    for (const key of Object.keys(left)) {
      const at = rightIndex.get(key)
      if (at === undefined) {
        changes.push({ type: 'removed', path: `${path}/${escapePointerKey(key)}`, oldValue: left[key] })
        continue
      }
      emitAddedBefore(at)
      cursor = Math.max(cursor, at + 1)
      walk(left[key], right[key], `${path}/${escapePointerKey(key)}`, changes)
    }
    emitAddedBefore(rightKeys.length)
    return
  }

  // 类型不同或标量值不同：一条「修改」。
  changes.push({ type: 'changed', path, oldValue: left, newValue: right })
}

/** 已解析值 → 变更路径清单。 */
export function computeJsonTreeDiff(left: unknown, right: unknown): JsonDiffResult {
  const changes: JsonChange[] = []
  walk(left, right, '', changes)
  const status: JsonDiffStatus = changes.length === 0 ? 'same' : 'diff'
  return {
    status,
    changes,
    addedCount: changes.filter((change) => change.type === 'added').length,
    removedCount: changes.filter((change) => change.type === 'removed').length,
    changedCount: changes.filter((change) => change.type === 'changed').length,
  }
}

/** 统一入口：两输入文本 → 解析（错误按侧定位）→ 树遍历。 */
export function computeJsonStructuredDiff(left: string, right: string): JsonDiffOutcome {
  if (left.trim() === '' && right.trim() === '') {
    return {
      ok: true,
      result: { status: 'both-empty', changes: [], addedCount: 0, removedCount: 0, changedCount: 0 },
    }
  }

  const parsedLeft = parseSide(left, 'left')
  const parsedRight = parseSide(right, 'right')
  const issues: JsonParseIssue[] = []
  if (!parsedLeft.ok) issues.push(parsedLeft.issue)
  if (!parsedRight.ok) issues.push(parsedRight.issue)
  if (!parsedLeft.ok || !parsedRight.ok) return { ok: false, issues }

  return { ok: true, result: computeJsonTreeDiff(parsedLeft.value, parsedRight.value) }
}

/* ------------------------------------------------------------------ *
 * 值预览（清单渲染用；纯函数可测）
 * ------------------------------------------------------------------ */

/** JSON 文本预览：紧凑序列化 + 超长截断（UTF-16 字符计）。 */
export function formatValuePreview(value: unknown, maxLength = 64): string {
  if (value === undefined) return ''
  let text: string
  try {
    text = JSON.stringify(value) ?? 'null'
  } catch {
    text = String(value)
  }
  if (text.length > maxLength) {
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`
  }
  return text
}
