import { describe, expect, it } from 'vitest'
import { BIT_WIDTHS, DEFAULT_BIT_WIDTH, bitView, isBitWidth } from './bitview'
import type { BitWidth } from './bitview'

function viewOf(value: bigint, width: BitWidth) {
  const res = bitView(value, width)
  if (!res.ok) throw new Error(`expected ok for ${value} @${width}bit`)
  return res.view
}

/* ---------- 位格与补码解读 ---------- */

describe('bitView：位格与补码双解读', () => {
  it('-1 在 8 位：位格全 1，双解读 (-1, 255)（验收）', () => {
    const v = viewOf(-1n, 8)
    expect(v.bits).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(v.signed).toBe(-1n)
    expect(v.unsigned).toBe(255n)
  })

  it('255 在 8 位：有符号 -1 / 无符号 255 对照（验收）', () => {
    const v = viewOf(255n, 8)
    expect(v.bits).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(v.signed).toBe(-1n)
    expect(v.unsigned).toBe(255n)
  })

  it('127 / 128 边界：有符号极值与负数区起点', () => {
    expect(viewOf(127n, 8).signed).toBe(127n)
    expect(viewOf(127n, 8).unsigned).toBe(127n)
    expect(viewOf(-128n, 8).signed).toBe(-128n)
    expect(viewOf(-128n, 8).unsigned).toBe(128n)
    expect(viewOf(-128n, 8).bits).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
  })

  it('5 在 8 位：00000101（固定位宽补零是位宽选择的自然结果）', () => {
    expect(viewOf(5n, 8).bits).toEqual([0, 0, 0, 0, 0, 1, 0, 1])
  })

  it('0 → 全 0 位格、双解读 (0, 0)', () => {
    const v = viewOf(0n, 8)
    expect(v.bits).toEqual(new Array(8).fill(0))
    expect(v.signed).toBe(0n)
    expect(v.unsigned).toBe(0n)
  })
})

/* ---------- 位宽切换补零联动 ---------- */

describe('位宽切换（8/16/32，补零联动）', () => {
  it('同一数值升宽补零：5 在 16 位 = 0000000000000101', () => {
    const v = viewOf(5n, 16)
    expect(v.bits).toHaveLength(16)
    expect(v.bits).toEqual([...new Array(12).fill(0), 0, 1, 0, 1])
    expect(viewOf(5n, 32).bits).toHaveLength(32)
  })

  it('255 在 16 位：高位补零，双解读变为 (255, 255)', () => {
    const v = viewOf(255n, 16)
    expect(v.signed).toBe(255n)
    expect(v.unsigned).toBe(255n)
    expect(v.bits.slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(v.bits.slice(8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('16 / 32 位有符号边界：-32768 / 32767、-2147483648 / 2147483647', () => {
    expect(viewOf(-32768n, 16).signed).toBe(-32768n)
    expect(viewOf(32767n, 16).signed).toBe(32767n)
    expect(viewOf(-2147483648n, 32).signed).toBe(-2147483648n)
    expect(viewOf(2147483647n, 32).signed).toBe(2147483647n)
  })
})

/* ---------- 字节序 ---------- */

describe('字节序行（大端 / 小端 hex 对照）', () => {
  it('0x12345678 在 32 位：大端 12 34 56 78 / 小端 78 56 34 12（验收）', () => {
    const v = viewOf(0x12345678n, 32)
    expect(v.bytesBE).toEqual(['12', '34', '56', '78'])
    expect(v.bytesLE).toEqual(['78', '56', '34', '12'])
  })

  it('0x00ff 在 16 位：大端 00 FF / 小端 FF 00（补零进入字节行）', () => {
    const v = viewOf(0xffn, 16)
    expect(v.bytesBE).toEqual(['00', 'FF'])
    expect(v.bytesLE).toEqual(['FF', '00'])
  })

  it('单字节宽度：大端与小端一致', () => {
    const v = viewOf(0xabn, 8)
    expect(v.bytesBE).toEqual(['AB'])
    expect(v.bytesLE).toEqual(['AB'])
  })

  it('负值按补码取字节：-2 在 16 位 = 0xFFFE → BE FF FE / LE FE FF', () => {
    const v = viewOf(-2n, 16)
    expect(v.bytesBE).toEqual(['FF', 'FE'])
    expect(v.bytesLE).toEqual(['FE', 'FF'])
  })

  it('字节行用大写两位十六进制', () => {
    const v = viewOf(0x0fn, 8)
    expect(v.bytesBE[0]).toBe('0F')
  })
})

/* ---------- 范围错误定位 ---------- */

describe('范围错误（只错位视图区块）', () => {
  it('8 位下 300 → { ok: false }（验收）', () => {
    expect(bitView(300n, 8)).toEqual({ ok: false })
  })

  it('各宽度上下界外的值都报错：8 位 ±256 级、16 位 ±65536 级、32 位 ±2^32 级', () => {
    expect(bitView(256n, 8).ok).toBe(false)
    expect(bitView(-129n, 8).ok).toBe(false) // 有符号下界 −128 之外
    expect(bitView(65536n, 16).ok).toBe(false)
    expect(bitView(-32769n, 16).ok).toBe(false)
    expect(bitView(4294967296n, 32).ok).toBe(false)
    expect(bitView(-2147483649n, 32).ok).toBe(false)
  })

  it('超出 32 位的 BigInt 大数 → { ok: false }', () => {
    expect(bitView(123456789012345678901234567890n, 32).ok).toBe(false)
    expect(bitView(-123456789012345678901234567890n, 32).ok).toBe(false)
  })

  it('边界值恰好合法：-128/255 @8、-32768/65535 @16、-2^31/2^32-1 @32', () => {
    expect(bitView(-128n, 8).ok).toBe(true)
    expect(bitView(255n, 8).ok).toBe(true)
    expect(bitView(-32768n, 16).ok).toBe(true)
    expect(bitView(65535n, 16).ok).toBe(true)
    expect(bitView(-2147483648n, 32).ok).toBe(true)
    expect(bitView(4294967295n, 32).ok).toBe(true)
  })
})

/* ---------- 档位常量 ---------- */

describe('位宽档位', () => {
  it('档位固定 8/16/32，默认 8', () => {
    expect([...BIT_WIDTHS]).toEqual([8, 16, 32])
    expect(DEFAULT_BIT_WIDTH).toBe(8)
    expect(isBitWidth(8)).toBe(true)
    expect(isBitWidth(64)).toBe(false)
  })
})
