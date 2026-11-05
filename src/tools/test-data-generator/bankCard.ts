/**
 * 假银行卡号生成（结构真实口径，见 CONTEXT.md：结构真实）。
 *
 * Luhn 合法 + 主流测试 BIN 段（16 / 19 位）。BIN 选自银联（CUP）62 开头的
 * 借记卡公开常用段：622202（工商银行）、621700（建设银行）、622260（银联）、
 * 622846 / 622848 / 622849（农业银行）——均为测试数据样例中广泛引用的公开 BIN，
 * 仅保证「前缀 ∈ 测试 BIN 集」的结构校验可过，不指向任何真实账户。
 */

import type { Rng } from './rng'

/** 测试 BIN 前缀集（6 位，CUP 62 段公开常用借记卡 BIN）。 */
export const BANK_BIN_PREFIXES: readonly string[] = [
  '622202',
  '621700',
  '622260',
  '622846',
  '622848',
  '622849',
]

/** 卡号长度：16 位或 19 位（规格 §1）。 */
export const BANK_CARD_LENGTHS = [16, 19] as const

/** Luhn 校验：从右往左，奇偶位翻倍求和 ≡ 0 (mod 10)；空串非法。 */
export function isLuhnValid(digits: string): boolean {
  if (digits.length === 0) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    const d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    let v = d
    if (double) {
      v *= 2
      if (v > 9) v -= 9
    }
    sum += v
    double = !double
  }
  return sum % 10 === 0
}

function randomInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1))
}

/** 生成一个 Luhn 合法、前缀 ∈ 测试 BIN 集的假卡号（16 或 19 位）。 */
export function generateBankCard(rng: Rng): string {
  const bin = BANK_BIN_PREFIXES[Math.floor(rng() * BANK_BIN_PREFIXES.length)]!
  const length = BANK_CARD_LENGTHS[Math.floor(rng() * BANK_CARD_LENGTHS.length)]!
  // body = BIN + 随机位（留最后 1 位给 Luhn 校验位）
  let body = bin
  while (body.length < length - 1) {
    body += String(randomInt(rng, 0, 9))
  }
  // 校验位：使整体 Luhn 成立。从 body 计算期望和，选出补足的末位。
  let sum = 0
  let double = true // 末位（校验位）处于倍位
  for (let i = body.length - 1; i >= 0; i--) {
    let v = body.charCodeAt(i) - 48
    if (double) {
      v *= 2
      if (v > 9) v -= 9
    }
    sum += v
    double = !double
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return `${body}${checkDigit}`
}
