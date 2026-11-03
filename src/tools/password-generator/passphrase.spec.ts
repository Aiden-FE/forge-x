import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEX_LENGTH,
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PIN_LENGTH,
  GEN_MAX_COUNT,
  HEX_LENGTHS,
  MAX_WORDS,
  MIN_WORDS,
  PIN_LENGTHS,
  SEPARATORS,
  capitalizeWord,
  generateHex,
  generateHexTokens,
  generatePassphrases,
  generatePin,
  generatePins,
  hexEntropy,
  passphraseEntropy,
  pinEntropy,
  sampleIndex,
  validateGenCount,
  validateHexLength,
  validatePinLength,
  validateWordCount,
} from './passphrase'
import type { ByteSource, PassphraseOptions } from './passphrase'
import { PASSPHRASE_WORDLIST, WORDLIST_SIZE } from './wordlist'

/* ---------- 测试用随机源（与 password.spec 同款） ---------- */

function prngByteSource(seed: number): ByteSource {
  let state = seed >>> 0
  if (state === 0) state = 0x9e3779b9
  return (count: number) => {
    const out = new Uint8Array(count)
    for (let i = 0; i < count; i++) {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      state >>>= 0
      out[i] = state & 0xff
    }
    return out
  }
}

function loopByteSource(bytes: number[]): ByteSource {
  let i = 0
  return (count: number) => {
    const out = new Uint8Array(count)
    for (let k = 0; k < count; k++) out[k] = bytes[i++ % bytes.length]!
    return out
  }
}

function optsOf(overrides: Partial<PassphraseOptions> = {}): PassphraseOptions {
  return { ...DEFAULT_PASSPHRASE_OPTIONS, ...overrides }
}

/* ---------- 词表数据模块（EFF Large，公共领域） ---------- */

describe('词表数据模块', () => {
  it('恰好 7776 个唯一词，全小写字母（个别含连字符）', () => {
    expect(WORDLIST_SIZE).toBe(7776)
    expect(PASSPHRASE_WORDLIST).toHaveLength(7776)
    expect(new Set(PASSPHRASE_WORDLIST).size).toBe(7776)
    for (const w of PASSPHRASE_WORDLIST) {
      expect(w).toMatch(/^[a-z-]+$/)
      expect(w).toBe(w.toLowerCase())
    }
  })

  it('首个与末个词与上游文件一致（abacus / zoom）', () => {
    expect(PASSPHRASE_WORDLIST[0]).toBe('abacus')
    expect(PASSPHRASE_WORDLIST[7775]).toBe('zoom')
  })

  it('passphrase.ts 不静态携带词表：生成函数以词表注入（小词表可生成）', () => {
    const fake = ['alpha', 'beta', 'gamma']
    const out = generatePassphrases(fake, optsOf(), 3, prngByteSource(1))
    expect(out).toHaveLength(3)
    for (const line of out) {
      for (const w of line.split('-')) expect(fake).toContain(w.toLowerCase())
    }
  })
})

/* ---------- sampleIndex 多字节拒绝采样（均匀性卡方断言） ---------- */

describe('sampleIndex 多字节拒绝采样（无模偏差，卡方）', () => {
  it('确定性 PRNG 大样本：卡方统计量落在 df ± 4σ 内（7776 桶合并为 27 桶）', () => {
    // 270,000 次采样 / 27 桶（每桶覆盖 288 个索引值）→ 期望每桶 10,000。
    // 模偏差会把部分桶系统性抬高/压低，卡方必然击穿；均匀采样下
    // chi² ~ χ²(26)，均值 26，标准差 √52 ≈ 7.2，4σ 上界 ≈ 54.8。
    const random = prngByteSource(0x5eed_7776)
    const BINS = 27
    const PER_BIN = WORDLIST_SIZE / BINS // 288
    const SAMPLES = 270_000
    const bins = new Array<number>(BINS).fill(0)
    for (let i = 0; i < SAMPLES; i++) bins[Math.floor(sampleIndex(random, WORDLIST_SIZE) / PER_BIN)]++
    const expected = SAMPLES / BINS
    let chi2 = 0
    for (const obs of bins) chi2 += ((obs - expected) * (obs - expected)) / expected
    expect(bins.every((b) => b > 0)).toBe(true)
    expect(chi2).toBeLessThan(26 + 4 * Math.sqrt(2 * 26))
  })

  it('拒绝采样行为可注入验证：越界 2 字节值被丢弃', () => {
    // 7776 桶：space = 65536，limit = floor(65536/7776)*7776 = 62208。
    // 0xF2FF = 62207（合法区间末位）→ 62207 % 7776 = 7775；
    // 0xF300 = 62208（== limit，越界）必须被丢弃。
    const random = loopByteSource([0xf2, 0xff, 0, 0])
    expect(sampleIndex(random, WORDLIST_SIZE)).toBe(7775)
    const alwaysRejected = loopByteSource([0xf3, 0x00, 0xf3, 0x00, 0, 0]) // 越界丢弃两次 → 0
    expect(sampleIndex(alwaysRejected, WORDLIST_SIZE)).toBe(0)
  })
})

