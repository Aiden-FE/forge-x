/**
 * Cron 解析/生成纯逻辑模块（依赖 cron-parser 与 cronstrue 均为 dynamic import）。
 *
 * 术语与口径见 CONTEXT.md：
 * - Cron 解析/生成：标准 5 字段与首位加秒的 6 字段（Spring `@Scheduled` 风格）自动识别，
 *   年份字段（7 字段）不支持；
 * - 周字段口径：0 与 7 都表示周日，1–6 为周一至周六（Unix 惯例）。不做 Quartz 口径
 *   （1=周日）的第二解释，仅对差异作常驻警示；
 * - 执行预览：基于当前时刻向后计算的下次 N 次触发时间，按所选 IANA 时区计算，
 *   夏令时跳变如实呈现，不做人工修正。
 *
 * 错误语义（平台约定「非法输入只错该处」的字段级特化）：
 * - cron-parser v5 不报告出错字段（且对 4 字段/空串等松散输入不报错），因此本模块
 *   先做逐字段严格预校验，把错误定位到具体字段；字段级错误时携带其余字段的
 *   partial 解析结果，供界面照常展示；
 * - 字段数不符（<5、>6）、年份字段 → 整串报错，不产出部分结果。
 */

// ---- 字段定义 ----

export type CronFieldName = 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow'

/** 用户可见字段顺序：6 字段时秒位在前；5 字段为分/时/日/月/周。 */
export const FIVE_FIELD_ORDER = ['minute', 'hour', 'dom', 'month', 'dow'] as const
export type FiveFieldName = (typeof FIVE_FIELD_ORDER)[number]
export const SIX_FIELD_ORDER: readonly CronFieldName[] = ['second', ...FIVE_FIELD_ORDER]

