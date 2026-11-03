/**
 * 位视图纯逻辑（零第三方依赖，不依赖 Vue / DOM）。
 *
 * 术语见 CONTEXT.md「位视图 (Bit View)」：进制转换工具中整数的位级呈现区块——
 * 固定位宽（8/16/32）的位格、有符号/无符号补码双解读、大端/小端字节序对照。
 * 补零是位宽选择的自然结果，不是独立开关。
 *
 * 语义口径：
 * - 负数按补码解读（BigInt.asIntN / asUintN 于指定位宽）；
 * - 超出位宽可表达范围（有符号 −2^(w−1)…2^(w−1)−1 与无符号 0…2^w−1 的并集之外）
 *   → 范围错误，调用方只错该区块（非法输入只错该处，其余保留旧值/旧结果）；
 * - 字节序展示按位宽整字节的内存序：大端 = 高字节在前，小端 = 低字节在前。
 */

/** 位宽档位。 */
export const BIT_WIDTHS = [8, 16, 32] as const
export type BitWidth = (typeof BIT_WIDTHS)[number]
export const DEFAULT_BIT_WIDTH: BitWidth = 8

export function isBitWidth(value: number): value is BitWidth {
  return (BIT_WIDTHS as readonly number[]).includes(value)
}

export interface BitView {
  /** 位宽（补零长度即位宽） */
  width: BitWidth
  /** 位格：MSB → LSB，每项 0/1 */
  bits: number[]
  /** 补码双解读：有符号 / 无符号 */
  signed: bigint
  unsigned: bigint
  /** 字节序行：十六进制字节对（大端 / 小端） */
  bytesBE: string[]
  bytesLE: string[]
}

export type BitViewResult = { ok: true; view: BitView } | { ok: false }

const byteHex = (byte: number): string => byte.toString(16).toUpperCase().padStart(2, '0')

/**
 * 整数在指定位宽下的位视图。
 * 超出该位宽可表达范围（如 8 位下输入 300）→ { ok: false }——
 * 错误定位到位视图区块，其余联动（各进制字段）不受影响。
 */
export function bitView(value: bigint, width: BitWidth): BitViewResult {
  const bitsCount = BigInt(width)
  const minSigned = -(1n << (bitsCount - 1n))
  const maxUnsigned = (1n << bitsCount) - 1n
  if (value < minSigned || value > maxUnsigned) return { ok: false }

  const unsigned = BigInt.asUintN(width, value)
  const signed = BigInt.asIntN(width, value)

  const bits: number[] = []
  for (let i = width - 1; i >= 0; i--) bits.push(Number((unsigned >> BigInt(i)) & 1n))

  const byteCount = width / 8
  const bytesBE: string[] = []
  for (let i = byteCount - 1; i >= 0; i--) {
    bytesBE.push(byteHex(Number((unsigned >> BigInt(i * 8)) & 0xffn)))
  }
  const bytesLE = [...bytesBE].reverse()

  return { ok: true, view: { width, bits, signed, unsigned, bytesBE, bytesLE } }
}
