import { describe, expect, it } from 'vitest'
import {
  CHAR_CLASSES,
  CONFUSABLE_CHARS,
  DEFAULT_POLICY,
  MAX_LENGTH,
  MIN_LENGTH,
  SYMBOLS,
  buildPool,
  generatePasswords,
  strengthTier,
  parseExclusions,
  sampleInt,
  theoreticalEntropy,
  validateCount,
  validateLength,
  cryptoByteSource,
} from './password'
import type { ByteSource, Policy } from './password'

/* ---------- 测试用随机源 ---------- */

/** xorshift32 确定性 PRNG，打包成字节源（拒绝采样统计测试用） */
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

/** 循环字节序列源：按序循环吐出（拒绝采样丢弃行为的精确断言用） */
function loopByteSource(bytes: number[]): ByteSource {
  let i = 0
  return (count: number) => {
    const out = new Uint8Array(count)
    for (let k = 0; k < count; k++) out[k] = bytes[i++ % bytes.length]!
    return out
  }
}

/** 计数包装：记录每次请求的字节数 */
function countingSource(inner: ByteSource): { source: ByteSource; calls: number[] } {
  const calls: number[] = []
  const source: ByteSource = (count) => {
    calls.push(count)
    return inner(count)
  }
  return { source, calls }
}

function policyOf(overrides: Partial<Policy> = {}): Policy {
  return { ...DEFAULT_POLICY, ...overrides }
}

/* ---------- 常量与池构造 ---------- */

describe('符号集显式常量', () => {
  it('恰好 32 个可打印 ASCII 符号，不含空格', () => {
    expect(SYMBOLS.length).toBe(32)
    expect(SYMBOLS).toBe(`!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`)
    expect(SYMBOLS).not.toContain(' ')
    for (const ch of SYMBOLS) {
      const code = ch.charCodeAt(0)
      expect(code, `char ${ch}`).toBeGreaterThanOrEqual(0x21)
      expect(code, `char ${ch}`).toBeLessThanOrEqual(0x7e)
    }
  })
})

