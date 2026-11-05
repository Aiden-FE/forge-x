/**
 * 种子复现验收（票据 11，见 CONTEXT.md：种子复现）。
 *
 * 验收锚：
 * 1. 同 seed 双跑逐字节一致（JSON 与 CSV 字符串级，zh/en 双路径）；
 * 2. 不同 seed 输出不同；
 * 3. 无 seed（留空）路径仍能生成（回退 = 随机派生 + 携带 seed 展示；粘回即复现）；
 * 4. seed 模式下身份证校验位 / 银行卡 Luhn / 手机号段仍全数有效（结构真实）；
 * 5. 导出 JSON/CSV 不嵌 seed（数据与元数据分离，_Avoid_：导出嵌 seed）；
 * 6. 生成顺序固定（字段目录序）+ 随机源纪律源码守卫
 *    （Math.random 调用点仅剩 rng.ts 派生初始 seed 一处；生成路径无时钟读取，
 *    先例：keypair-generator 的「无持久化源码守卫」测试）。
 */

/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateIdCard } from '../id-card-validator/validator'
import { isLuhnValid } from './bankCard'
import {
  DEFAULT_DATETIME_FROM,
  DEFAULT_DATETIME_TO,
  FIELDS,
  MOBILE_RE,
  generateSeeded,
  rowsToCsv,
  toRecords,
} from './generator'
import type { FieldId } from './generator'
import { formatSeed, mulberry32, parseSeedHex } from './rng'

const ALL_FIELDS: FieldId[] = FIELDS.map((f) => f.id)
const SEED_A = '0x1a2b3c4d'
const SEED_B = '0x00000002'

/** 与组件导出同序列化：JSON.stringify(records, null, 2)。 */
async function exportJson(seed: string | undefined, locale: 'zh' | 'en', fields: FieldId[] = ALL_FIELDS): Promise<string> {
  const res = await generateSeeded({ fields, count: 20, locale, seed })
  expect(res.ok).toBe(true)
  if (!res.ok) throw new Error(res.error)
  return JSON.stringify(toRecords(fields, fields, res.rows), null, 2)
}

async function exportCsv(seed: string | undefined, locale: 'zh' | 'en', fields: FieldId[] = ALL_FIELDS): Promise<string> {
  const res = await generateSeeded({ fields, count: 20, locale, seed })
  expect(res.ok).toBe(true)
  if (!res.ok) throw new Error(res.error)
  return rowsToCsv(fields, fields, res.rows)
}

describe('种子复现：同 seed 双跑逐字节一致（验收 1）', () => {
  it.each(['zh', 'en'] as const)('数据语言 %s：JSON 与 CSV 字符串级逐字节一致', async (locale) => {
    // 全字段含 datetime（默认区间）——双跑一致同时证明生成路径无时钟读取
    const [json1, json2] = [await exportJson(SEED_A, locale), await exportJson(SEED_A, locale)]
    expect(json2).toBe(json1)
    const [csv1, csv2] = [await exportCsv(SEED_A, locale), await exportCsv(SEED_A, locale)]
    expect(csv2).toBe(csv1)
  })

  it('显式日期/整数范围下双跑同样逐字节一致', async () => {
    const opts = {
      fields: ALL_FIELDS,
      count: 10,
      locale: 'zh' as const,
      seed: SEED_A,
      datetimeFrom: '2024-01-01',
      datetimeTo: '2024-12-31',
      integerMin: -100,
      integerMax: 100,
    }
    const [a, b] = [await generateSeeded(opts), await generateSeeded(opts)]
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(JSON.stringify(b.rows)).toBe(JSON.stringify(a.rows))
  })
})

describe('种子复现：不同 seed 输出不同（验收 2）', () => {
  it.each(['zh', 'en'] as const)('数据语言 %s：seed A ≠ seed B（JSON 字符串级）', async (locale) => {
    const [a, b] = [await exportJson(SEED_A, locale), await exportJson(SEED_B, locale)]
    expect(b).not.toBe(a)
  })
})

