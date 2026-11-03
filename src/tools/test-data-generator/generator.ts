/**
 * 测试数据生成器纯逻辑（生成类非实时：控制只影响下一次生成，见 CONTEXT.md）。
 *
 * 术语与口径见 CONTEXT.md：
 * - 数据语言（Data Locale）：生成数据所用语言（中文/English），独立于界面语言；
 *   中文路径用提取自 faker zh_CN 的上游真实词库（本目录 zhWords.ts），
 *   英文路径用本目录 enWords.ts 轻量合成词表；
 * - 结构真实（Structural Validity）：身份证校验位、银行卡 Luhn、手机号段必须
 *   能通过被测系统校验；数据是合成的、明确标注非真实的；
 * - 生成类非实时：显式「生成」按钮触发，同一批内各字段独立随机（Math.random，
 *   不做种子复现）；Rng 注入仅为测试确定性。
 *
 * 结构类字段（手机号/身份证号/银行卡号）固定为大陆结构口径，不随数据语言换轨；
 * 数据语言作用于自然语言字段（姓名/邮箱/地址/公司名/Lorem 段落）。
 */

import type { Rng } from './cnId'
import { generateIdCard } from './cnId'
import { generateBankCard } from './bankCard'
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
  /** 日期时间可选范围（'YYYY-MM-DD'；空/未选走默认区间 2000-01-01 → 今日） */
  datetimeFrom?: string
  datetimeTo?: string
  /** 整数可选范围（默认 0–999999） */
  integerMin?: number
  integerMax?: number
}

export type GenerateError =
  | 'no-fields'
  | 'invalid-count'
  | 'invalid-datetime-range'
  | 'invalid-integer-range'

export type GenerateOutcome =
  | { ok: true; rows: Record<FieldId, string>[] }
  | { ok: false; error: GenerateError }

// ---- 数据语言提供者 ----

interface LocaleProvider {
  name(): string
  email(): string
  address(): string
  company(): string
  lorem(): string
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
    name: () => `${pick(Math.random, FIRST_NAMES)} ${pick(Math.random, LAST_NAMES)}`,
    email: () => {
      const first = pick(Math.random, FIRST_NAMES).toLowerCase()
      const last = pick(Math.random, LAST_NAMES).toLowerCase()
      const n = randomInt(Math.random, 10, 999)
      // RFC 2606 保留域，杜绝投递真实邮件
      return `${first}.${last}${n}@example.com`
    },
    address: () => {
      const [city, state] = pick(Math.random, CITIES)
      return `${randomInt(Math.random, 1, 9999)} ${pick(Math.random, STREETS)}, ${city}, ${state} ${String(randomInt(Math.random, 1, 99999)).padStart(5, '0')}`
    },
    company: () =>
      `${pick(Math.random, COMPANY_PREFIXES)} ${pick(Math.random, COMPANY_NOUNS)} ${pick(Math.random, COMPANY_SUFFIXES)}`,
    lorem: () => enLorem(Math.random),
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
    name: () => `${pick(Math.random, ZH_LAST_NAMES)}${pick(Math.random, ZH_FIRST_NAMES)}`,
    email: () => {
      // 随机 ASCII 句柄 + RFC 2606 保留域，杜绝投递真实邮件（与 en 路径同口径）
      const n = randomInt(Math.random, 10, 999)
      let handle = ''
      for (let i = 0, len = randomInt(Math.random, 3, 8); i < len; i++) {
        handle += String.fromCharCode(97 + randomInt(Math.random, 0, 25))
      }
      return `${handle}${n}@example.com`
    },
    address: () => {
      // 构成沿用上游 postal_address pattern：{{state}}{{city}}{{streetAddress}}
      const street = `${pick(Math.random, ZH_LAST_NAMES)}${pick(Math.random, ZH_STREET_SUFFIXES)}${randomInt(Math.random, 1, 99999)}号`
      const secondary =
        Math.random() < 0.3
          ? pick(Math.random, ZH_SECONDARY_ADDRESSES).replace('###', String(randomInt(Math.random, 1, 999)))
          : ''
      return `${pick(Math.random, ZH_STATES)}${pick(Math.random, ZH_CITY_NAMES)}${street}${secondary}`
    },
    company: () => {
      // 构成沿用上游 name_pattern：{{location.city|state}}{{person.firstName}}{{category}}{{legal_entity_type}}
      const region = pick(Math.random, [...ZH_CITY_NAMES, ...ZH_STATES])
      return `${region}${pick(Math.random, ZH_FIRST_NAMES)}${pick(Math.random, ZH_COMPANY_CATEGORIES)}${pick(Math.random, ZH_COMPANY_ENTITY_TYPES)}`
    },
    lorem: () => zhLorem(Math.random),
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

export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
}

/** 解析日期范围 → [fromMs(含当日 00:00:00), toMs(含当日 23:59:59)]；空端走默认。 */
function resolveDatetimeRange(
  from: string | undefined,
  to: string | undefined,
): [number, number] | null {
  const fromMs = parseDateInput(from)
  const toMs = parseDateInput(to)
  // 任一端显式给出但非法 → 视为范围错误（UI 错误态），不静默回退
  if (from !== undefined && from.trim() !== '' && fromMs === null) return null
  if (to !== undefined && to.trim() !== '' && toMs === null) return null
  const start = fromMs ?? Date.UTC(2000, 0, 1)
  const end = toMs === null ? Date.now() : toMs + DAY_MS - 1
  if (start > end) return null
  return [start, end]
}

// ---- 生成主入口 ----

export async function generateRows(
  options: GenerateOptions,
  rng: Rng = Math.random,
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

  const provider = await makeProvider(options.locale)
  const [dtStart, dtEnd] = datetimeRange

  const rows: Record<FieldId, string>[] = []
  for (let i = 0; i < count; i++) {
    const row = {} as Record<FieldId, string>
    for (const field of options.fields) {
      switch (field) {
        case 'name':
          row.name = provider.name()
          break
        case 'phone':
          row.phone = generateMobile(rng)
          break
        case 'email':
          row.email = provider.email()
          break
        case 'address':
          row.address = provider.address()
          break
        case 'company':
          row.company = provider.company()
          break
        case 'datetime':
          row.datetime = formatDateTime(dtStart + Math.floor(rng() * (dtEnd - dtStart + 1)))
          break
        case 'ipv4':
          row.ipv4 = generateIpv4(rng)
          break
        case 'url':
          row.url = generateUrl(rng)
          break
        case 'integer':
          row.integer = String(randomInt(rng, intMin, intMax))
          break
        case 'idCard':
          row.idCard = generateIdCard(rng).number
          break
        case 'bankCard':
          row.bankCard = generateBankCard(rng)
          break
        case 'lorem':
          row.lorem = provider.lorem()
          break
      }
    }
    rows.push(row)
  }
  return { ok: true, rows }
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
