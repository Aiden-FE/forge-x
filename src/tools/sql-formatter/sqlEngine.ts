/**
 * SQL 格式化纯逻辑模块（零 DOM 依赖，node 可单测）。
 *
 * 术语与口径见 CONTEXT.md：
 * - SQL 格式化：15 种方言、实时防抖输出、只管排版不管对错；
 * - 尽力而为格式化（Best-Effort Formatting）：不校验 SQL 语义，垃圾进、美化的垃圾出；
 *   报错只发生在词法层崩溃时（库内 tokenizer 抛 Parse error），报错时调用方保留上一次输出。
 *
 * 依赖 sql-formatter（平台唯一体积豁免：按需 ≤80 KB gzip），只在 Worker 内随
 * dynamic import 加载——本模块被主线程的 Vue 组件引用（取方言清单等常量），
 * 因此库的加载点必须保持 `await import('sql-formatter')` 形态，绝不顶层引入。
 *
 * 规格决策（.scratch/hot-tools-v0.4.0/issues/07）：
 * - 方言 15 个全部映射到库内真实标识（v15 原生支持 tidb，无替代项）；
 * - 选项集 5 项（缩进宽度 / 关键字大小写 / 表达式换行宽度 / 多语句间空行数 /
 *   运算符密集模式）；规格原列的第 6 项 commaPosition 已在 sql-formatter 15
 *   上游移除（validateConfig 的 removedOptions 列表，传入即抛 ConfigError），
 *   自实现逗号重排与本规格拒绝 minify 的同一理由冲突（字符串/注释边界风险），
 *   newlineBeforeSemicolon / logicalOperatorNewline 又被规格 §2 明确排除
 *   （走库默认）——故缺位并留档（详见规格偏差报告）。
 * - identifierCase 明确排除（库内已知缺陷），任何入口都不出现。
 */

/** 15 种方言的库内标识，下拉顺序即规格顺序（标准 SQL 默认）。 */
export const DIALECTS = [
  'sql',
  'mysql',
  'mariadb',
  'tidb',
  'postgresql',
  'plsql',
  'sqlite',
  'transactsql',
  'bigquery',
  'hive',
  'spark',
  'trino',
  'redshift',
  'db2',
  'n1ql',
] as const

export type DialectId = (typeof DIALECTS)[number]

export const DEFAULT_DIALECT: DialectId = 'sql'

/** 缩进宽度：2 / 4 / Tab（规格 §2 第 1 项，默认 2）。 */
export const INDENT_CHOICES = ['2', '4', 'tab'] as const
export type IndentChoice = (typeof INDENT_CHOICES)[number]
export const DEFAULT_INDENT: IndentChoice = '2'

/** 关键字大小写：保留 / UPPER / lower（默认 UPPER）。 */
export const KEYWORD_CASES = ['upper', 'preserve', 'lower'] as const
export type KeywordCaseChoice = (typeof KEYWORD_CASES)[number]
export const DEFAULT_KEYWORD_CASE: KeywordCaseChoice = 'upper'

export const DEFAULT_EXPRESSION_WIDTH = 50
export const MIN_EXPRESSION_WIDTH = 1
export const MAX_EXPRESSION_WIDTH = 200

/** 多语句间空行数 0–5（默认 1）。 */
export const LINES_BETWEEN_MIN = 0
export const LINES_BETWEEN_MAX = 5
export const DEFAULT_LINES_BETWEEN = 1

export interface SqlFormatOptions {
  dialect: DialectId
  indent: IndentChoice
  keywordCase: KeywordCaseChoice
  expressionWidth: number
  linesBetweenQueries: number
  denseOperators: boolean
}

export const DEFAULT_OPTIONS: SqlFormatOptions = {
  dialect: DEFAULT_DIALECT,
  indent: DEFAULT_INDENT,
  keywordCase: DEFAULT_KEYWORD_CASE,
  expressionWidth: DEFAULT_EXPRESSION_WIDTH,
  linesBetweenQueries: DEFAULT_LINES_BETWEEN,
  denseOperators: false,
}

export type SqlFormatOutcome = { ok: true; sql: string } | { ok: false; error: string }

/** Worker 请求/响应载荷（format.worker.ts 薄壳只做转发）。 */
export interface SqlFormatRequest {
  input: string
  options: SqlFormatOptions
}
export type SqlFormatResponse = SqlFormatOutcome

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  const int = Math.trunc(value)
  return Math.min(max, Math.max(min, int))
}

/** expressionWidth 入口钳制：库要求正数（否则 ConfigError），UI 之外仍守边界。 */
export function clampExpressionWidth(value: number): number {
  return clampInt(value, MIN_EXPRESSION_WIDTH, MAX_EXPRESSION_WIDTH, DEFAULT_EXPRESSION_WIDTH)
}

export function clampLinesBetween(value: number): number {
  return clampInt(value, LINES_BETWEEN_MIN, LINES_BETWEEN_MAX, DEFAULT_LINES_BETWEEN)
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 格式化一段 SQL。空输入（仅空白）→ 空输出；词法崩溃 → ok:false + 错误信息
 * （含库内 Parse error 的行/列定位），调用方按「尽力而为格式化」保留旧输出。
 */
export async function formatSql(input: string, options: SqlFormatOptions): Promise<SqlFormatOutcome> {
  if (input.trim() === '') return { ok: true, sql: '' }
  try {
    // 唯一加载点：sql-formatter 只随本次调用进入 Worker 的异步依赖图。
    const { format } = await import('sql-formatter')
    const sql = format(input, {
      language: options.dialect,
      useTabs: options.indent === 'tab',
      tabWidth: options.indent === 'tab' ? 2 : Number(options.indent),
      keywordCase: options.keywordCase,
      expressionWidth: clampExpressionWidth(options.expressionWidth),
      linesBetweenQueries: clampLinesBetween(options.linesBetweenQueries),
      denseOperators: options.denseOperators,
    })
    return { ok: true, sql }
  } catch (e) {
    return { ok: false, error: describeError(e) }
  }
}
