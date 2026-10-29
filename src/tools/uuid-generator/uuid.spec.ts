import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FORMAT,
  ID_KINDS,
  MAX_COUNT,
  MIN_COUNT,
  ULID_ALPHABET,
  decodeUlidTimestamp,
  decodeV7Timestamp,
  formatId,
  generateBatch,
  generateId,
  parseCount,
  ulidFromParts,
  uuidV4FromBytes,
  uuidV7FromBytes,
} from './uuid'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** RFC 4122/9562 位字段：第 14 位十六进制字符为版本号，第 19 位字符 ∈ {8,9,a,b}。 */
function assertUuidBitFields(id: string, version: '4' | '7'): void {
  expect(id).toMatch(UUID_RE)
  expect(id[14], `version nibble (raw[14]) of ${id}`).toBe(version)
  expect(['8', '9', 'a', 'b'], `variant nibble (raw[19]) of ${id}`).toContain(id[19])
}

describe('版本集常量', () => {
  it('恰好三种：v4 / v7 / ulid（不含 NIL/Max/EPOCH/v1/v6）', () => {
    expect(ID_KINDS).toEqual(['v4', 'v7', 'ulid'])
  })
})

describe('UUID v4', () => {
  it('默认路径（全局 crypto.randomUUID / getRandomValues）输出 8-4-4-4-12 且位字段正确', () => {
    for (let i = 0; i < 50; i++) assertUuidBitFields(generateId('v4'), '4')
  })

  it('默认路径连续生成的结果互不相同', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) seen.add(generateId('v4'))
    expect(seen.size).toBe(50)
  })

  it('回退路径 uuidV4FromBytes：仅改写 version/variant 位，其余位原样透传', () => {
    expect(uuidV4FromBytes(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000')
    expect(uuidV4FromBytes(new Uint8Array(16).fill(0xff))).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    )
  })

  it('回退路径对模式化字节同样只动位字段', () => {
    const bytes = new Uint8Array(16)
    for (let i = 0; i < 16; i++) bytes[i] = i * 0x11
    // 期望：hex = 00112233-4455-6677-8899-aabbccddeeff，version→0x46，variant byte8 0x88 已是 10xx 不变
    expect(uuidV4FromBytes(bytes)).toBe('00112233-4455-4677-8899-aabbccddeeff')
  })

  it('注入固定随机源时输出与回退路径一致（依赖注入生效）', () => {
    const id = generateId('v4', { random: () => new Uint8Array(16).fill(0x2a) })
    expect(id).toBe(uuidV4FromBytes(new Uint8Array(16).fill(0x2a)))
    assertUuidBitFields(id, '4')
  })

  it('字节数不为 16 时抛出 RangeError', () => {
    expect(() => uuidV4FromBytes(new Uint8Array(15))).toThrow(RangeError)
  })
})

