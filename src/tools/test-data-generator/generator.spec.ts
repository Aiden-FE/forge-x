import { describe, expect, it } from 'vitest'
import { validateIdCard } from '../id-card-validator/validator'
import { BIRTH_YEAR_MAX, BIRTH_YEAR_MIN, PROVINCE_CODES, computeCheckDigit, daysInMonth, generateIdCard, isLeapYear } from './cnId'
import { BANK_BIN_PREFIXES, BANK_CARD_LENGTHS, generateBankCard, isLuhnValid } from './bankCard'
import {
  FIELDS,
  MAX_COUNT,
  MIN_COUNT,
  generateIpv4,
  generateMobile,
  generateRows,
  generateUrl,
  isIpv4Valid,
  parseDateInput,
  rowsToCsv,
  toRecords,
  validateCount,
} from './generator'
import type { FieldId } from './generator'

/** mulberry32 确定性 PRNG：抽样测试可复现。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STRUCTURAL_FIELDS: FieldId[] = ['phone', 'ipv4', 'url', 'integer', 'idCard', 'bankCard']

describe('身份证号：结构真实（验收 1）', () => {
  it('抽样 2000 个全量通过身份证校验工具闭环（校验位 + 省码 + 合法日历 + 非未来）', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 2000; i++) {
      const card = generateIdCard(rng)
      const result = validateIdCard(card.number)
      expect(result.valid, `${card.number} 应通过校验: ${JSON.stringify(result.errors)}`).toBe(true)
    }
  })

  it('省码 ∈ 合法集合（GB/T 2260 省级首两位）', () => {
    const rng = mulberry32(7)
    const provinceSet = new Set(PROVINCE_CODES)
    for (let i = 0; i < 500; i++) {
      const card = generateIdCard(rng)
      expect(provinceSet.has(card.number.slice(0, 2))).toBe(true)
    }
  })

  it('日期合法（真实日历；闰年 2 月 29 由构造口径直接验证）', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 500; i++) {
      const card = generateIdCard(rng)
      const [y, m, d] = card.birth.split('-').map(Number)
      expect(daysInMonth(y!, m!)).toBeGreaterThanOrEqual(d!)
      if (m === 2 && d === 29) expect(isLeapYear(y!)).toBe(true)
    }
  })

  it('生成器日历口径：闰年 2 月 29 可得，平年不可得', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(2004)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(daysInMonth(2004, 2)).toBe(29)
    expect(daysInMonth(2003, 2)).toBe(28)
    expect(daysInMonth(2003, 4)).toBe(30)
  })

  it('校验位算法：MOD 11-2 权重与映射（抽样与库一致）', () => {
    const rng = mulberry32(11)
    for (let i = 0; i < 100; i++) {
      const card = generateIdCard(rng)
      const body17 = card.number.slice(0, 17)
      expect(card.number.slice(17)).toBe(computeCheckDigit(body17))
      expect(card.number).toMatch(/^\d{17}[\dX]$/)
    }
  })

  it('出生年份在保证区间内（必为过去日期，落在校验工具 19xx/20xx）', () => {
    const rng = mulberry32(13)
    for (let i = 0; i < 200; i++) {
      const card = generateIdCard(rng)
      const year = Number(card.birth.slice(0, 4))
      expect(year).toBeGreaterThanOrEqual(BIRTH_YEAR_MIN)
      expect(year).toBeLessThanOrEqual(BIRTH_YEAR_MAX)
    }
  })
})

describe('银行卡号：结构真实（验收 2）', () => {
  it('Luhn 全通过 + 前缀 ∈ 测试 BIN 集 + 长度 16/19', () => {
    const rng = mulberry32(21)
    const lengths = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const card = generateBankCard(rng)
      expect(isLuhnValid(card), card).toBe(true)
      expect(BANK_BIN_PREFIXES.some((bin) => card.startsWith(bin)), card).toBe(true)
      expect(BANK_CARD_LENGTHS).toContain(card.length)
      lengths.add(card.length)
    }
    // 两种长度均有覆盖
    expect(lengths.has(16)).toBe(true)
    expect(lengths.has(19)).toBe(true)
  })

  it('isLuhnValid 拒绝非法卡号', () => {
    expect(isLuhnValid('6222021234567890123')).toBe(false)
    expect(isLuhnValid('')).toBe(false)
    expect(isLuhnValid('6222a')).toBe(false)
  })
})

describe('手机号 / IPv4 / URL / 整数（验收 3）', () => {
  it('手机号匹配 1[3-9]\\d{9}', () => {
    const rng = mulberry32(31)
    for (let i = 0; i < 500; i++) {
      expect(generateMobile(rng)).toMatch(/^1[3-9]\d{9}$/)
    }
  })

  it('IPv4 合法（各段 0–255）', () => {
    const rng = mulberry32(32)
    for (let i = 0; i < 500; i++) {
      const ip = generateIpv4(rng)
      expect(isIpv4Valid(ip), ip).toBe(true)
      const octets = ip.split('.').map(Number)
      expect(octets.every((o) => o >= 0 && o <= 255)).toBe(true)
    }
    expect(isIpv4Valid('256.0.0.1')).toBe(false)
    expect(isIpv4Valid('1.2.3')).toBe(false)
  })

  it('URL 可被 URL 解析', () => {
    const rng = mulberry32(33)
    for (let i = 0; i < 200; i++) {
      const url = generateUrl(rng)
      const parsed = new URL(url)
      expect(parsed.protocol).toBe('https:')
    }
  })

  it('整数在给定范围内（含负数区间）', async () => {
    const res = await generateRows(
      { fields: ['integer'], count: 500, locale: 'zh', integerMin: -5, integerMax: 10 },
      mulberry32(34),
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      for (const row of res.rows) {
        const v = Number(row.integer)
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(-5)
        expect(v).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('数据语言换轨（验收 4）', () => {
  const LINGUISTIC: FieldId[] = ['name', 'email', 'address', 'company', 'lorem']

  it('中文路径：姓名/地址/公司名为上游中文词库形态', async () => {
    const res = await generateRows({ fields: LINGUISTIC, count: 30, locale: 'zh' }, mulberry32(41))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    for (const row of res.rows) {
      expect(row.name).toMatch(/[\u4e00-\u9fff]/) // 中文名（faker zh_CN）
      expect(row.address).toMatch(/^[\u4e00-\u9fff]/) // 省开头（广东省…）
      expect(row.company).toMatch(/[\u4e00-\u9fff]/)
      expect(row.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      expect(row.lorem).toMatch(/[\u4e00-\u9fff]/)
    }
  })

  it('English 路径：全部字段换为合成英文词（↔ 中文词库）', async () => {
    const res = await generateRows({ fields: LINGUISTIC, count: 30, locale: 'en' }, mulberry32(42))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    for (const row of res.rows) {
      expect(row.name).toMatch(/^[A-Za-z]+ [A-Za-z]+$/)
      expect(row.address).toMatch(/^[0-9]+ [A-Za-z0-9 .]+, [A-Za-z .]+, [A-Z]{2} \d{5}$/)
      expect(row.company).toMatch(/^[A-Za-z]+ [A-Za-z]+ (Inc\.|LLC|Corp\.|Ltd\.|Group|Co\.|Partners|Holdings|Associates|International)$/)
      expect(row.email).toMatch(/^[a-z]+\.[a-z]+\d+@example\.com$/)
      // 多句 lorem：句首大写 + 句点分隔
      expect(row.lorem).toMatch(/^[A-Z][a-z ]+(\. [A-Z][a-z ]+)*\.$/)
    }
  })

  it('结构类字段不随数据语言换轨（固定大陆结构口径）', async () => {
    for (const locale of ['zh', 'en'] as const) {
      const res = await generateRows({ fields: STRUCTURAL_FIELDS, count: 20, locale }, mulberry32(43))
      expect(res.ok).toBe(true)
      if (!res.ok) continue
      for (const row of res.rows) {
        expect(row.phone).toMatch(/^1[3-9]\d{9}$/)
        expect(isIpv4Valid(row.ipv4)).toBe(true)
        expect(isLuhnValid(row.bankCard)).toBe(true)
        expect(validateIdCard(row.idCard).valid).toBe(true)
      }
    }
  })

  it('同一批内各字段独立随机（结构字段抽样不全等）', async () => {
    const res = await generateRows({ fields: ['idCard', 'bankCard'], count: 50, locale: 'zh' }, mulberry32(44))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(new Set(res.rows.map((r) => r.idCard)).size).toBeGreaterThan(45)
    expect(new Set(res.rows.map((r) => r.bankCard)).size).toBeGreaterThan(45)
  })
})

describe('条数边界与错误路径（验收 6）', () => {
  it('条数边界：1 与 1000 合法，0/1001/非整数非法', () => {
    expect(validateCount(MIN_COUNT)).toBe(1)
    expect(validateCount(MAX_COUNT)).toBe(1000)
    expect(validateCount(0)).toBeNull()
    expect(validateCount(1001)).toBeNull()
    expect(validateCount(1.5)).toBeNull()
    expect(validateCount(Number.NaN)).toBeNull()
  })

  it('生成 1 条与 1000 条成功', async () => {
    const one = await generateRows({ fields: ['phone'], count: 1, locale: 'zh' }, mulberry32(51))
    expect(one.ok && one.rows).toHaveLength(1)
    const max = await generateRows({ fields: ['phone'], count: 1000, locale: 'zh' }, mulberry32(52))
    expect(max.ok && max.rows).toHaveLength(1000)
  })

  it('0 字段勾选 → no-fields；非法条数 → invalid-count', async () => {
    expect(await generateRows({ fields: [], count: 5, locale: 'zh' })).toEqual({
      ok: false,
      error: 'no-fields',
    })
    expect(await generateRows({ fields: ['phone'], count: 0, locale: 'zh' })).toEqual({
      ok: false,
      error: 'invalid-count',
    })
  })

  it('非法日期/整数范围 → 对应错误', async () => {
    expect(
      await generateRows({
        fields: ['datetime'],
        count: 5,
        locale: 'zh',
        datetimeFrom: '2026-05-01',
        datetimeTo: '2020-01-01',
      }),
    ).toEqual({ ok: false, error: 'invalid-datetime-range' })
    expect(
      await generateRows({
        fields: ['datetime'],
        count: 5,
        locale: 'zh',
        datetimeFrom: '2026-13-40',
        datetimeTo: '',
      }),
    ).toEqual({ ok: false, error: 'invalid-datetime-range' })
    expect(
      await generateRows({ fields: ['integer'], count: 5, locale: 'zh', integerMin: 10, integerMax: 5 }),
    ).toEqual({ ok: false, error: 'invalid-integer-range' })
  })

  it('日期时间落在可选范围内（含闰日 2024-02-29）', async () => {
    const res = await generateRows(
      {
        fields: ['datetime'],
        count: 300,
        locale: 'zh',
        datetimeFrom: '2024-02-28',
        datetimeTo: '2024-03-01',
      },
      mulberry32(61),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const from = parseDateInput('2024-02-28')!
    const to = parseDateInput('2024-03-01')! + 24 * 3600 * 1000 - 1
    let sawLeapDay = false
    for (const row of res.rows) {
      const m = row.datetime.match(/^(\d{4})-(\d{2})-(\d{2}) \d{2}:\d{2}:\d{2}$/)
      expect(m, row.datetime).not.toBeNull()
      const ms = Date.UTC(Number(m![1]), Number(m![2]) - 1, Number(m![3]), 0, 0, 0)
      expect(ms).toBeGreaterThanOrEqual(from)
      expect(ms).toBeLessThanOrEqual(to)
      if (m![2] === '02' && m![3] === '29') sawLeapDay = true
    }
    expect(sawLeapDay).toBe(true)
  })
})

describe('导出：JSON 键 = 字段名；CSV round-trip 字节级一致（验收 5）', () => {
  const IDS: FieldId[] = ['name', 'phone', 'integer']
  const LABELS = ['姓名', '手机号', '整数']

  function makeRows(): Record<FieldId, string>[] {
    // 行只填 IDS 所选字段（导出仅读取所选字段），其余字段不参与断言
    const partial = [
      { name: '张三', phone: '007', integer: '13812345678' },
      { name: '李四', phone: '008', integer: '1,5' },
    ]
    return partial as unknown as Record<FieldId, string>[]
  }

  it('JSON 结构 = 字段名键、值字符串无损（007 不变形）', () => {
    const records = toRecords(IDS, LABELS, makeRows())
    const json = JSON.stringify(records, null, 2)
    const parsed = JSON.parse(json) as Array<Record<string, string>>
    expect(Object.keys(parsed[0]!)).toEqual(['姓名', '手机号', '整数'])
    expect(parsed[0]!['手机号']).toBe('007')
    expect(typeof parsed[0]!['手机号']).toBe('string')
  })

  it('CSV round-trip：papaparse 解析回读与原值逐格相等（007 保持字符串）', async () => {
    const csv = await rowsToCsv(IDS, LABELS, makeRows())
    const Papa = (await import('papaparse')).default
    const back = Papa.parse<string[]>(csv, { dynamicTyping: false })
    expect(back.data[0]).toEqual([...LABELS])
    expect(back.data[1]).toEqual(['张三', '007', '13812345678'])
    expect(back.data[2]).toEqual(['李四', '008', '1,5'])
    expect(typeof back.data[1]![1]).toBe('string')
  })

  it('CSV 值含引号/换行时按 RFC 4180 引号转义且 round-trip 一致', async () => {
    const rows = [
      { lorem: '他说 "你好" 后换行\n第二行' },
    ] as unknown as Record<FieldId, string>[]
    const csv = await rowsToCsv(['lorem'], ['Lorem 文本'], rows)
    const Papa = (await import('papaparse')).default
    const back = Papa.parse<string[]>(csv, { dynamicTyping: false })
    expect(back.data[1]).toEqual(['他说 "你好" 后换行\n第二行'])
  })
})

describe('字段目录', () => {
  it('规格 11 项 + Lorem 共 12 项，顺序稳定', () => {
    expect(FIELDS.map((f) => f.id)).toEqual([
      'name',
      'phone',
      'email',
      'address',
      'company',
      'datetime',
      'ipv4',
      'url',
      'integer',
      'idCard',
      'bankCard',
      'lorem',
    ])
    expect(FIELDS.filter((f) => f.range)).toEqual([
      { id: 'datetime', range: 'datetime' },
      { id: 'integer', range: 'integer' },
    ])
  })
})
