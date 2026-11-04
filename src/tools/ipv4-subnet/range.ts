/**
 * IPv4 区间反推 CIDR 纯逻辑模块（0 依赖，纯位运算扩展，票据 06 交付物 B）。
 *
 * 术语与口径见 CONTEXT.md「精确覆盖 (Exact Cover)」：
 * - 主输出**精确覆盖 CIDR 列表**：恰好覆盖起止区间——并集 = 区间、条目互不重叠；
 *   IPv4 上限 62 行（天然有界，无需行数上限开关）。
 * - 辅输出 it-tools 同款**最小包含 CIDR**：单条扩张到能装下区间的最小前缀，
 *   仅作对照（含原区间/包含区间尺寸对比）。
 * _Avoid_: 最小区间合并（两口径混称时必须带「精确覆盖 / 最小包含」限定）。
 *
 * 行为升级（相对 it-tools）：起 > 止显式报错（it-tools 返 undefined）；
 * 单地址区间 → /32 单行；全空间（0.0.0.0–255.255.255.255）→ /0 单行。
 *
 * 错误语义（平台约定「非法输入只错该处」的字段级特化）：起/止各自报错
 * （field: 'start' / 'end'），起 > 止单独报（field: 'order'）；错误时界面保留上一次结果。
 * 只填一侧视为未完成（不出结果、不报错）。
 */

import { formatCidr, parseDottedQuad, prefixToMask } from './subnet'

// ---- 类型 ----

export type RangeField = 'start' | 'end' | 'order'

export interface RangeError {
  field: RangeField
  kind: 'invalid' | 'order'
  /** 非法原文，供文案插值 */
  value?: string
}

export interface RangeCidrRow {
  cidr: string
  networkU32: number
  prefix: number
  /** 首地址（区间端点，无扣减语义） */
  firstU32: number
  lastU32: number
  /** 地址总数（2 的幂，≤ 2^32，double 精确） */
  total: number
}

export interface RangeContaining {
  cidr: string
  networkU32: number
  prefix: number
  firstU32: number
  lastU32: number
}

export interface RangeExpanderResult {
  /** 精确覆盖 CIDR 列表（并集 = 区间、互不重叠，≤ 62 行） */
  rows: RangeCidrRow[]
  /** 最小包含 CIDR（it-tools 同款单条扩张，对照输出） */
  containing: RangeContaining
  /** 原区间尺寸（end - start + 1） */
  oldSize: number
  /** 包含区间尺寸 2^(32-包含前缀) */
  newSize: number
}

export type RangeAnalyzeResult =
  | { status: 'empty' }
  | { status: 'error'; error: RangeError }
  | { status: 'ok'; result: RangeExpanderResult }

// ---- 纯位串辅助（复用 subnet.ts 既有风格，纯位运算） ----

/** 数值（0 或 2 的幂 ≤ 2^32）→ 前缀长度。 */
function sizeToPrefix(size: number): number {
  return 32 - Math.log2(size)
}

/**
 * 最大对齐块：起点为 0 时任意对齐（2^32），否则为整除起点的最大 2 的幂
 * （即块边界不越过起点的最低置位位）。
 */
function maxAlignedSize(n: number): number {
  if (n === 0) return 2 ** 32
  let p = 1
  while (n % (p * 2) === 0) p *= 2
  return p
}

// ---- 精确覆盖 CIDR 列表（主输出） ----

/**
 * 贪心算法：每步取「不越过起点对齐」与「不越过终点」约束下的最大块，
 * 天然产出首尾相接、互不重叠、恰好覆盖区间的 CIDR 列表（IPv4 ≤ 62 行）。
 */
export function cidrsForRange(startU32: number, endU32: number): RangeCidrRow[] {
  const rows: RangeCidrRow[] = []
  let cur = startU32
  while (cur <= endU32) {
    const remaining = endU32 - cur + 1
    const size = Math.min(maxAlignedSize(cur), 2 ** Math.floor(Math.log2(remaining)))
    const prefix = sizeToPrefix(size)
    rows.push({
      cidr: formatCidr(cur >>> 0, prefix),
      networkU32: cur >>> 0,
      prefix,
      firstU32: cur >>> 0,
      lastU32: (cur + size - 1) >>> 0,
      total: size,
    })
    cur += size
  }
  return rows
}

// ---- 最小包含 CIDR（辅输出，it-tools 同款） ----

/**
 * 从 /32 逐级扩张，直到单一 CIDR 同时包含起止两地址（it-tools 同款语义）。
 * 全空间 → /0；单地址 → /32。
 */
export function smallestContainingCidr(startU32: number, endU32: number): RangeContaining {
  let prefix = 32
  while (prefix > 0) {
    const mask = prefixToMask(prefix)
    if ((startU32 & mask) === (endU32 & mask)) break
    prefix--
  }
  const mask = prefixToMask(prefix)
  const networkU32 = (startU32 & mask) >>> 0
  return {
    cidr: formatCidr(networkU32, prefix),
    networkU32,
    prefix,
    firstU32: networkU32,
    lastU32: (networkU32 | (~mask >>> 0)) >>> 0,
  }
}

// ---- 入口：起/止两输入 → 双输出 ----

export function analyzeRange(startInput: string, endInput: string): RangeAnalyzeResult {
  const startText = startInput.trim()
  const endText = endInput.trim()
  // 双空或只填一侧：未完成，不出结果不报错
  if (startText === '' || endText === '') return { status: 'empty' }

  const start = parseDottedQuad(startText)
  if (!start.ok) return { status: 'error', error: { field: 'start', kind: 'invalid', value: startText } }
  const end = parseDottedQuad(endText)
  if (!end.ok) return { status: 'error', error: { field: 'end', kind: 'invalid', value: endText } }
  // 起 > 止显式报错（it-tools 返 undefined 的行为升级）
  if (start.u32 > end.u32) return { status: 'error', error: { field: 'order', kind: 'order' } }

  const containing = smallestContainingCidr(start.u32, end.u32)
  return {
    status: 'ok',
    result: {
      rows: cidrsForRange(start.u32, end.u32),
      containing,
      oldSize: end.u32 - start.u32 + 1,
      newSize: 2 ** (32 - containing.prefix),
    },
  }
}