/** 各字段取值范围（周字段 0–7，7 ≡ 周日，见「周字段口径」）。 */
export const FIELD_RANGES: Record<CronFieldName, { min: number; max: number }> = {
  second: { min: 0, max: 59 },
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dom: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dow: { min: 0, max: 7 },
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Unix 口径：sun = 0，mon–sat = 1–6。 */
const DOW_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

// ---- 字段项结构 ----

/** 单个逗号分隔项：`*`、`*\/n`、`a`、`a-b`、`a-b/n`、`a/n`。 */
export type CronItem =
  | { kind: 'any'; step?: number }
  | { kind: 'single'; value: number; raw: string }
  | { kind: 'range'; from: number; to: number; raw: string; step?: number }
  | { kind: 'openStep'; from: number; step: number; raw: string }

export interface CronField {
  name: CronFieldName
  /** 原始文本（保留名称缩写与空格原样，用于速览高亮） */
  raw: string
  items: CronItem[]
}

// ---- 错误结构（数据化，文案由 Vue 层按 key 渲染） ----

export type CronError =
  | { scope: 'expression'; kind: 'empty' }
  | { scope: 'expression'; kind: 'fieldCount'; count: number }
  | { scope: 'expression'; kind: 'yearUnsupported'; count: number }
  | { scope: 'field'; field: CronFieldName; kind: 'token'; raw: string }
  | { scope: 'field'; field: CronFieldName; kind: 'range'; raw: string; value: number; min: number; max: number }
  | { scope: 'field'; field: CronFieldName; kind: 'reversed'; raw: string }
  | { scope: 'field'; field: CronFieldName; kind: 'step'; raw: string }

export type CronParse =
  | { ok: true; hasSeconds: boolean; fields: Record<CronFieldName, CronField> }
  | { ok: false; error: CronError; /** 字段级错误时其余字段的解析结果（「只错该处」） */ partial?: Partial<Record<CronFieldName, CronField>> }

// ---- 逐字段解析 ----

interface ParseItemResult {
  item?: CronItem
  error?: CronError
}

function parseValueToken(field: CronFieldName, tok: string): number | null {
  if (/^\d+$/.test(tok)) return Number(tok)
  if (field === 'month') return MONTH_NAMES[tok.toLowerCase()] ?? null
  if (field === 'dow') return DOW_NAMES[tok.toLowerCase()] ?? null
  return null
}

function rangeError(field: CronFieldName, raw: string, value: number): CronError {
  const { min, max } = FIELD_RANGES[field]
  return { scope: 'field', field, kind: 'range', raw, value, min, max }
}

function parseOneItem(field: CronFieldName, raw: string): ParseItemResult {
  const { min, max } = FIELD_RANGES[field]

  let base = raw
  let step: number | undefined
  const slash = raw.indexOf('/')
  if (slash >= 0) {
    base = raw.slice(0, slash)
    const stepRaw = raw.slice(slash + 1)
    if (!/^\d+$/.test(stepRaw) || Number(stepRaw) < 1) {
      return { error: { scope: 'field', field, kind: 'step', raw } }
    }
    step = Number(stepRaw)
  }

  if (base === '*') {
    return { item: slash >= 0 ? { kind: 'any', step } : { kind: 'any' } }
  }

  const dash = base.indexOf('-')
  if (dash > 0) {
    const fromTok = base.slice(0, dash)
    const toTok = base.slice(dash + 1)
    const from = parseValueToken(field, fromTok)
    const to = parseValueToken(field, toTok)
    if (from === null || to === null) {
      return { error: { scope: 'field', field, kind: 'token', raw } }
    }
    if (from < min || from > max) return { error: rangeError(field, raw, from) }
    if (to < min || to > max) return { error: rangeError(field, raw, to) }
    if (from > to) return { error: { scope: 'field', field, kind: 'reversed', raw } }
    return { item: { kind: 'range', from, to, raw, step } }
  }

  // `a/n`：自 a 起按 n 步进（等价 cron-parser 的开放步进口径）
  if (slash >= 0) {
    const from = parseValueToken(field, base)
    if (from === null) return { error: { scope: 'field', field, kind: 'token', raw } }
    if (from < min || from > max) return { error: rangeError(field, raw, from) }
    return { item: { kind: 'openStep', from, step: step as number, raw } }
  }

  const value = parseValueToken(field, base)
  if (value === null) return { error: { scope: 'field', field, kind: 'token', raw } }
  if (value < min || value > max) return { error: rangeError(field, raw, value) }
  return { item: { kind: 'single', value, raw } }
}

function parseField(field: CronFieldName, raw: string): CronField | CronError {
  const items: CronItem[] = []
  // 空列表项（如 "1,,3"、首尾逗号）
  if (raw.split(',').some((part) => part.trim() === '')) {
    return { scope: 'field', field, kind: 'token', raw }
  }
  for (const partRaw of raw.split(',')) {
    const res = parseOneItem(field, partRaw.trim())
    if (res.error) return res.error as Extract<CronError, { scope: 'field' }>
    items.push(res.item as CronItem)
  }
  return { name: field, raw, items }
}

/**
 * 解析 cron 表达式（严格口径，先于 cron-parser 执行）：
 * - 5/6 字段自动识别，7 字段报年份不支持，<5 或 >6 报字段数错误；
 * - 字段级错误仅指向该字段，partial 携带其余字段的解析结果。
 */
export function parseCron(expression: string): CronParse {
  const text = expression.trim()
  if (text === '') return { ok: false, error: { scope: 'expression', kind: 'empty' } }

  const tokens = text.split(/\s+/)
  const count = tokens.length

  if (count >= 7) {
    return { ok: false, error: { scope: 'expression', kind: 'yearUnsupported', count } }
  }
  if (count < 5) {
    return { ok: false, error: { scope: 'expression', kind: 'fieldCount', count } }
  }

  const hasSeconds = count === 6
  const order = hasSeconds ? SIX_FIELD_ORDER : FIVE_FIELD_ORDER

  // 全字段解析：出错字段定位到首个错误，其余字段照常进 partial（「只错该处」）
  const fields: Partial<Record<CronFieldName, CronField>> = {}
  let firstError: Extract<CronError, { scope: 'field' }> | null = null
  for (let i = 0; i < order.length; i++) {
    const name = order[i] as CronFieldName
    const res = parseField(name, tokens[i] as string)
    if ('kind' in res) {
      if (firstError === null) firstError = res as Extract<CronError, { scope: 'field' }>
    } else {
      fields[name] = res
    }
  }
  if (firstError !== null) {
    return { ok: false, error: firstError, partial: fields }
  }
  return { ok: true, hasSeconds, fields: fields as Record<CronFieldName, CronField> }
}

// ---- 字段白话解释（速览行，crontab.guru 风格） ----

export type Translate = (key: string, params?: Record<string, string | number>) => string

const EXPLAIN = {
  any: 'cronTool.explain.any',
  step: 'cronTool.explain.step',
  single: 'cronTool.explain.single',
  range: 'cronTool.explain.range',
  rangeStep: 'cronTool.explain.rangeStep',
  openStep: 'cronTool.explain.openStep',
  dow7: 'cronTool.explain.dow7',
  listSep: 'cronTool.explain.listSep',
} as const

function itemMentionsDow7(item: CronItem): boolean {
  if (item.kind === 'single') return item.value === 7
  if (item.kind === 'range') return item.to === 7
  return false
}

/** 单字段白话解释：dow 含 7 时附「7 = 周日」注记（周字段口径）。 */
export function explainField(field: CronField, t: Translate): string {
  const rendered = field.items.map((item) => {
    switch (item.kind) {
      case 'any':
        return item.step ? t(EXPLAIN.step, { step: item.step }) : t(EXPLAIN.any)
      case 'single':
        return t(EXPLAIN.single, { value: item.raw })
      case 'range':
        return item.step
          ? t(EXPLAIN.rangeStep, { from: item.from, to: item.to, step: item.step })
          : t(EXPLAIN.range, { from: item.from, to: item.to })
      case 'openStep':
        return t(EXPLAIN.openStep, { from: item.from, step: item.step })
    }
  })
  const joined = rendered.join(t(EXPLAIN.listSep))
  if (field.name === 'dow' && field.items.some(itemMentionsDow7)) {
    return `${joined}${t(EXPLAIN.dow7)}`
  }
  return joined
}

// ---- 执行预览（cron-parser，dynamic import） ----

export interface PreviewOptions {
  count?: number
  currentDate?: Date
  /** IANA 时区；缺省用本地时区 */
  tz?: string
}

export type PreviewResult =
  | { ok: true; runs: string[] }
  | { ok: false; message: string }

/** 本地时区（界面默认项）。 */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * 执行预览：从 currentDate 向后取下次 N 条触发时间，ISO（含时区偏移）如实呈现。
 * DST 跳变由 cron-parser 按 IANA 规则处理（不存在的时刻取下一个合法时刻）。
 */
export async function previewRuns(expression: string, options: PreviewOptions = {}): Promise<PreviewResult> {
  const { CronExpressionParser } = await import('cron-parser')
  try {
    const expr = CronExpressionParser.parse(expression, {
      currentDate: options.currentDate ?? new Date(),
      tz: options.tz ?? localTimeZone(),
    })
    // CronDate.toJSON() 类型为 string | null（luxon 无效时刻）；合法表达式不会出现 null
    const runs = expr
      .take(options.count ?? 5)
      .map((d) => d.toJSON())
      .filter((s): s is string => typeof s === 'string')
    return { ok: true, runs }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

// ---- 自然语言描述（cronstrue，locale 按需加载） ----

export type AppLocale = 'zh-CN' | 'en'

/** 应用语言 → cronstrue locale 包名；en 内置于主包，无需额外加载。 */
export const CRONSTRUE_LOCALE: Record<AppLocale, string> = {
  'zh-CN': 'zh_CN',
  en: 'en',
}

const loadedLocales = new Set<string>(['en'])

/**
 * 自然语言描述，语言跟随应用语言；locale 包按需加载（触达加载）。
 * 表达式已先经 parseCron 校验，此处失败（cronstrue 对个别口径不支持）返回空串。
 */
export async function describeCron(expression: string, locale: AppLocale): Promise<string> {
  const tag = CRONSTRUE_LOCALE[locale]
  const cronstrue = (await import('cronstrue')).default
  if (!loadedLocales.has(tag)) {
    // zh_CN locale 模块导入即向 cronstrue.locales 注册
    await import('cronstrue/locales/zh_CN')
    loadedLocales.add(tag)
  }
  try {
    return cronstrue.toString(expression, { locale: tag })
  } catch {
    return ''
  }
}

// ---- 构建器（单向产出，不做反填） ----

export type BuilderMode = 'any' | 'enum' | 'range' | 'step'

export const BUILDER_FIELDS = FIVE_FIELD_ORDER

/** 构建器字段集：5 字段（秒位不在构建器范围）。 */
export type BuilderFields = Record<Exclude<CronFieldName, 'second'>, BuilderFieldState>

export interface BuilderFieldState {
  mode: BuilderMode
  /** 枚举模式：多选值集合 */
  enumValues: number[]
  /** 范围模式：起止 */
  rangeFrom: number
  rangeTo: number
  /** 步进模式：间隔 */
  step: number
}

export function defaultBuilderField(field: CronFieldName): BuilderFieldState {
  const { min } = FIELD_RANGES[field]
  return {
    mode: 'any',
    enumValues: [],
    rangeFrom: min,
    rangeTo: min,
    step: 1,
  }
}

function clampInt(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback
  const i = Math.trunc(v)
  return Math.min(max, Math.max(min, i))
}

/** 单字段表达式（产出即语义：只输出数字与标准符号，保证与解析区往返一致）。 */
export function buildFieldToken(state: BuilderFieldState, field: CronFieldName): string {
  const { min, max } = FIELD_RANGES[field]
  switch (state.mode) {
    case 'any':
      return '*'
    case 'enum': {
      const values = [...new Set(state.enumValues)]
        .filter((v) => v >= min && v <= max)
        .sort((a, b) => a - b)
      return values.length > 0 ? values.join(',') : '*'
    }
    case 'range': {
      const from = clampInt(state.rangeFrom, min, max, min)
      const to = clampInt(state.rangeTo, min, max, min)
      return from <= to ? `${from}-${to}` : `${to}-${from}`
    }
    case 'step': {
      const step = clampInt(state.step, 1, Math.max(1, max - min + 1), 1)
      return `*/${step}`
    }
  }
}

export function buildExpression(fields: BuilderFields): string {
  return BUILDER_FIELDS.map((f) => buildFieldToken(fields[f], f)).join(' ')
}

// ---- 预设与模板 ----

/** 构建器常用预设（一键设置构建器各字段）。 */
export interface BuilderPreset {
  id: string
  fields: Partial<Record<CronFieldName, Partial<BuilderFieldState>>>
}

export const BUILDER_PRESETS: readonly BuilderPreset[] = [
  { id: 'daily9am', fields: { minute: { mode: 'enum', enumValues: [0] }, hour: { mode: 'enum', enumValues: [9] } } },
  { id: 'hourly', fields: { minute: { mode: 'enum', enumValues: [0] } } },
  { id: 'monday', fields: { minute: { mode: 'enum', enumValues: [0] }, hour: { mode: 'enum', enumValues: [0] }, dow: { mode: 'enum', enumValues: [1] } } },
  { id: 'monthlyFirst', fields: { minute: { mode: 'enum', enumValues: [0] }, hour: { mode: 'enum', enumValues: [0] }, dom: { mode: 'enum', enumValues: [1] } } },
]

/** 模板库：11 条固定模板，一键填入解析输入框（不做反填构建器）。 */
export interface CronTemplate {
  id: string
  expr: string
}

export const CRON_TEMPLATES: readonly CronTemplate[] = [
  { id: 'everyMinute', expr: '* * * * *' },
  { id: 'everyHour', expr: '0 * * * *' },
  { id: 'every15Minutes', expr: '*/15 * * * *' },
  { id: 'dailyMidnight', expr: '0 0 * * *' },
  { id: 'daily9am', expr: '0 9 * * *' },
  { id: 'weekday9am', expr: '0 9 * * 1-5' },
  { id: 'monday9am', expr: '0 9 * * 1' },
  { id: 'weekend10am', expr: '0 10 * * 6,0' },
  { id: 'monthlyFirst', expr: '0 0 1 * *' },
  { id: 'monthly15th10am', expr: '0 10 15 * *' },
  { id: 'every6Hours', expr: '0 */6 * * *' },
]