/* ---------- 口令短语生成 ---------- */

describe('generatePassphrases', () => {
  it('默认 4 词、`-` 连接、全小写；词数与分隔符档位正确', () => {
    const out = generatePassphrases(PASSPHRASE_WORDLIST, optsOf(), 20, prngByteSource(2026))
    expect(out).toHaveLength(20)
    for (const line of out) {
      const parts = line.split('-')
      expect(parts).toHaveLength(4)
      for (const p of parts) expect(PASSPHRASE_WORDLIST).toContain(p)
    }
  })

  it('分隔符档位 `-` / 空格 / `.` / `_` 全部生效', () => {
    for (const sep of SEPARATORS) {
      const out = generatePassphrases(PASSPHRASE_WORDLIST, optsOf({ separator: sep }), 5, prngByteSource(7))
      for (const line of out) expect(line.split(sep)).toHaveLength(4)
    }
    expect(SEPARATORS).toEqual(['-', ' ', '.', '_'])
  })

  it('首字母大写档逐词应用（连字符词仅首字符大写）', () => {
    expect(capitalizeWord('t-shirt')).toBe('T-shirt')
    expect(capitalizeWord('abacus')).toBe('Abacus')
    expect(capitalizeWord('')).toBe('')
    const lower = generatePassphrases(PASSPHRASE_WORDLIST, optsOf({ casing: 'lower' }), 10, prngByteSource(42))
    const upper = generatePassphrases(PASSPHRASE_WORDLIST, optsOf({ casing: 'capitalize' }), 10, prngByteSource(42))
    for (let i = 0; i < lower.length; i++) {
      const expected = lower[i]!
        .split('-')
        .map((w) => capitalizeWord(w))
        .join('-')
      expect(upper[i]).toBe(expected)
    }
  })

  it('每行结果独立采样（各行互不衍生），同种子可复现', () => {
    const a = generatePassphrases(PASSPHRASE_WORDLIST, optsOf(), 50, prngByteSource(9))
    const b = generatePassphrases(PASSPHRASE_WORDLIST, optsOf(), 50, prngByteSource(9))
    expect(a).toEqual(b)
    expect(new Set(a).size).toBeGreaterThan(45) // 4 词 7776 桶下碰撞概率可忽略
  })

  it('批量可达 1000（新模式上限），词数边界 3 与 10 合法', () => {
    expect(MIN_WORDS).toBe(3)
    expect(MAX_WORDS).toBe(10)
    const out = generatePassphrases(PASSPHRASE_WORDLIST, optsOf({ words: 3 }), 1000, prngByteSource(11))
    expect(out).toHaveLength(1000)
    expect(new Set(out).size).toBe(1000) // 3 词熵 ≈ 38.9 bit，1000 行碰撞仍可忽略
    for (const line of out) expect(line.split('-')).toHaveLength(3)
  })

  it('非法词数 / 非法数量抛 RangeError（UI 先行校验，函数防误用）', () => {
    expect(() => generatePassphrases(PASSPHRASE_WORDLIST, optsOf({ words: 2 }), 1, prngByteSource(1))).toThrow(RangeError)
    expect(() => generatePassphrases(PASSPHRASE_WORDLIST, optsOf({ words: 11 }), 1, prngByteSource(1))).toThrow(RangeError)
    expect(() => generatePassphrases(PASSPHRASE_WORDLIST, optsOf(), 1001, prngByteSource(1))).toThrow(RangeError)
    expect(() => generatePassphrases([], optsOf(), 1, prngByteSource(1))).toThrow(/wordlist/)
  })

  it('validateWordCount / validateGenCount 边界', () => {
    expect(validateWordCount(3)).toBe(3)
    expect(validateWordCount(10)).toBe(10)
    expect(validateWordCount(2)).toBeNull()
    expect(validateWordCount(2.5)).toBeNull()
    expect(validateWordCount(Number.NaN)).toBeNull()
    expect(validateGenCount(1)).toBe(1)
    expect(validateGenCount(GEN_MAX_COUNT)).toBe(GEN_MAX_COUNT)
    expect(validateGenCount(0)).toBeNull()
    expect(validateGenCount(1001)).toBeNull()
  })
})

