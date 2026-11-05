/**
 * 测试数据生成器纯逻辑（生成类非实时：控制只影响下一次生成，见 CONTEXT.md）。
 *
 * 术语与口径见 CONTEXT.md：
 * - 数据语言（Data Locale）：生成数据所用语言（中文/English），独立于界面语言；
 *   中文路径用提取自 faker zh_CN 的上游真实词库（本目录 zhWords.ts），
 *   英文路径用本目录 enWords.ts 轻量合成词表；
 * - 结构真实（Structural Validity）：身份证校验位、银行卡 Luhn、手机号段必须
 *   能通过被测系统校验；数据是合成的、明确标注非真实的；
 * - 种子复现（Seed Replay，票据 11）：同 seed + 同配置 + 同 ForgeX 版本 →
 *   输出逐字节一致。mulberry32（rng.ts）为唯一随机源，全部字段（含 en/zh
 *   词表字段）统一走注入 Rng，生成路径无时钟读取（默认日期区间为固定常量）；
 *   词表/字段/默认区间升级破坏序列属已声明行为。
 *
 * 结构类字段（手机号/身份证号/银行卡号）固定为大陆结构口径，不随数据语言换轨；
 * 数据语言作用于自然语言字段（姓名/邮箱/地址/公司名/Lorem 段落）。
 */

import type { Rng } from './rng'
import { generateIdCard } from './cnId'
import { generateBankCard } from './bankCard'
import { deriveRandomSeed, mulberry32, parseSeedHex } from './rng'
import { CITIES, COMPANY_NOUNS, COMPANY_PREFIXES, COMPANY_SUFFIXES, FIRST_NAMES, LAST_NAMES, LOREM_WORDS, STREETS } from './enWords'
import {
  ZH_CITY_NAMES,
  ZH_COMPANY_CATEGORIES,
  ZH_COMPANY_ENTITY_TYPES,
  ZH_FIRST_NAMES,
  ZH_LAST_NAMES,
  ZH_SECONDARY_ADDRESSES,
  ZH_STATES,
  ZH_STREET_SUFFIXES,
} from './zhWords'

/** 字段目录：规格 11 项 + Lorem 段落（Lorem ipsum 生成并入本工具，作第 12 项）。 */
export type FieldId =
  | 'name'
  | 'phone'
  | 'email'
  | 'address'
  | 'company'
  | 'datetime'
  | 'ipv4'
  | 'url'
  | 'integer'
  | 'idCard'
  | 'bankCard'
  | 'lorem'

export interface FieldDef {
  id: FieldId
  /** 可选范围控件类别（规格 §3：日期时间（范围可选）、整数（范围可选）） */
  range?: 'datetime' | 'integer'
}

/** 字段目录顺序 = 表格列序 = 输出列序。 */
export const FIELDS: readonly FieldDef[] = [
  { id: 'name' },
  { id: 'phone' },
  { id: 'email' },
  { id: 'address' },
  { id: 'company' },
  { id: 'datetime', range: 'datetime' },
  { id: 'ipv4' },
  { id: 'url' },
  { id: 'integer', range: 'integer' },
  { id: 'idCard' },
  { id: 'bankCard' },
  { id: 'lorem' },
]

export type DataLocale = 'zh' | 'en'
export const DEFAULT_DATA_LOCALE: DataLocale = 'zh'

/** 条数边界（密码生成器同款惯例：生成类上限 1000）。 */
export const MIN_COUNT = 1
export const MAX_COUNT = 1000

export function validateCount(value: number): number | null {
  if (!Number.isInteger(value)) return null
  if (value < MIN_COUNT || value > MAX_COUNT) return null
  return value
}

export interface GenerateOptions {
  fields: FieldId[]
  count: number
  locale: DataLocale
  /** 日期时间可选范围（'YYYY-MM-DD'；空/未选走固定默认区间，见 DEFAULT_DATETIME_FROM/TO） */
  datetimeFrom?: string
  datetimeTo?: string
  /** 整数可选范围（默认 0–999999） */
  integerMin?: number
  integerMax?: number
}

/** 生产请求 = 生成选项 + seed 输入（票据 11 种子复现）。 */
export interface GenerateRequest extends GenerateOptions {
  /**
   * seed 输入：十六进制 8 位（32-bit，可带 0x 前缀、大小写不敏感）；
   * 空白/未填 = 内部随机派生（rng.ts 唯一 Math.random 调用点）。
   */
  seed?: string
}

