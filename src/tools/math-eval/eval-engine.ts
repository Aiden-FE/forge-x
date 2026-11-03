/**
 * 数学表达式求值纯逻辑模块（expr-eval dynamic import，≈6 KB 落异步块）。
 *
 * 术语与口径见 CONTEXT.md：
 * - 逐行求值：多行输入自上而下顺序求值；`x = 5` 定义行把变量绑定进后续行的可见范围，
 *   可覆盖重绑；一行出错只错该行，其余行照常求值（「非法输入只错该处」的行级应用）；
 * - 浮点如实：IEEE 754 双精度结果完整呈现，不修约、不美化；
 * - 函数集全暴露库内置；库的函数定义行（`f(x)=…`）不做（出界，不特别处理、不展示）。
 *
 * 库口径注记（expr-eval 2.0.2 实测）：
 * - `^` 幂为右结合（2^3^2 = 512），一元负号绑定低于幂（-2^2 = -4）；
 * - 内置常量为 PI/E（大写），本模块为每行注入 pi/e 小写别名（可被用户重绑覆盖）；
 * - 库无 clamp/log(x,base)，函数集以库实际内置为准。
 */

import type { Parser } from 'expr-eval'

/** 输入上限：1 MiB（UTF-8 字节），超限截断并提示（平台惯例）。 */
export const MAX_INPUT_BYTES = 1024 * 1024

/** 会话内历史最近条数：整个多行块滚动淘汰。 */
export const HISTORY_LIMIT = 20

let parserPromise: Promise<Parser> | null = null

/** expr-eval 触达加载（dynamic import，首屏第三方增量 0）。 */
export function loadParser(): Promise<Parser> {
  if (parserPromise === null) {
    parserPromise = import('expr-eval').then((m) => new m.Parser())
  }
  return parserPromise
}

// ---- 求值结果结构 ----

/** 错误定位到行；kind 供 Vue 层映射文案，message 为库原文（语法错透传）。 */
export interface EvalError {
  kind: 'undefinedVar' | 'syntax' | 'runtime' | 'emptyValue'
  /** undefinedVar 时为变量名 */
  name?: string
  /** syntax/runtime 时为库原始报错文本 */
  message?: string
}

export type SpecialValue = 'inf' | 'neginf' | 'nan' | 'function'

export interface DefinitionRow {
  type: 'definition'
  /** 绑定名回显（定义行不显示结果值） */
  name: string
  ok: boolean
  error?: EvalError
}

export interface ExpressionRow {
  type: 'expression'
  ok: boolean
  /** 双精度完整呈现文本；∞ / -∞ / NaN 特殊着色 */
  text?: string
  special?: SpecialValue | null
  error?: EvalError
}

export type ScratchRow = DefinitionRow | ExpressionRow

export interface ScratchpadResult {
  rows: ScratchRow[]
  /** 是否发生 1 MiB 截断 */
  truncated: boolean
}

const DEFINITION_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)([\s\S]*)$/

/** 1 MiB 截断（按码点回退，避免劈开增补平面字符）。 */
export function enforceInputLimit(input: string): { text: string; truncated: boolean } {
  if (input.length <= 64 && input.length * 4 <= MAX_INPUT_BYTES) {
    return { text: input, truncated: false }
  }
  const bytes = new TextEncoder().encode(input)
  if (bytes.length <= MAX_INPUT_BYTES) return { text: input, truncated: false }
  let cut = MAX_INPUT_BYTES
  // 回退到 UTF-8 字符边界
  while (cut > 0 && (bytes[cut]! & 0xc0) === 0x80) cut--
  const text = new TextDecoder().decode(bytes.slice(0, cut))
  return { text, truncated: true }
}

/** 特殊值呈现：∞ / -∞ / NaN；函数值（库内部形态）不展示源码，仅标记。 */
export function formatValue(value: unknown): { text: string; special: SpecialValue | null } {
  if (typeof value === 'function') return { text: '—', special: 'function' }
  const n = value as number
  if (Number.isNaN(n)) return { text: 'NaN', special: 'nan' }
  if (n === Number.POSITIVE_INFINITY) return { text: '∞', special: 'inf' }
  if (n === Number.NEGATIVE_INFINITY) return { text: '-∞', special: 'neginf' }
  return { text: String(n), special: null }
}

function classifyError(err: unknown): EvalError {
  const message = err instanceof Error ? err.message : String(err)
  const match = /^undefined variable:\s*(.+)$/.exec(message)
  if (match) return { kind: 'undefinedVar', name: match[1]!.trim() }
  // 库语法错有两种原文形态：函数参数 "parse error [1:9]: Expected )" 与
  // 词法/结构 "unexpected TEOF: EOF"，统一归类 syntax、原文透传
  return /^(parse error|unexpected )/.test(message)
    ? { kind: 'syntax', message }
    : { kind: 'runtime', message }
}

/**
 * 逐行求值：定义行 `name = expr` 与表达式行混合，自上而下顺序求值；
 * 后续行可见前面所有绑定（可覆盖重绑）；一行出错只错该行，绑定不生效，
 * 其余行照常求值。
 */
export async function evaluateScratchpad(input: string): Promise<ScratchpadResult> {
  const { text: limited, truncated } = enforceInputLimit(input)
  const parser = await loadParser()

  // 每行可见作用域 = 基础常量（pi/e 小写别名）+ 会话内用户绑定（覆盖前者）
  const userScope: Record<string, number> = {}
  const rows: ScratchRow[] = []

  for (const rawLine of limited.split(/\r\n|\n|\r/)) {
    const line = rawLine.trim()
    if (line === '') continue

    const defMatch = DEFINITION_RE.exec(line)
    if (defMatch) {
      const name = defMatch[1] as string
      const rhs = (defMatch[2] as string).trim()
      if (rhs === '') {
        rows.push({ type: 'definition', name, ok: false, error: { kind: 'emptyValue' } })
        continue
      }
      try {
        const scope = { pi: Math.PI, e: Math.E, ...userScope }
        const value = parser.evaluate(rhs, scope)
        userScope[name] = value as number
        rows.push({ type: 'definition', name, ok: true })
      } catch (err) {
        rows.push({ type: 'definition', name, ok: false, error: classifyError(err) })
      }
      continue
    }

    try {
      const scope = { pi: Math.PI, e: Math.E, ...userScope }
      const value = parser.evaluate(line, scope)
      const formatted = formatValue(value)
      rows.push({ type: 'expression', ok: true, text: formatted.text, special: formatted.special })
    } catch (err) {
      rows.push({ type: 'expression', ok: false, error: classifyError(err) })
    }
  }

  return { rows, truncated }
}

// ---- 历史（整个多行块，滚动淘汰，点击回填） ----

export interface HistoryEntry {
  text: string
}

/**
 * 入历史：与队首相同的多行块不重复记录；超 20 条滚动淘汰。
 */
export function pushHistory(history: HistoryEntry[], text: string): HistoryEntry[] {
  const trimmed = text.trim()
  if (trimmed === '') return history
  if (history.length > 0 && history[0]!.text === text) return history
  const next = [{ text }, ...history]
  return next.length > HISTORY_LIMIT ? next.slice(0, HISTORY_LIMIT) : next
}