describe('无 seed（留空）路径（验收 3）', () => {
  it('留空 = 随机派生：仍能生成，且成功携带 32-bit seed 供展示', async () => {
    const res = await generateSeeded({ fields: ALL_FIELDS, count: 10, locale: 'zh' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(Number.isInteger(res.seed)).toBe(true)
    expect(res.seed).toBeGreaterThanOrEqual(0)
    expect(res.seed).toBeLessThan(0x1_0000_0000)
    expect(formatSeed(res.seed)).toMatch(/^0x[0-9a-f]{8}$/)
    expect(res.rows).toHaveLength(10)
  })

  it('纯空白输入等同留空（随机派生）', async () => {
    const res = await generateSeeded({ fields: ['phone'], count: 1, locale: 'zh', seed: '   ' })
    expect(res.ok).toBe(true)
  })

  it('粘回即复现：留空生成后把携带的 seed 粘回输入 → 逐字节一致', async () => {
    const first = await generateSeeded({ fields: ALL_FIELDS, count: 20, locale: 'zh' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const replay = await generateSeeded({
      fields: ALL_FIELDS,
      count: 20,
      locale: 'zh',
      seed: formatSeed(first.seed),
    })
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(JSON.stringify(toRecords(ALL_FIELDS, ALL_FIELDS, replay.rows))).toBe(
      JSON.stringify(toRecords(ALL_FIELDS, ALL_FIELDS, first.rows)),
    )
  })
})

describe('seed 模式下结构真实仍全数有效（验收 4）', () => {
  it.each(['zh', 'en'] as const)('数据语言 %s：身份证校验位 / 银行卡 Luhn / 手机号段全通过', async (locale) => {
    const res = await generateSeeded({
      fields: ['phone', 'idCard', 'bankCard'],
      count: 300,
      locale,
      seed: SEED_A,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    for (const row of res.rows) {
      expect(MOBILE_RE.test(row.phone), row.phone).toBe(true)
      expect(validateIdCard(row.idCard).valid, row.idCard).toBe(true)
      expect(isLuhnValid(row.bankCard), row.bankCard).toBe(true)
    }
  })
})

describe('导出不嵌 seed（验收 5：数据与元数据分离）', () => {
  it('JSON 与 CSV 输出均不含 seed 字样', async () => {
    const json = await exportJson(SEED_A, 'zh')
    const csv = await exportCsv(SEED_A, 'zh')
    for (const out of [json, csv]) {
      expect(out.includes('1a2b3c4d')).toBe(false)
      expect(out.toLowerCase().includes('seed')).toBe(false)
    }
  })
})

describe('生成顺序固定：字段目录序（验收 6）', () => {
  it('同 seed 同字段集合，传入顺序不同 / 含重复 → 输出一致', async () => {
    const a = await generateSeeded({
      fields: ['name', 'phone', 'idCard', 'lorem'],
      count: 10,
      locale: 'zh',
      seed: SEED_A,
    })
    const b = await generateSeeded({
      fields: ['lorem', 'idCard', 'phone', 'name'],
      count: 10,
      locale: 'zh',
      seed: SEED_A,
    })
    const c = await generateSeeded({
      fields: ['name', 'name', 'phone', 'idCard', 'lorem'],
      count: 10,
      locale: 'zh',
      seed: SEED_A,
    })
    expect(a.ok && b.ok && c.ok).toBe(true)
    if (!a.ok || !b.ok || !c.ok) return
    expect(JSON.stringify(b.rows)).toBe(JSON.stringify(a.rows))
    expect(JSON.stringify(c.rows)).toBe(JSON.stringify(a.rows))
  })

  it('默认日期区间为固定常量：默认路径采样落在 [FROM, TO] 内', async () => {
    const res = await generateSeeded({ fields: ['datetime'], count: 200, locale: 'zh', seed: SEED_B })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    for (const row of res.rows) {
      // 'YYYY-MM-DD HH:mm:ss' 定宽格式，字典序即时间序
      expect(row.datetime >= `${DEFAULT_DATETIME_FROM} 00:00:00`).toBe(true)
      expect(row.datetime <= `${DEFAULT_DATETIME_TO} 23:59:59`).toBe(true)
    }
  })
})

describe('seed 解析与展示（rng.ts）', () => {
  it('parseSeedHex：0x 前缀可选、大小写不敏感、1–8 位、空白容忍', () => {
    expect(parseSeedHex('1a2b3c4d')).toBe(0x1a2b3c4d)
    expect(parseSeedHex('0x1a2b3c4d')).toBe(0x1a2b3c4d)
    expect(parseSeedHex('0X1A2B3C4D')).toBe(0x1a2b3c4d)
    expect(parseSeedHex(' 1a2b3c4d ')).toBe(0x1a2b3c4d)
    expect(parseSeedHex('abc')).toBe(0xabc)
    expect(parseSeedHex('0')).toBe(0)
    expect(parseSeedHex('ffffffff')).toBe(0xffffffff)
  })

  it('parseSeedHex：非法输入返回 null', () => {
    for (const bad of ['', '  ', 'xyz', '0x', '123456789', '0x12345g', '-1', '1a2b3c4d\nq', '００']) {
      expect(parseSeedHex(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('formatSeed：0x + 8 位小写十六进制补零', () => {
    expect(formatSeed(0x1a2b3c4d)).toBe('0x1a2b3c4d')
    expect(formatSeed(0)).toBe('0x00000000')
    expect(formatSeed(0xff)).toBe('0x000000ff')
    expect(formatSeed(0xffffffff)).toBe('0xffffffff')
  })

  it('mulberry32：同 seed 同序列、值域 [0,1)、有区分度；上位实现与既有测试工具逐值一致', () => {
    // 参照实现 = generator.spec.ts 既有本地 mulberry32 的逐句拷贝（同算法护栏）
    function referenceMulberry32(seed: number): () => number {
      let a = seed >>> 0
      return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }
    for (const seed of [0, 1, 42, 0xdeadbeef, 0xffffffff]) {
      const produced = mulberry32(seed)
      const expected = referenceMulberry32(seed)
      for (let i = 0; i < 100; i++) expect(produced()).toBe(expected())
    }

    const a = mulberry32(0x1a2b3c4d)
    const b = mulberry32(0x1a2b3c4d)
    const seqA: number[] = []
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const v = a()
      seqA.push(v)
      seen.add(v)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(b()).toBe(seqA[0])
    expect(b()).toBe(seqA[1])
    expect(seen.size).toBeGreaterThan(900)
  })

  it('generateSeeded：非法 seed → invalid-seed（只错该处，不静默回退）', async () => {
    expect(await generateSeeded({ fields: ['phone'], count: 1, locale: 'zh', seed: 'zzz' })).toEqual({
      ok: false,
      error: 'invalid-seed',
    })
    expect(await generateSeeded({ fields: ['phone'], count: 1, locale: 'zh', seed: '0x' })).toEqual({
      ok: false,
      error: 'invalid-seed',
    })
    expect(await generateSeeded({ fields: ['phone'], count: 1, locale: 'zh', seed: '123456789' })).toEqual({
      ok: false,
      error: 'invalid-seed',
    })
  })
})

/* ------------------------------------------------------------------ *
 * 随机源纪律（防回归，先例：keypair-generator 的「无持久化源码守卫」）
 * ------------------------------------------------------------------ */

describe('随机源纪律源码守卫（验收 7）', () => {
  const PRODUCTION_FILES = [
    'index.ts',
    'cnId.ts',
    'bankCard.ts',
    'enWords.ts',
    'zhWords.ts',
    'generator.ts',
    'rng.ts',
    'TestDataGenerator.vue',
  ] as const

  function readSource(name: string): string {
    return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
  }

  it('Math.random 调用点全工具仅剩 rng.ts「派生初始 seed」一处', () => {
    let total = 0
    for (const file of PRODUCTION_FILES) {
      const calls = readSource(file).match(/Math\.random\(\)/g) ?? []
      if (file === 'rng.ts') {
        expect(calls.length, 'rng.ts 应恰有一处（deriveRandomSeed 派生初始 seed）').toBe(1)
      } else {
        expect(calls.length, `${file} 不应直接调用 Math.random（须走注入 Rng）`).toBe(0)
      }
      total += calls.length
    }
    expect(total).toBe(1)
  })

  it('生成路径无时钟泄漏：生产源码不出现 Date.now', () => {
    for (const file of PRODUCTION_FILES) {
      expect(readSource(file).includes('Date.now'), `${file} 生成路径不应读取时钟`).toBe(false)
    }
  })
})