export type GenerateError =
  | 'no-fields'
  | 'invalid-count'
  | 'invalid-datetime-range'
  | 'invalid-integer-range'
  | 'invalid-seed'

export type GenerateOutcome =
  | { ok: true; rows: Record<FieldId, string>[] }
  | { ok: false; error: GenerateError }

/** 生产入口结果：成功一律携带所用 seed（生成即携带 seed，没有不可复现的生成）。 */
export type SeededOutcome =
  | { ok: true; rows: Record<FieldId, string>[]; seed: number }
  | { ok: false; error: GenerateError }

// ---- 数据语言提供者（随机源一律注入：种子复现链路，票据 11 前置重构） ----

interface LocaleProvider {
  name(rng: Rng): string
  email(rng: Rng): string
  address(rng: Rng): string
  company(rng: Rng): string
  lorem(rng: Rng): string
}

/** Lorem 段落的常用汉字池（随机取字合成，标注非语义文本；CONTEXT.md 数据语言）。 */
const ZH_LOREM_POOL =
  '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感'

function randomInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1))
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]!
}

function zhLorem(rng: Rng): string {
  const sentences = randomInt(rng, 3, 5)
  const parts: string[] = []
  for (let s = 0; s < sentences; s++) {
    const len = randomInt(rng, 8, 24)
    let text = ''
    for (let i = 0; i < len; i++) {
      text += ZH_LOREM_POOL[Math.floor(rng() * ZH_LOREM_POOL.length)]
    }
    parts.push(text)
  }
  return `${parts.join('。')}。`
}

function enLorem(rng: Rng): string {
  const sentences = randomInt(rng, 3, 6)
  const parts: string[] = []
  for (let s = 0; s < sentences; s++) {
    const words = randomInt(rng, 6, 14)
    const sentence: string[] = []
    for (let i = 0; i < words; i++) sentence.push(pick(rng, LOREM_WORDS))
    const text = sentence.join(' ')
    parts.push(text.charAt(0).toUpperCase() + text.slice(1))
  }
  return `${parts.join('. ')}.`
}