describe('UUID v7', () => {
  const FIXED_TS = 1_700_000_000_000 // 2023-11-14T22:13:20Z，超过 2^31，防 32 位截断回归

  it('注入固定时间后，前 48 bit 解码回该毫秒时间戳，且 version=7、variant=10xx', () => {
    for (const ts of [0, 1, FIXED_TS, 2 ** 48 - 1]) {
      const id = generateId('v7', { now: () => ts, random: () => new Uint8Array(10).fill(0x5a) })
      assertUuidBitFields(id, '7')
      expect(decodeV7Timestamp(id), `ts=${ts}`).toBe(ts)
    }
  })

  it('默认路径（真实时钟）解码时间戳落在生成前后的时间窗口内', () => {
    const start = Date.now()
    const ids = Array.from({ length: 100 }, () => generateId('v7'))
    const end = Date.now()
    for (const id of ids) {
      const ts = decodeV7Timestamp(id)
      expect(ts).toBeGreaterThanOrEqual(start)
      expect(ts).toBeLessThanOrEqual(end)
    }
  })

  it('uuidV7FromBytes：仅改写 version/variant 位，随机位原样透传', () => {
    expect(uuidV7FromBytes(0, new Uint8Array(10))).toBe('00000000-0000-7000-8000-000000000000')
    expect(uuidV7FromBytes(0, new Uint8Array(10).fill(0xff))).toBe(
      '00000000-0000-7fff-bfff-ffffffffffff',
    )
  })

  it('时间戳按大端序写入前 6 字节（含 >2^31 的毫秒值）', () => {
    // 0x0123456789AB = 1_257_886_017_963
    const id = uuidV7FromBytes(0x0123456789ab, new Uint8Array(10))
    expect(id.startsWith('01234567-89ab')).toBe(true)
    expect(decodeV7Timestamp(id)).toBe(0x0123456789ab)
  })

  it('随机字节数不为 10 或时间戳越界时抛出 RangeError', () => {
    expect(() => uuidV7FromBytes(FIXED_TS, new Uint8Array(9))).toThrow(RangeError)
    expect(() => uuidV7FromBytes(-1, new Uint8Array(10))).toThrow(RangeError)
    expect(() => uuidV7FromBytes(2 ** 48, new Uint8Array(10))).toThrow(RangeError)
  })

  it('同毫秒批量不保证有序——只验证时间戳前缀一致与唯一性，不断言行序', () => {
    const ids = Array.from({ length: 200 }, () => generateId('v7', { now: () => FIXED_TS }))
    const seen = new Set<string>()
    for (const id of ids) {
      expect(decodeV7Timestamp(id)).toBe(FIXED_TS)
      seen.add(id)
    }
    expect(seen.size).toBe(200)
  })
})

describe('ULID', () => {
  const FIXED_TS = 1_700_000_000_000
  // Crockford base32：26 字符、字母表不含 I/L/O/U（大小写不敏感）
  const ULID_RE = /^[0-9a-hj-np-tv-z]{26}$/i

  it('字母表恰好 32 字符且不含 I、L、O、U', () => {
    expect(ULID_ALPHABET).toHaveLength(32)
    expect(ULID_ALPHABET).not.toMatch(/[ILOU]/)
    expect(new Set(ULID_ALPHABET).size).toBe(32)
  })

  it('输出为 26 字符且字符集 ⊆ Crockford base32', () => {
    for (let i = 0; i < 50; i++) expect(generateId('ulid')).toMatch(ULID_RE)
  })

  it('注入固定时间后，前 10 字符解码回该毫秒时间戳', () => {
    for (const ts of [0, 1, FIXED_TS, 2 ** 48 - 1]) {
      const ulid = generateId('ulid', { now: () => ts, random: () => new Uint8Array(10) })
      expect(ulid).toMatch(ULID_RE)
      expect(decodeUlidTimestamp(ulid), `ts=${ts}`).toBe(ts)
    }
  })

  it('ulidFromParts：边界值编码确定（全 0 / 全 1 随机位）', () => {
    expect(ulidFromParts(0, new Uint8Array(10))).toBe('0'.repeat(26))
    // 时间戳字段占前 10 字符（50 位，含 2 个前导 0）、随机 80 位占后 16 字符：
    // ts=0 + 全 1 随机位 → 时间戳字段全 '0'、随机字段全 'Z'
    expect(ulidFromParts(0, new Uint8Array(10).fill(0xff))).toBe('0'.repeat(10) + 'Z'.repeat(16))
    // ts=1 占 bit 80 → 第 10 个字符（0 起索引 9）为 '1'
    expect(ulidFromParts(1, new Uint8Array(10))).toBe('0'.repeat(9) + '1' + '0'.repeat(16))
  })

  it('词典序跨毫秒单调：T1 < T2 时，即使 T1 随机位全满、T2 随机位全空，仍有 ulid(T1) < ulid(T2)', () => {
    const t1 = FIXED_TS
    const t2 = FIXED_TS + 1
    const early = ulidFromParts(t1, new Uint8Array(10).fill(0xff))
    const late = ulidFromParts(t2, new Uint8Array(10))
    expect(early < late).toBe(true)
  })

  it('同一 ULID 生成时刻的单调性跨更大间隔仍成立', () => {
    const early = ulidFromParts(100_000, new Uint8Array(10).fill(0xff))
    const late = ulidFromParts(200_000, new Uint8Array(10))
    expect(early < late).toBe(true)
  })

  it('解码大小写不敏感（Crockford 字母表语义）', () => {
    const ulid = generateId('ulid', { now: () => FIXED_TS, random: () => new Uint8Array(10) })
    expect(decodeUlidTimestamp(ulid.toUpperCase())).toBe(FIXED_TS)
    expect(decodeUlidTimestamp(ulid.toLowerCase())).toBe(FIXED_TS)
  })

  it('随机字节数不为 10 或时间戳越界时抛出 RangeError', () => {
    expect(() => ulidFromParts(FIXED_TS, new Uint8Array(9))).toThrow(RangeError)
    expect(() => ulidFromParts(-1, new Uint8Array(10))).toThrow(RangeError)
    expect(() => ulidFromParts(2 ** 48, new Uint8Array(10))).toThrow(RangeError)
  })

  it('解码遇非 Crockford 字符（I/L/O/U、非法符号）抛出错误', () => {
    expect(() => decodeUlidTimestamp('I' + '0'.repeat(25))).toThrow(Error)
    expect(() => decodeUlidTimestamp('0'.repeat(9) + '/1234')).toThrow(Error)
  })
})