describe('buildPool 池构造', () => {
  it('默认四类全开：池大小 94，无重复字符', () => {
    const result = buildPool(policyOf())
    expect('ok' in result && result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.pool.length).toBe(94)
    expect(new Set(result.pool).size).toBe(94)
  })

  it('混淆开关：恰好去掉 0 O o I l 1 六个字符（94 → 88）', () => {
    const result = buildPool(policyOf({ excludeConfusable: true }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(CONFUSABLE_CHARS).toBe('0OoIl1')
    expect(CONFUSABLE_CHARS.length).toBe(6)
    expect(result.pool.length).toBe(88)
    for (const ch of CONFUSABLE_CHARS) {
      expect(result.pool.includes(ch), `confusable ${ch}`).toBe(false)
    }
  })

  it('仅数字 + 混淆开关：去掉 0 和 1，剩 8 字符', () => {
    const result = buildPool(
      policyOf({ classes: { lower: false, upper: false, digits: true, symbols: false }, excludeConfusable: true }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.pool.length).toBe(8)
    expect(result.pool).not.toContain('0')
    expect(result.pool).not.toContain('1')
  })

  it('自定义排除与混淆开关叠加', () => {
    // 全类 + 混淆 + 自定义排除 ab! → 88 - 3 = 85
    const result = buildPool(policyOf({ excludeConfusable: true, customExcluded: 'ab!' }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.pool.length).toBe(85)
    for (const ch of 'ab!') expect(result.pool.includes(ch)).toBe(false)
  })

  it('自定义排除输入去重、忽略空白', () => {
    expect(parseExclusions('aab  b!')).toEqual(['a', 'b', '!'])
    expect(parseExclusions('   ')).toEqual([])
  })

  it('排除后某已开类池为空 → class-empty 错误（含池整体为空的情况）', () => {
    // 仅数字 + 排除全部数字 → 该类空
    const digitsOnly = buildPool(
      policyOf({ classes: { lower: false, upper: false, digits: true, symbols: false }, customExcluded: '0123456789' }),
    )
    expect(digitsOnly).toEqual({ ok: false, error: 'class-empty' })
    // 全类 + 排除足以清空小写类
    const lowerEmpty = buildPool(policyOf({ customExcluded: 'abcdefghijklmnopqrstuvwxyz' }))
    expect(lowerEmpty).toEqual({ ok: false, error: 'class-empty' })
  })

  it('没有任何已开类 → no-class 错误', () => {
    const result = buildPool(
      policyOf({ classes: { lower: false, upper: false, digits: false, symbols: false } }),
    )
    expect(result).toEqual({ ok: false, error: 'no-class' })
  })

  it('每个已开类都有对应的类池，未开类不在池中', () => {
    const result = buildPool(policyOf({ classes: { lower: true, upper: false, digits: true, symbols: false } }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.classPools.map((c) => c.id).sort()).toEqual(['digits', 'lower'])
    expect(result.classPools.find((c) => c.id === 'digits')!.chars).toBe('0123456789')
  })

  it('CHAR_CLASSES 元数据与各类字符集大小', () => {
    const sizes = Object.fromEntries(CHAR_CLASSES.map((c) => [c.id, c.charset.length]))
    expect(sizes).toEqual({ lower: 26, upper: 26, digits: 10, symbols: 32 })
  })
})

/* ---------- 拒绝采样 ---------- */

describe('sampleInt 拒绝采样（无模偏差）', () => {
  it('注入循环序列：越界字节被丢弃，不产生模偏差（250 → 丢弃，9 被接受）', () => {
    // 仅数字池（10 字符）：limit = floor(256/10)*10 = 250，字节 250 越界必须被丢弃。
    // 循环喂 [250, 9]：若用取模捷径 250 % 10 = 0，结果会混入 0；
    // 拒绝采样下所有被接受的值都是 9 → 整串 '99999999'。
    const { source, calls } = countingSource(loopByteSource([250, 9]))
    const result = generatePasswords(
      policyOf({ classes: { lower: false, upper: false, digits: true, symbols: false }, length: 8 }),
      1,
      source,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.passwords[0]).toBe('99999999')
    // 逐字节采样：每次只请求 1 字节
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((n) => n === 1)).toBe(true)
  })

  it('直接采样池 94：字节 188（= limit，不含）必须丢弃，187 接受并映射到索引 93', () => {
    // 94 池：limit = floor(256/94)*94 = 188（不含 188），187 % 94 = 93。
    const random = loopByteSource([188, 187])
    for (let i = 0; i < 50; i++) {
      expect(sampleInt(random, 94), `draw ${i}`).toBe(93)
    }
    // 仅喂 187（合法区间内）时原样接受
    expect(sampleInt(loopByteSource([187]), 94)).toBe(93)
    // 仅喂 188（越界）+ 0 时：188 丢弃，0 接受 → 0
    expect(sampleInt(loopByteSource([188, 0]), 94)).toBe(0)
  })

  it('确定性 PRNG 大样本：永不越界且频率均匀（拒绝采样生效）', () => {
    const source = prngByteSource(0x12345678)
    const policy = policyOf({ classes: { lower: false, upper: false, digits: true, symbols: false }, length: 128 })
    const result = generatePasswords(policy, 100, source) // 100 × 128 = 12800 样本
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    const bins = new Array<number>(10).fill(0)
    for (const pw of result.passwords) {
      expect(pw).toHaveLength(128)
      for (const ch of pw) {
        const idx = Number(ch)
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(10)
        bins[idx]++
      }
    }
    // 期望每桶 1280，容差 ±15%（约 5.6σ；系统性模偏差必然击穿）
    for (let i = 0; i < 10; i++) {
      expect(bins[i], `bin ${i}`).toBeGreaterThan(1088)
      expect(bins[i], `bin ${i}`).toBeLessThan(1472)
    }
  })

  it('真实 crypto 源可用且在范围内', () => {
    const result = generatePasswords(policyOf(), 5, cryptoByteSource)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.passwords).toHaveLength(5)
    const pool = buildPool(policyOf())
    if (!pool.ok) throw new Error('expected ok')
    for (const pw of result.passwords) {
      expect(pw).toHaveLength(DEFAULT_POLICY.length)
      for (const ch of pw) expect(pool.pool.includes(ch)).toBe(true)
    }
  })
})

/* ---------- 每已开类至少一字符 ---------- */

describe('generatePasswords 每已开类至少出现一个字符', () => {
  const cases: Array<{ name: string; policy: Policy }> = [
    {
      name: '四类全开 长度 8',
      policy: policyOf({ length: 8 }),
    },
    {
      name: '四类全开 长度 20',
      policy: policyOf({ length: 20 }),
    },
    {
      name: '四类全开 + 混淆 长度 8（最小长度最紧）',
      policy: policyOf({ length: 8, excludeConfusable: true }),
    },
    {
      name: '仅小写+符号 长度 8',
      policy: policyOf({ length: 8, classes: { lower: true, upper: false, digits: false, symbols: true } }),
    },
    {
      name: '大小写+数字 长度 128',
      policy: policyOf({ length: 128, classes: { lower: true, upper: true, digits: true, symbols: false } }),
    },
  ]

  for (const { name, policy } of cases) {
    it(`${name}（100 样本，数量上限内）`, () => {
      const pool = buildPool(policy)
      expect(pool.ok).toBe(true)
      if (!pool.ok) throw new Error('expected ok')
      const result = generatePasswords(policy, 100, cryptoByteSource)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      for (const pw of result.passwords) {
        expect(pw).toHaveLength(policy.length)
        for (const cp of pool.classPools) {
          const has = [...pw].some((ch) => cp.chars.includes(ch))
          expect(has, `password "${pw}" missing class ${cp.id}`).toBe(true)
        }
      }
    })
  }

  it('确定性 PRNG 下同样满足（排除实现碰运气依赖 crypto）', () => {
    const policy = policyOf({ length: 8 })
    const pool = buildPool(policy)
    if (!pool.ok) throw new Error('expected ok')
    const result = generatePasswords(policy, 100, prngByteSource(42))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    for (const pw of result.passwords) {
      for (const cp of pool.classPools) {
        expect([...pw].some((ch) => cp.chars.includes(ch)), `missing ${cp.id} in "${pw}"`).toBe(true)
      }
    }
  })
})

/* ---------- 长度与数量校验 ---------- */

describe('validateLength / validateCount 边界', () => {
  it('长度 8–128 合法，越界/非整数/NaN 为 null（错误态）', () => {
    expect(MIN_LENGTH).toBe(8)
    expect(MAX_LENGTH).toBe(128)
    expect(validateLength(8)).toBe(8)
    expect(validateLength(20)).toBe(20)
    expect(validateLength(128)).toBe(128)
    expect(validateLength(7)).toBeNull()
    expect(validateLength(129)).toBeNull()
    expect(validateLength(8.5)).toBeNull()
    expect(validateLength(Number.NaN)).toBeNull()
    expect(validateLength(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('数量 1–100 合法，越界为 null', () => {
    expect(validateCount(1)).toBe(1)
    expect(validateCount(100)).toBe(100)
    expect(validateCount(0)).toBeNull()
    expect(validateCount(101)).toBeNull()
    expect(validateCount(2.5)).toBeNull()
  })

  it('generatePasswords 返回 invalid-length / invalid-count 错误', () => {
    expect(generatePasswords(policyOf({ length: 7 }), 1, cryptoByteSource)).toEqual({
      ok: false,
      error: 'invalid-length',
    })
    expect(generatePasswords(policyOf(), 101, cryptoByteSource)).toEqual({ ok: false, error: 'invalid-count' })
    expect(generatePasswords(policyOf(), 0, cryptoByteSource)).toEqual({ ok: false, error: 'invalid-count' })
  })
})

/* ---------- 理论熵与档位 ---------- */

describe('theoreticalEntropy 与 strengthTier', () => {
  it('锚点一：8 位纯小写 ≈ 37.60 bit → 弱', () => {
    const bits = theoreticalEntropy(26, 8)
    expect(bits).toBeCloseTo(37.6035, 3)
    expect(strengthTier(bits)).toBe('weak')
  })

  it('锚点二：12 位字母数字 ≈ 71.45 bit → 中', () => {
    const bits = theoreticalEntropy(62, 12)
    expect(bits).toBeCloseTo(71.4504, 3)
    expect(strengthTier(bits)).toBe('medium')
  })

  it('锚点三：20 位字母数字 ≈ 119.08 bit → 强', () => {
    const bits = theoreticalEntropy(62, 20)
    expect(bits).toBeCloseTo(119.0839, 3)
    expect(strengthTier(bits)).toBe('strong')
  })

  it('档位边界：<40 弱、40–79.99 中、≥80 强', () => {
    expect(strengthTier(39.999)).toBe('weak')
    expect(strengthTier(40)).toBe('medium')
    expect(strengthTier(79.999)).toBe('medium')
    expect(strengthTier(80)).toBe('strong')
  })
})

/* ---------- 端到端确定性 ---------- */

describe('generatePasswords 确定性与退化情形', () => {
  it('同一种子两次生成结果完全一致（随机源注入生效）', () => {
    const a = generatePasswords(policyOf(), 3, prngByteSource(2026))
    const b = generatePasswords(policyOf(), 3, prngByteSource(2026))
    expect(a).toEqual(b)
  })

  it('池收缩到单字符时输出确定值（仅数字+排除 9 个数字）', () => {
    const policy = policyOf({
      classes: { lower: false, upper: false, digits: true, symbols: false },
      customExcluded: '123456789',
      length: 8,
    })
    const result = generatePasswords(policy, 2, prngByteSource(7))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.passwords).toEqual(['00000000', '00000000'])
  })

  it('数量校验后返回对应行数', () => {
    const result = generatePasswords(policyOf(), 10, cryptoByteSource)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.passwords).toHaveLength(10)
    expect(new Set(result.passwords).size).toBe(10) // 94 池 20 位碰撞概率可忽略
  })
})