function makeEnProvider(): LocaleProvider {
  return {
    name: (rng) => `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    email: (rng) => {
      const first = pick(rng, FIRST_NAMES).toLowerCase()
      const last = pick(rng, LAST_NAMES).toLowerCase()
      const n = randomInt(rng, 10, 999)
      // RFC 2606 保留域，杜绝投递真实邮件
      return `${first}.${last}${n}@example.com`
    },
    address: (rng) => {
      const [city, state] = pick(rng, CITIES)
      return `${randomInt(rng, 1, 9999)} ${pick(rng, STREETS)}, ${city}, ${state} ${String(randomInt(rng, 1, 99999)).padStart(5, '0')}`
    },
    company: (rng) =>
      `${pick(rng, COMPANY_PREFIXES)} ${pick(rng, COMPANY_NOUNS)} ${pick(rng, COMPANY_SUFFIXES)}`,
    lorem: (rng) => enLorem(rng),
  }
}

/**
 * 中文路径：上游真实词库已一次性提取为本目录 zhWords.ts（CONTEXT.md：
 * 数据语言 / 结构真实）。官方 `@faker-js/faker/locale/zh_CN` 子入口会传递
 * 引入 faker 引擎与 en 兜底词库（实测 181.9 KB gzip，超 35 KB 预算 5 倍；
 * 调研票的 25.2 KB 只量了数据文件本身），故改用提取词表 + 自实现构成
 * （构成方式沿用上游 pattern），运行时零外部依赖。
 */
export function loadZhProvider(): Promise<LocaleProvider> {
  return Promise.resolve({
    name: (rng) => `${pick(rng, ZH_LAST_NAMES)}${pick(rng, ZH_FIRST_NAMES)}`,
    email: (rng) => {
      // 随机 ASCII 句柄 + RFC 2606 保留域，杜绝投递真实邮件（与 en 路径同口径）
      const n = randomInt(rng, 10, 999)
      let handle = ''
      for (let i = 0, len = randomInt(rng, 3, 8); i < len; i++) {
        handle += String.fromCharCode(97 + randomInt(rng, 0, 25))
      }
      return `${handle}${n}@example.com`
    },
    address: (rng) => {
      // 构成沿用上游 postal_address pattern：{{state}}{{city}}{{streetAddress}}
      const street = `${pick(rng, ZH_LAST_NAMES)}${pick(rng, ZH_STREET_SUFFIXES)}${randomInt(rng, 1, 99999)}号`
      const secondary =
        rng() < 0.3
          ? pick(rng, ZH_SECONDARY_ADDRESSES).replace('###', String(randomInt(rng, 1, 999)))
          : ''
      return `${pick(rng, ZH_STATES)}${pick(rng, ZH_CITY_NAMES)}${street}${secondary}`
    },
    company: (rng) => {
      // 构成沿用上游 name_pattern：{{location.city|state}}{{person.firstName}}{{category}}{{legal_entity_type}}
      const region = pick(rng, [...ZH_CITY_NAMES, ...ZH_STATES])
      return `${region}${pick(rng, ZH_FIRST_NAMES)}${pick(rng, ZH_COMPANY_CATEGORIES)}${pick(rng, ZH_COMPANY_ENTITY_TYPES)}`
    },
    lorem: (rng) => zhLorem(rng),
  })
}

function makeProvider(locale: DataLocale): Promise<LocaleProvider> {
  if (locale === 'zh') return loadZhProvider()
  return Promise.resolve(makeEnProvider())
}

// ---- 结构类字段（不随数据语言换轨） ----

/** 大陆手机号段：^1[3-9]\d{9}$（结构真实；faker zh_CN 的 phone 是固话形态，故自实现）。 */
export const MOBILE_RE = /^1[3-9]\d{9}$/

export function generateMobile(rng: Rng): string {
  let n = `1${randomInt(rng, 3, 9)}`
  for (let i = 0; i < 9; i++) n += String(randomInt(rng, 0, 9))
  return n
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function generateIpv4(rng: Rng): string {
  return `${randomInt(rng, 0, 255)}.${randomInt(rng, 0, 255)}.${randomInt(rng, 0, 255)}.${randomInt(rng, 0, 255)}`
}

export function isIpv4Valid(value: string): boolean {
  const m = value.match(IPV4_RE)
  if (!m) return false
  return m.slice(1).every((octet) => Number(octet) <= 255)
}

const URL_HOSTS = ['www.example.com', 'api.example.org', 'cdn.example.net', 'docs.example.com'] as const

export function generateUrl(rng: Rng): string {
  const host = pick(rng, URL_HOSTS)
  const path = randomInt(rng, 1, 9999)
  const token = randomInt(rng, 0x100000, 0xffffff).toString(16)
  return `https://${host}/${path}/${token}?ref=${pick(rng, LOREM_WORDS)}`
}

// ---- 日期时间 ----

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 解析 'YYYY-MM-DD' 为 UTC 午夜 epoch ms；空串/未选返回 null（走默认区间）。 */
export function parseDateInput(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // 格式合法但日历不存在（如 02-30）→ Date.UTC 会滚动进下月，检查回读一致
  const d = new Date(ms)
  if (
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() !== Number(m[2]) - 1 ||
    d.getUTCDate() !== Number(m[3])
  ) {
    return null
  }
  return ms
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 默认日期区间（固定常量）：生成路径不读时钟，同 seed 同配置跨日仍逐字节一致
 * （票据 11「无时钟泄漏」锚）。v0.4.0 曾为「→ 今日」，属已声明行为变更；
 * 常量取值随版本演进时按「版本升级破坏序列」口径声明。
 */
export const DEFAULT_DATETIME_FROM = '2000-01-01'
export const DEFAULT_DATETIME_TO = '2029-12-31'

export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
}

/** 解析日期范围 → [fromMs(含当日 00:00:00), toMs(含当日 23:59:59)]；空端走固定默认。 */
function resolveDatetimeRange(
  from: string | undefined,
  to: string | undefined,
): [number, number] | null {
  const fromMs = parseDateInput(from)
  const toMs = parseDateInput(to)
  // 任一端显式给出但非法 → 视为范围错误（UI 错误态），不静默回退
  if (from !== undefined && from.trim() !== '' && fromMs === null) return null
  if (to !== undefined && to.trim() !== '' && toMs === null) return null
  const start = fromMs ?? parseDateInput(DEFAULT_DATETIME_FROM)!
  const end = (toMs ?? parseDateInput(DEFAULT_DATETIME_TO)!) + DAY_MS - 1
  if (start > end) return null
  return [start, end]
}

// ---- 生成主入口 ----

/**
 * 字段序归一：按字段目录序（FIELDS）去重排序——生成顺序固定为目录序，
 * 同 seed + 同字段集合不因勾选/传入顺序改变随机消费序列（票据 11）。
 */
function normalizeFields(fields: readonly FieldId[]): FieldId[] {
  const selected = new Set(fields)
  return FIELDS.filter((f) => selected.has(f.id)).map((f) => f.id)
}

/**
 * 确定性生成核心：输出是 (options, rng) 的纯函数（无时钟、无隐藏随机源）。
 * 生产路径走 generateSeeded（种子复现）；本函数保留 Rng 注入供测试与复用。
 */
export async function generateRows(
  options: GenerateOptions,
  rng?: Rng,
): Promise<GenerateOutcome> {
  if (options.fields.length === 0) return { ok: false, error: 'no-fields' }
  const count = validateCount(options.count)
  if (count === null) return { ok: false, error: 'invalid-count' }

  const datetimeRange = resolveDatetimeRange(options.datetimeFrom, options.datetimeTo)
  if (datetimeRange === null) return { ok: false, error: 'invalid-datetime-range' }

  const intMin = options.integerMin ?? 0
  const intMax = options.integerMax ?? 999_999
  if (!Number.isFinite(intMin) || !Number.isFinite(intMax) || intMin > intMax) {
    return { ok: false, error: 'invalid-integer-range' }
  }

  const r = rng ?? mulberry32(deriveRandomSeed())
  const fields = normalizeFields(options.fields)
  const provider = await makeProvider(options.locale)
  const [dtStart, dtEnd] = datetimeRange

  const rows: Record<FieldId, string>[] = []
  for (let i = 0; i < count; i++) {
    const row = {} as Record<FieldId, string>
    for (const field of fields) {
      switch (field) {
        case 'name':
          row.name = provider.name(r)
          break
        case 'phone':
          row.phone = generateMobile(r)
          break
        case 'email':
          row.email = provider.email(r)
          break
        case 'address':
          row.address = provider.address(r)
          break
        case 'company':
          row.company = provider.company(r)
          break
        case 'datetime':
          row.datetime = formatDateTime(dtStart + Math.floor(r() * (dtEnd - dtStart + 1)))
          break
        case 'ipv4':
          row.ipv4 = generateIpv4(r)
          break
        case 'url':
          row.url = generateUrl(r)
          break
        case 'integer':
          row.integer = String(randomInt(r, intMin, intMax))
          break
        case 'idCard':
          row.idCard = generateIdCard(r).number
          break
        case 'bankCard':
          row.bankCard = generateBankCard(r)
          break
        case 'lorem':
          row.lorem = provider.lorem(r)
          break
      }
    }
    rows.push(row)
  }
  return { ok: true, rows }
}

/**
 * 生产入口（票据 11 种子复现）：解析/派生 seed → mulberry32 → 确定性生成。
 * seed 留空 = 内部随机派生（rng.ts 唯一 Math.random 调用点）；成功一律携带
 * 所用 seed 供展示；非法 seed 输入只错该处（invalid-seed），不静默回退。
 */
export async function generateSeeded(request: GenerateRequest): Promise<SeededOutcome> {
  const raw = request.seed
  let seed: number
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = parseSeedHex(raw)
    if (parsed === null) return { ok: false, error: 'invalid-seed' }
    seed = parsed
  } else {
    seed = deriveRandomSeed()
  }
  const outcome = await generateRows(request, mulberry32(seed))
  return outcome.ok ? { ok: true, rows: outcome.rows, seed } : outcome
}