describe('批量生成与数量校验', () => {
  it.each(['v4', 'v7', 'ulid'] as const)('批量 %i：1000 个无重复、数量正确', (kind) => {
    const ids = generateBatch(kind, MAX_COUNT)
    expect(ids).toHaveLength(MAX_COUNT)
    expect(new Set(ids).size).toBe(MAX_COUNT)
  })

  it('批量 1000 在同步生成下耗时 < 1s', () => {
    const start = performance.now()
    generateBatch('v4', MAX_COUNT)
    expect(performance.now() - start).toBeLessThan(1000)
  })

  it('数量 = 1 返回单元素数组；边界 MIN/MAX 均可生成', () => {
    expect(generateBatch('v4', MIN_COUNT)).toHaveLength(1)
    expect(generateBatch('v4', MAX_COUNT)).toHaveLength(MAX_COUNT)
    expect(generateBatch('v7', MAX_COUNT)).toHaveLength(MAX_COUNT)
    expect(generateBatch('ulid', MAX_COUNT)).toHaveLength(MAX_COUNT)
  })

  it('数量越界（0、1001）或非整数时抛出 RangeError', () => {
    expect(() => generateBatch('v4', 0)).toThrow(RangeError)
    expect(() => generateBatch('v4', MAX_COUNT + 1)).toThrow(RangeError)
    expect(() => generateBatch('v4', 3.5)).toThrow(RangeError)
    expect(() => generateBatch('v4', Number.NaN)).toThrow(RangeError)
  })

  describe('parseCount：手填数量校验', () => {
    it('1–1000 的合法数字字符串与数字原样通过', () => {
      expect(parseCount('1')).toBe(1)
      expect(parseCount('50')).toBe(50)
      expect(parseCount('1000')).toBe(MAX_COUNT)
      expect(parseCount(' 100 ')).toBe(100) // 允许首尾空白
      expect(parseCount(7)).toBe(7)
    })

    it('越界（0、1001、负数）返回 null', () => {
      expect(parseCount('0')).toBeNull()
      expect(parseCount('1001')).toBeNull()
      expect(parseCount('-5')).toBeNull()
      expect(parseCount(0)).toBeNull()
      expect(parseCount(MAX_COUNT + 1)).toBeNull()
    })

    it('非数字 / 非整数 / 空输入返回 null', () => {
      expect(parseCount('abc')).toBeNull()
      expect(parseCount('')).toBeNull()
      expect(parseCount('   ')).toBeNull()
      expect(parseCount('12.5')).toBeNull()
      expect(parseCount('1e3')).toBeNull()
      expect(parseCount(3.5)).toBeNull()
      expect(parseCount(Number.NaN)).toBeNull()
      expect(parseCount(null)).toBeNull()
      expect(parseCount(undefined)).toBeNull()
    })
  })
})

