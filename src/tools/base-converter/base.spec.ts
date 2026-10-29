import { describe, expect, it } from 'vitest'
import {
  FIELD_RADIXES,
  MAX_RADIX,
  MIN_RADIX,
  codePointOf,
  formatAll,
  formatBigInt,
  formatField,
  isRadixValid,
  normalizeRadix,
  parseIntInRadix,
} from './base'
import type { FieldKey } from './base'

// 外部计算器（node BigInt）得出的真值，不得用被测实现推导。
const HUGE_DEC = '123456789012345678901234567890'
const HUGE = 123456789012345678901234567890n
const HUGE_HEX = '18ee90ff6c373e0ee4e3f0ad2'
const HUGE_BIN =
  '1100011101110100100001111111101101100001101110011111000001110111001001110001111110000101011010010'
const HUGE_OCT = '143564417755415637016711617605322'
const HUGE_B36 = 'byw97um9s91dlz68tsi'
const TWO_POW_64_PLUS_1 = 18446744073709551617n
const TWO_POW_64_PLUS_1_HEX = '10000000000000001'
const TWO_POW_64_PLUS_1_B36 = '3w5e11264sgsh'

describe('radix 校验与归一化', () => {
  it('边界常量为 2 与 36', () => {
    expect(MIN_RADIX).toBe(2)
    expect(MAX_RADIX).toBe(36)
  })

  it('isRadixValid 接受 2–36 的整数', () => {
    expect(isRadixValid(2)).toBe(true)
    expect(isRadixValid(10)).toBe(true)
    expect(isRadixValid(36)).toBe(true)
    expect(isRadixValid(1)).toBe(false)
    expect(isRadixValid(37)).toBe(false)
    expect(isRadixValid(0)).toBe(false)
    expect(isRadixValid(-2)).toBe(false)
  })

  it('normalizeRadix 截断小数、拒绝越界与非有限值', () => {
    expect(normalizeRadix(16)).toBe(16)
    expect(normalizeRadix(16.9)).toBe(16)
    expect(normalizeRadix(2.0001)).toBe(2)
    expect(normalizeRadix(1)).toBeNull()
    expect(normalizeRadix(37)).toBeNull()
    expect(normalizeRadix(Number.NaN)).toBeNull()
    expect(normalizeRadix(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('parseIntInRadix 对越界基数抛出 RangeError（编程错误）', () => {
    expect(() => parseIntInRadix('1', 1)).toThrow(RangeError)
    expect(() => parseIntInRadix('1', 37)).toThrow(RangeError)
  })
})

describe('解析各进制', () => {
  it('十进制', () => {
    expect(parseIntInRadix('0', 10)).toEqual({ status: 'ok', value: 0n })
    expect(parseIntInRadix('255', 10)).toEqual({ status: 'ok', value: 255n })
    expect(parseIntInRadix('007', 10)).toEqual({ status: 'ok', value: 7n })
  })

  it('二进制 / 八进制 / 十六进制', () => {
    expect(parseIntInRadix('1010', 2)).toEqual({ status: 'ok', value: 10n })
    expect(parseIntInRadix('777', 8)).toEqual({ status: 'ok', value: 511n })
    expect(parseIntInRadix('ff', 16)).toEqual({ status: 'ok', value: 255n })
  })

  it('字母解析大小写不敏感', () => {
    expect(parseIntInRadix('FF', 16)).toEqual({ status: 'ok', value: 255n })
    expect(parseIntInRadix('Ff', 16)).toEqual({ status: 'ok', value: 255n })
    expect(parseIntInRadix('fF', 16)).toEqual({ status: 'ok', value: 255n })
  })

  it('两端空白被忽略', () => {
    expect(parseIntInRadix('  ff  ', 16)).toEqual({ status: 'ok', value: 255n })
  })

  it('自定义基数：36 进制 z → 35，7 进制 50664 → 12345', () => {
    expect(parseIntInRadix('z', 36)).toEqual({ status: 'ok', value: 35n })
    expect(parseIntInRadix('Z', 36)).toEqual({ status: 'ok', value: 35n })
    expect(parseIntInRadix('50664', 7)).toEqual({ status: 'ok', value: 12345n })
  })

  it('空输入返回 empty（语义：清空联动）', () => {
    expect(parseIntInRadix('', 10).status).toBe('empty')
    expect(parseIntInRadix('   ', 10).status).toBe('empty')
    expect(parseIntInRadix('', 16).status).toBe('empty')
  })
})

describe('负数', () => {
  it('前导负号', () => {
    expect(parseIntInRadix('-ff', 16)).toEqual({ status: 'ok', value: -255n })
    expect(parseIntInRadix('-1010', 2)).toEqual({ status: 'ok', value: -10n })
    expect(parseIntInRadix('-z', 36)).toEqual({ status: 'ok', value: -35n })
  })

  it('-0 归一为 0', () => {
    expect(parseIntInRadix('-0', 10)).toEqual({ status: 'ok', value: 0n })
  })

  it('仅负号无数字：非法，指向负号之后', () => {
    const res = parseIntInRadix('-', 10)
    expect(res).toEqual({ status: 'invalid', index: 1, char: undefined })
  })

  it('不支持前导加号', () => {
    const res = parseIntInRadix('+5', 10)
    expect(res.status).toBe('invalid')
    expect(res.status === 'invalid' && res.index).toBe(0)
  })
})

describe('前缀输入（0b/0o/0x 仅对固定 2/8/16 生效）', () => {
  it('匹配的前缀被接受，大小写不敏感', () => {
    expect(parseIntInRadix('0xff', 16)).toEqual({ status: 'ok', value: 255n })
    expect(parseIntInRadix('0XFF', 16)).toEqual({ status: 'ok', value: 255n })
    expect(parseIntInRadix('0b101', 2)).toEqual({ status: 'ok', value: 5n })
    expect(parseIntInRadix('0B101', 2)).toEqual({ status: 'ok', value: 5n })
    expect(parseIntInRadix('0o17', 8)).toEqual({ status: 'ok', value: 15n })
    expect(parseIntInRadix('0O17', 8)).toEqual({ status: 'ok', value: 15n })
  })

  it('负号与前缀可组合', () => {
    expect(parseIntInRadix('-0xff', 16)).toEqual({ status: 'ok', value: -255n })
  })

  it('无前缀的写法照常有效', () => {
    expect(parseIntInRadix('ff', 16)).toEqual({ status: 'ok', value: 255n })
  })

  it('前缀与字段进制不匹配 → 非法字符，定位到前缀字母', () => {
    expect(parseIntInRadix('0b101', 16)).toEqual({ status: 'invalid', index: 1, char: 'b' })
    expect(parseIntInRadix('0xff', 2)).toEqual({ status: 'invalid', index: 1, char: 'x' })
    expect(parseIntInRadix('0xff', 8)).toEqual({ status: 'invalid', index: 1, char: 'x' })
    expect(parseIntInRadix('0o1', 2)).toEqual({ status: 'invalid', index: 1, char: 'o' })
    expect(parseIntInRadix('0x10', 10)).toEqual({ status: 'invalid', index: 1, char: 'x' })
  })

  it('十六进制字段中 0b 开头一律视为不匹配的前缀（规格：不匹配按非法字符处理）', () => {
    expect(parseIntInRadix('0beef', 16)).toEqual({ status: 'invalid', index: 1, char: 'b' })
  })

  it('前缀后无数字：非法，指向前缀之后', () => {
    const res = parseIntInRadix('0x', 16)
    expect(res).toEqual({ status: 'invalid', index: 2, char: undefined })
  })

  it('自定义进制与前缀：无前缀概念，按普通数字解析', () => {
    expect(parseIntInRadix('0z', 36)).toEqual({ status: 'ok', value: 35n })
    expect(parseIntInRadix('0x10', 36)).toEqual({ status: 'ok', value: 42804n })
    expect(parseIntInRadix('0b101', 36)).toEqual({ status: 'ok', value: 514513n })
  })
})

describe('非法字符定位', () => {
  it('报告第一个非法字符的位置与字符', () => {
    expect(parseIntInRadix('12', 2)).toEqual({ status: 'invalid', index: 1, char: '2' })
    expect(parseIntInRadix('1a2', 2)).toEqual({ status: 'invalid', index: 1, char: 'a' })
    expect(parseIntInRadix('12a3', 10)).toEqual({ status: 'invalid', index: 2, char: 'a' })
    expect(parseIntInRadix('g', 16)).toEqual({ status: 'invalid', index: 0, char: 'g' })
    expect(parseIntInRadix('abc', 10)).toEqual({ status: 'invalid', index: 0, char: 'a' })
  })

  it('index 基于去除两端空白后的文本（原始索引应为 3，去除后为 1）', () => {
    expect(parseIntInRadix('  1x1  ', 2)).toEqual({ status: 'invalid', index: 1, char: 'x' })
  })

  it('内部空白按非法字符处理', () => {
    expect(parseIntInRadix('ff ff', 16)).toEqual({ status: 'invalid', index: 2, char: ' ' })
  })
})

describe('格式化输出', () => {
  it('2/8/10/16 各进制（小写为默认）', () => {
    expect(formatBigInt(255n, { radix: 2 })).toBe('11111111')
    expect(formatBigInt(255n, { radix: 8 })).toBe('377')
    expect(formatBigInt(255n, { radix: 10 })).toBe('255')
    expect(formatBigInt(255n, { radix: 16 })).toBe('ff')
  })

  it('大写开关只影响数字字母，不影响十进制', () => {
    expect(formatBigInt(255n, { radix: 16, uppercase: true })).toBe('FF')
    expect(formatBigInt(255n, { radix: 10, uppercase: true })).toBe('255')
    expect(formatBigInt(35n, { radix: 36, uppercase: true })).toBe('Z')
  })

  it('前缀记法仅对 2/8/16 生效，且保持小写', () => {
    expect(formatBigInt(10n, { radix: 2, prefix: true })).toBe('0b1010')
    expect(formatBigInt(15n, { radix: 8, prefix: true })).toBe('0o17')
    expect(formatBigInt(255n, { radix: 16, prefix: true })).toBe('0xff')
    expect(formatBigInt(255n, { radix: 16, prefix: true, uppercase: true })).toBe('0xFF')
    expect(formatBigInt(255n, { radix: 10, prefix: true })).toBe('255')
    expect(formatBigInt(35n, { radix: 36, prefix: true })).toBe('z')
  })

  it('负数带符号输出', () => {
    expect(formatBigInt(-255n, { radix: 16 })).toBe('-ff')
    expect(formatBigInt(-255n, { radix: 16, prefix: true })).toBe('-0xff')
    expect(formatBigInt(-10n, { radix: 2, prefix: true })).toBe('-0b1010')
  })

  it('零：0b0 形态', () => {
    expect(formatBigInt(0n, { radix: 2, prefix: true })).toBe('0b0')
    expect(formatBigInt(0n, { radix: 16, uppercase: true, prefix: true })).toBe('0x0')
  })

  it('自定义基数：36 / 7 / 2', () => {
    expect(formatBigInt(35n, { radix: 36 })).toBe('z')
    expect(formatBigInt(255n, { radix: 36 })).toBe('73')
    expect(formatBigInt(1295n, { radix: 36 })).toBe('zz')
    expect(formatBigInt(50n, { radix: 7 })).toBe('101')
    expect(formatBigInt(12345n, { radix: 7 })).toBe('50664')
    expect(formatBigInt(TWO_POW_64_PLUS_1, { radix: 2 })).toBe(
      '1' + '0'.repeat(63) + '1',
    )
  })

  it('越界基数抛出 RangeError', () => {
    expect(() => formatBigInt(1n, { radix: 1 })).toThrow(RangeError)
    expect(() => formatBigInt(1n, { radix: 37 })).toThrow(RangeError)
  })
})

describe('formatAll：五个字段的字段级规则', () => {
  const KEYS: FieldKey[] = ['bin', 'oct', 'dec', 'hex', 'custom']

  it('字段键集合固定', () => {
    expect(Object.keys(formatAll(0n, { uppercase: false, prefix: false, customRadix: 36 })).sort())
      .toEqual([...KEYS].sort())
    expect(FIELD_RADIXES).toEqual({ bin: 2, oct: 8, dec: 10, hex: 16 })
  })

  it('前缀开关联动所有适用字段；自定义进制与十进制不出现前缀', () => {
    const out = formatAll(255n, { uppercase: false, prefix: true, customRadix: 36 })
    expect(out.bin).toBe('0b11111111')
    expect(out.oct).toBe('0o377')
    expect(out.dec).toBe('255')
    expect(out.hex).toBe('0xff')
    expect(out.custom).toBe('73')
  })

  it('自定义进制即使基数为 2/8/16 也不加前缀', () => {
    const out = formatAll(5n, { uppercase: false, prefix: true, customRadix: 2 })
    expect(out.bin).toBe('0b101')
    expect(out.custom).toBe('101')
    const out16 = formatAll(255n, { uppercase: false, prefix: true, customRadix: 16 })
    expect(out16.custom).toBe('ff')
  })

  it('大写开关联动十六进制与自定义进制字母', () => {
    const out = formatAll(35n, { uppercase: true, prefix: false, customRadix: 36 })
    expect(out.hex).toBe('23')
    expect(out.custom).toBe('Z')
  })
})

describe('BigInt 大数无损（外部真值）', () => {
  it('十进制 123456789012345678901234567890 解析', () => {
    expect(parseIntInRadix(HUGE_DEC, 10)).toEqual({ status: 'ok', value: HUGE })
  })

  it('输出到 2/8/16/36 无损', () => {
    expect(formatBigInt(HUGE, { radix: 16 })).toBe(HUGE_HEX)
    expect(formatBigInt(HUGE, { radix: 2 })).toBe(HUGE_BIN)
    expect(formatBigInt(HUGE, { radix: 8 })).toBe(HUGE_OCT)
    expect(formatBigInt(HUGE, { radix: 36 })).toBe(HUGE_B36)
  })

  it('2^64+1 的十六进制为 10000000000000001', () => {
    expect(parseIntInRadix('18446744073709551617', 10)).toEqual({
      status: 'ok',
      value: TWO_POW_64_PLUS_1,
    })
    expect(formatBigInt(TWO_POW_64_PLUS_1, { radix: 16 })).toBe(TWO_POW_64_PLUS_1_HEX)
    expect(formatBigInt(TWO_POW_64_PLUS_1, { radix: 36 })).toBe(TWO_POW_64_PLUS_1_B36)
  })

  it('36 进制大数解析回去无损', () => {
    expect(parseIntInRadix(HUGE_B36, 36)).toEqual({ status: 'ok', value: HUGE })
  })

  it('超出 Number.MAX_SAFE_INTEGER 的带符号大数', () => {
    const v = -9007199254740993n // 2^53+1，Number 无法精确表示
    expect(parseIntInRadix('-9007199254740993', 10)).toEqual({ status: 'ok', value: v })
    expect(formatBigInt(v, { radix: 10 })).toBe('-9007199254740993')
  })
})

describe('往返恒等：解析 → 格式化 → 解析', () => {
  // 确定性伪随机（LCG），避免依赖 Math.random 的不可重复性
  function* pseudoRandomBigInts(count: number): Generator<bigint> {
    let state = 0x2f6e2b1n
    const mask = (1n << 128n) - 1n
    for (let i = 0; i < count; i++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) & mask
      yield state >> 64n
    }
  }

  const samples: bigint[] = [0n, 1n, 2n, 35n, 255n, HUGE, TWO_POW_64_PLUS_1, -255n, -HUGE]
  for (const v of pseudoRandomBigInts(24)) {
    samples.push(v, -v)
  }

  it('任意进制 2–36：plain 形态往返一致', () => {
    for (const v of samples) {
      for (let radix = MIN_RADIX; radix <= MAX_RADIX; radix++) {
        const text = formatBigInt(v, { radix })
        const back = parseIntInRadix(text, radix)
        expect(back.status === 'ok' && back.value === v, `${v} radix=${radix} text=${text}`).toBe(true)
      }
    }
  })

  it('带前缀 + 大写形态：固定 2/8/16 往返一致', () => {
    for (const v of samples) {
      for (const radix of [2, 8, 16] as const) {
        const text = formatBigInt(v, { radix, prefix: true, uppercase: true })
        const back = parseIntInRadix(text, radix)
        expect(back.status === 'ok' && back.value === v, `${v} radix=${radix} text=${text}`).toBe(true)
      }
    }
  })

  it('formatField / formatAll：含自定义进制的字段往返一致', () => {
    for (const v of [0n, 1n, 255n, HUGE]) {
      for (const customRadix of [2, 7, 10, 16, 36] as const) {
        const state = { uppercase: true, prefix: true, customRadix }
        for (const key of ['bin', 'oct', 'dec', 'hex', 'custom'] as const) {
          const text = formatField(v, key, state)
          const radix = key === 'custom' ? customRadix : FIELD_RADIXES[key]
          const back = parseIntInRadix(text, radix)
          expect(
            back.status === 'ok' && back.value === v,
            `${v} key=${key} radix=${radix} text=${text}`,
          ).toBe(true)
        }
      }
    }
  })
})

describe('码点联动', () => {
  it('0x41 → 字符 A', () => {
    expect(codePointOf(0x41n)).toEqual({ kind: 'char', char: 'A', label: 'U+0041' })
  })

  it('0 → 控制区，显示 U+0000 标记', () => {
    expect(codePointOf(0n)).toEqual({ kind: 'control', label: 'U+0000' })
  })

  it('超出 Unicode 范围（0x110000、负数）→ none', () => {
    expect(codePointOf(0x110000n)).toEqual({ kind: 'none' })
    expect(codePointOf(-1n)).toEqual({ kind: 'none' })
    expect(codePointOf(123456789012345678901234567890n)).toEqual({ kind: 'none' })
  })

  it('上边界 0x10FFFF 有效', () => {
    const res = codePointOf(0x10ffffn)
    expect(res.kind).toBe('char')
    expect(res.kind === 'char' && res.label).toBe('U+10FFFF')
  })

  it('C0/C1 控制区与 DEL 显示 U+ 标记', () => {
    expect(codePointOf(0x1fn)).toEqual({ kind: 'control', label: 'U+001F' })
    expect(codePointOf(0x7fn)).toEqual({ kind: 'control', label: 'U+007F' })
    expect(codePointOf(0x80n)).toEqual({ kind: 'control', label: 'U+0080' })
    expect(codePointOf(0x9fn)).toEqual({ kind: 'control', label: 'U+009F' })
  })

  it('0x20 起为可打印（含空格）', () => {
    expect(codePointOf(0x20n)).toEqual({ kind: 'char', char: ' ', label: 'U+0020' })
    expect(codePointOf(0x7en)).toEqual({ kind: 'char', char: '~', label: 'U+007E' })
  })

  it('码点联动的 label 用大写十六进制、至少 4 位', () => {
    const res = codePointOf(0xaan)
    expect(res.kind === 'char' && res.label).toBe('U+00AA')
  })

  it('增补平面字符按单个码点取字符', () => {
    const res = codePointOf(0x1f600n)
    expect(res.kind).toBe('char')
    expect(res.kind === 'char' && res.char).toBe('😀')
    expect(res.kind === 'char' && res.label).toBe('U+1F600')
  })
})