/* ---------- PIN ---------- */

describe('PIN（4/6/8 位，默认 6）', () => {
  it('档位常量与校验', () => {
    expect([...PIN_LENGTHS]).toEqual([4, 6, 8])
    expect(DEFAULT_PIN_LENGTH).toBe(6)
    expect(validatePinLength(6)).toBe(true)
    expect(validatePinLength(5)).toBe(false)
  })

  it('字符集与长度严格：^[0-9]{n}$（验收）', () => {
    for (const len of PIN_LENGTHS) {
      const out = generatePins(len, 30, prngByteSource(0xfeed))
      expect(out).toHaveLength(30)
      for (const pin of out) {
        expect(pin).toMatch(new RegExp(`^[0-9]{${len}}$`))
      }
    }
  })

  it('均匀采样：数字分布无系统性偏置（确定性 PRNG 大样本）', () => {
    const random = prngByteSource(0xbead)
    const bins = new Array<number>(10).fill(0)
    for (let i = 0; i < 10_000; i++) {
      for (const ch of generatePin(6, random)) bins[Number(ch)]++
    }
    const expected = 60_000 / 10
    for (const obs of bins) {
      expect(obs).toBeGreaterThan(expected * 0.85)
      expect(obs).toBeLessThan(expected * 1.15)
    }
  })

  it('每行独立、非法长度抛错', () => {
    const out = generatePins(4, 100, prngByteSource(3))
    expect(new Set(out).size).toBeGreaterThan(90)
    const bad: number = 5
    expect(() => generatePins(bad as 4, 1, prngByteSource(1))).toThrow(RangeError)
    expect(() => generatePins(6, 1001, prngByteSource(1))).toThrow(RangeError)
  })
})

/* ---------- 十六进制 ---------- */

describe('Hex（8/16/32 字符，默认 16）', () => {
  it('档位常量与校验', () => {
    expect([...HEX_LENGTHS]).toEqual([8, 16, 32])
    expect(DEFAULT_HEX_LENGTH).toBe(16)
    expect(validateHexLength(32)).toBe(true)
    expect(validateHexLength(64)).toBe(false)
  })

  it('字符集与长度严格：^[0-9a-f]{n}$，全小写（验收）', () => {
    for (const len of HEX_LENGTHS) {
      const out = generateHexTokens(len, 30, prngByteSource(0x3c3c))
      expect(out).toHaveLength(30)
      for (const tok of out) expect(tok).toMatch(new RegExp(`^[0-9a-f]{${len}}$`))
    }
  })

  it('generateHex 单条与批量一致；非法长度抛错', () => {
    const random = prngByteSource(5)
    const single = generateHex(8, random)
    expect(single).toMatch(/^[0-9a-f]{8}$/)
    const bad: number = 10
    expect(() => generateHexTokens(bad as 8, 1, prngByteSource(1))).toThrow(RangeError)
  })
})

/* ---------- 理论熵（词表口径） ---------- */

describe('理论熵（沿用既有术语：长度 × log₂(池大小)）', () => {
  it('默认 4 词：log₂(7776⁴) ≈ 51.7 bit（验收锚点）', () => {
    expect(passphraseEntropy(WORDLIST_SIZE, 4)).toBeCloseTo(51.699, 2)
    expect(passphraseEntropy(7776, 4)).toBeCloseTo(4 * Math.log2(7776), 12)
  })

  it('档位锚点：3 词 ≈ 38.77（弱）、6 词 ≈ 77.55（中）、10 词 ≈ 129.25（强）', () => {
    expect(passphraseEntropy(7776, 3)).toBeCloseTo(38.774, 2)
    expect(passphraseEntropy(7776, 6)).toBeCloseTo(77.549, 2)
    expect(passphraseEntropy(7776, 10)).toBeCloseTo(129.248, 2)
  })

  it('PIN 与 Hex 熵：6 位 PIN ≈ 19.9 bit；16 字符 Hex = 64 bit', () => {
    expect(pinEntropy(6)).toBeCloseTo(6 * Math.log2(10), 12)
    expect(hexEntropy(16)).toBeCloseTo(64, 12)
    expect(hexEntropy(32)).toBeCloseTo(128, 12)
  })
})