describe('格式开关（纯呈现变换，不改变标识符本身）', () => {
  const RAW = '00000000-0000-4000-8000-000000000000' // 固定 v4 原始形态
  const RAW_ULID = '01arz3ndektsv4rrffq69g5fav' // 固定 ULID 原始形态（小写）

  it('默认格式：小写、带连字符、无花括号，原样输出', () => {
    expect(DEFAULT_FORMAT).toEqual({ uppercase: false, braces: false, hyphenless: false })
    expect(formatId(RAW, 'v4', { uppercase: false, braces: false, hyphenless: false })).toBe(RAW)
  })

  it('大写：v4/v7/ulid 均生效', () => {
    expect(formatId(RAW, 'v4', { uppercase: true, braces: false, hyphenless: false })).toBe(
      RAW.toUpperCase(),
    )
    expect(formatId(RAW, 'v7', { uppercase: true, braces: false, hyphenless: false })).toBe(
      RAW.toUpperCase(),
    )
    expect(formatId(RAW_ULID, 'ulid', { uppercase: true, braces: false, hyphenless: false })).toBe(
      RAW_ULID.toUpperCase(),
    )
  })

  it('去连字符：仅移除连字符', () => {
    expect(formatId(RAW, 'v4', { uppercase: false, braces: false, hyphenless: true })).toBe(
      '00000000000040008000000000000000',
    )
  })

  it('花括号：包裹去连字符与大写之后的最终字符串', () => {
    expect(formatId(RAW, 'v4', { uppercase: false, braces: true, hyphenless: false })).toBe(
      `{${RAW}}`,
    )
  })

  it('两两组合与三者组合均正确', () => {
    expect(formatId(RAW, 'v4', { uppercase: true, braces: true, hyphenless: false })).toBe(
      `{${RAW.toUpperCase()}}`,
    )
    expect(formatId(RAW, 'v4', { uppercase: true, braces: false, hyphenless: true })).toBe(
      RAW.toUpperCase().replace(/-/g, ''),
    )
    expect(formatId(RAW, 'v4', { uppercase: false, braces: true, hyphenless: true })).toBe(
      '{00000000000040008000000000000000}',
    )
    expect(formatId(RAW, 'v4', { uppercase: true, braces: true, hyphenless: true })).toBe(
      '{00000000000040008000000000000000}'.toUpperCase(),
    )
  })

  it('ULID：花括号与去连字符不适用——即使被置位也不产生花括号/影响内容', () => {
    expect(formatId(RAW_ULID, 'ulid', { uppercase: false, braces: true, hyphenless: true })).toBe(
      RAW_ULID,
    )
    expect(formatId(RAW_ULID, 'ulid', { uppercase: true, braces: true, hyphenless: true })).toBe(
      RAW_ULID.toUpperCase(),
    )
  })

  it('省略 format 参数时按默认格式输出', () => {
    expect(formatId(RAW, 'v4')).toBe(RAW)
  })

  it('formatId 对真实生成结果做格式化后仍可解码时间戳（呈现不破坏语义）', () => {
    const ts = 1_700_000_000_000
    const v7 = generateId('v7', { now: () => ts })
    const formatted = formatId(v7, 'v7', { uppercase: true, braces: true, hyphenless: true })
    const bare = formatted.replace(/[{}]/g, '')
    expect(decodeV7Timestamp(bare.toLowerCase())).toBe(ts)
  })
})
