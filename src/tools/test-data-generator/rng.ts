/**
 * 种子复现随机源（票据 11，见 CONTEXT.md：种子复现）。
 *
 * - mulberry32 从测试工具上位为生产 PRNG：唯一生产随机源，同 seed → 同序列，
 *   0 新依赖（纯函数实现，算法与 generator.spec.ts 既有测试工具逐句相同）；
 * - Math.random 仅剩一个调用点 = deriveRandomSeed（「留空派生初始 seed」与
 *   骰子按钮共用此入口），生成后所用 seed 一律展示，没有不可复现的生成；
 * - 输入形态：十六进制 8 位（32-bit，可带 0x 前缀、大小写不敏感）；展示形态
 *   一律 `0x` + 8 位小写十六进制补零，粘回输入框即可复现。
 */

/**
 * 随机源契约：返回 [0, 1) 均匀浮点。生产与测试统一注入 PRNG（同 seed 同序列）。
 * 归属地说明：契约随「唯一生产随机源」住在 rng.ts（v0.5.0 审查修正——原先
 * 定义在 cnId.ts，rng.ts 反向引用属归属错位）；cnId/bankCard/generator 均从这里取。
 */
export type Rng = () => number

/** seed 展示宽度（32-bit = 8 位十六进制）。 */
export const SEED_HEX_WIDTH = 8

/** 32-bit 上界（不含）。 */
const SEED_LIMIT = 0x1_0000_0000

/** mulberry32：32-bit 种子 → 确定性 [0, 1) 浮点序列。 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 解析 seed 输入：可选 0x/0X 前缀 + 1–8 位十六进制（大小写不敏感，首尾空白容忍）。
 * 非法（空串、十六进制外字符、超 8 位、负数）返回 null；空串是否「留空派生」由调用方判定。
 */
export function parseSeedHex(input: string): number | null {
  const m = input.trim().match(/^(?:0[xX])?([0-9a-fA-F]{1,8})$/)
  return m ? Number.parseInt(m[1]!, 16) : null
}

/**
 * 派生随机 32-bit seed —— 本工具唯一 Math.random 调用点（票据 11 锁定）：
 * seed 留空时内部派生与骰子随机按钮共用此入口，派生结果同样随生成展示可复现。
 */
export function deriveRandomSeed(): number {
  return Math.floor(Math.random() * SEED_LIMIT) >>> 0
}

/** 展示形态：`0x` + 8 位小写十六进制（32-bit 补零）。 */
export function formatSeed(seed: number): string {
  return `0x${(seed >>> 0).toString(16).padStart(SEED_HEX_WIDTH, '0')}`
}