// ---- 导出（值一律字符串无损，先例：值无损性） ----

/** 对象数组形态：键 = 列名（字段名，labels[i] ↔ fieldIds[i]），值保持字符串。 */
export function toRecords(
  fieldIds: readonly FieldId[],
  labels: readonly string[],
  rows: readonly Record<FieldId, string>[],
): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {}
    fieldIds.forEach((id, i) => {
      record[labels[i]!] = row[id] ?? ''
    })
    return record
  })
}

interface PapaStatic {
  unparse(rows: unknown[][], config?: { delimiter?: string }): string
}

async function loadPapa(): Promise<PapaStatic> {
  const Papa = (await import('papaparse')).default
  return Papa as unknown as PapaStatic
}

/**
 * CSV 导出：papaparse unparse，RFC 4180 严格；首行列名 = 字段名（labels），
 * 值一律字符串（unparse 不做类型转换）。
 */
export async function rowsToCsv(
  fieldIds: readonly FieldId[],
  labels: readonly string[],
  rows: readonly Record<FieldId, string>[],
): Promise<string> {
  const Papa = await loadPapa()
  const grid: unknown[][] = [
    [...labels],
    ...rows.map((row) => fieldIds.map((id) => row[id] ?? '')),
  ]
  return Papa.unparse(grid, { delimiter: ',' })
}
