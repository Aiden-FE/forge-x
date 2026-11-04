/**
 * IPv6 子网计算纯逻辑模块（0 依赖，BigInt 自实现 128 位运算）。
 *
 * 术语与口径见 CONTEXT.md 与票据 06（Answer 为锁定规格）：
 * - 输入归一化：单输入自动识别——`addr/prefix` 主形态、裸地址补 /128、
 *   主机位归一化 + isHostAddress 标注（不拒绝、不静默吞掉差异）；
 *   IPv6 无点分掩码形态（文案明示）；IPv4 内嵌尾段（`::ffff:1.2.3.4`）收，
 *   解析后统一。
 * - 输出口径 RFC 5952：小写、去前导零、`::` 压缩最长零串（≥ 2 组）、
 *   等长取先、不保留 IPv4 尾段写法。
 * - 输出件套：网络地址、前缀、总容量 2^(128-p)（BigInt 千分位）、
 *   首/末地址（无 broadcast/usable 扣减语义——首末是区间端点，说明行明示口径差异）、
 *   二进制行（16 位 × 8 组点分）、scope 六类判定；
 *   /64 SLAAC 与 /127 RFC 6164 仅注记不特判（界面层按前缀显示注记文案）。
 * - 错误语义（平台约定「非法输入只错该处」的段级特化）：组非十六进制 vs
 *   组超界（> ffff）vs 结构非法（组数不符 / 多个 ::）vs 前缀超界（> 128）vs
 *   IPv4 尾段非法 vs 输入段数不符分别提示；界面在错误时保留上一次结果。
 */

// ---- 常量 ----

/** 2^128 - 1（全 1 掩码基） */
const IPV6_ALL = (1n << 128n) - 1n

// ---- 错误结构（数据化，文案由 Vue 层渲染） ----

export type Ipv6Segment =
  | 'group1'
  | 'group2'
  | 'group3'
  | 'group4'
  | 'group5'
  | 'group6'
  | 'group7'
  | 'group8'
  | 'address'
  | 'v4tail'
  | 'prefix'
  | 'format'

export type Ipv6ErrorKind =
  | 'groupFormat' // 组含非十六进制字符
  | 'groupRange' // 组 > ffff（超过 4 位十六进制）
  | 'addrFormat' // 结构非法（组数不符 / 多个 :: / 空组等）
  | 'v4tailFormat' // IPv4 尾段不是合法点分四段
  | 'prefixFormat' // 前缀非数字
  | 'prefixRange' // 前缀 > 128
  | 'fieldCount' // 输入段数不符（IPv6 无点分掩码形态）

export interface Ipv6Error {
  kind: Ipv6ErrorKind
  segment: Ipv6Segment
  /** 越界数值 / 非法原文，供文案插值 */
  value?: string
  max?: number
}

export type Ipv6ParseResult<T> = { ok: true; value: T } | { ok: false; error: Ipv6Error }

const GROUP_SEGMENTS: readonly Ipv6Segment[] = [
  'group1',
  'group2',
  'group3',
  'group4',
  'group5',
  'group6',
  'group7',
  'group8',
]

// ---- 解析 ----

/** 组段合法性：1–4 位十六进制。 */
const HEX_GROUP_RE = /^[0-9a-fA-F]{1,4}$/

/** IPv4 尾段（点分四段）→ 32 位数值；不合法返回 null。 */
function parseIpv4Tail(text: string): number | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  let v = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    v = v * 256 + n
  }
  return v
}

/**
 * IPv6 地址解析（BigInt 128 位）。
 * 支持：完整 8 组、`::` 压缩（至多一处）、IPv4 内嵌尾段（最末冒号后为点分四段）。
 * 错误定位到组（按书写顺序第 N 组）或结构级（address）。
 */
export function parseIpv6Address(text: string): Ipv6ParseResult<bigint> {
  if (text === '') {
    return { ok: false, error: { kind: 'addrFormat', segment: 'address', value: text } }
  }

  // IPv4 内嵌尾段：剥出点分四段，占位为末两组 0，解析后按位或回去
  let v4Tail = 0n
  let body = text
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':')
    if (lastColon < 0) {
      // 纯 IPv4 文本不是 IPv6 地址
      return { ok: false, error: { kind: 'addrFormat', segment: 'address', value: text } }
    }
    const tailText = text.slice(lastColon + 1)
    const tail = parseIpv4Tail(tailText)
    if (tail === null) {
      return { ok: false, error: { kind: 'v4tailFormat', segment: 'v4tail', value: tailText } }
    }
    v4Tail = BigInt(tail)
    body = `${text.slice(0, lastColon + 1)}0:0`
  }

  // `::` 分割（至多一处）
  const sections = body.split('::')
  if (sections.length > 2) {
    return { ok: false, error: { kind: 'addrFormat', segment: 'address', value: text } }
  }
  const hasEllipsis = sections.length === 2
  const leftStr = sections[0] ?? ''
  const rightStr = hasEllipsis ? (sections[1] ?? '') : leftStr

  // 显式组收集（书写顺序，用于组级错误定位）
  const explicit: { text: string; index: number }[] = []
  let cursor = 0
  const collect = (str: string): Ipv6Error | null => {
    if (str === '') return null
    const parts = str.split(':')
    for (const part of parts) {
      cursor++
      if (part === '') {
        // 空组：结构非法（如 `:::` 或 `:1:2::` 的边界多余冒号）
        return { kind: 'addrFormat', segment: 'address', value: text }
      }
      explicit.push({ text: part, index: cursor })
    }
    return null
  }
  const leftErr = collect(leftStr)
  if (leftErr) return { ok: false, error: leftErr }
  const leftCount = explicit.length
  if (hasEllipsis) {
    const rightErr = collect(rightStr)
    if (rightErr) return { ok: false, error: rightErr }
  }

  // 组值转换 + 组级错误定位
  const values: number[] = []
  for (const g of explicit) {
    if (!HEX_GROUP_RE.test(g.text)) {
      if (/^[0-9a-fA-F]+$/.test(g.text)) {
        return {
          ok: false,
          error: { kind: 'groupRange', segment: GROUP_SEGMENTS[g.index - 1] ?? 'address', value: g.text, max: 0xffff },
        }
      }
      return {
        ok: false,
        error: { kind: 'groupFormat', segment: GROUP_SEGMENTS[g.index - 1] ?? 'address', value: g.text },
      }
    }
    values.push(parseInt(g.text, 16))
  }

  // 组数检查
  if (hasEllipsis) {
    if (values.length > 7) {
      // `::` 无组可压缩
      return { ok: false, error: { kind: 'addrFormat', segment: 'address', value: text } }
    }
  } else if (values.length !== 8) {
    return { ok: false, error: { kind: 'addrFormat', segment: 'address', value: text } }
  }

  // 展开为零填充的 8 组：左组 + 零填充 + 右组
  const groups: number[] = values.slice(0, leftCount)
  const rightCount = values.length - leftCount
  while (groups.length < 8 - rightCount) groups.push(0)
  groups.push(...values.slice(leftCount))

  let value = 0n
  for (const g of groups) value = (value << 16n) | BigInt(g)
  return { ok: true, value: (value | v4Tail) & IPV6_ALL }
}

/** 前缀长度解析：0–128 整数。 */
export function parseIpv6Prefix(text: string): Ipv6ParseResult<number> {
  if (!/^\d{1,3}$/.test(text)) {
    return { ok: false, error: { kind: 'prefixFormat', segment: 'prefix', value: text } }
  }
  const prefix = Number(text)
  if (prefix > 128) {
    return { ok: false, error: { kind: 'prefixRange', segment: 'prefix', value: text, max: 128 } }
  }
  return { ok: true, value: prefix }
}

/**
 * 单输入框自动识别（镜像 ipv4-subnet）：CIDR `addr/prefix` 主形态；
 * 裸地址自动补 /128（主机地址视角）。主机位非零 → isHostAddress 标注。
 * IPv6 无点分掩码形态：多段输入报 fieldCount（文案明示）。
 */
export type Ipv6InputResult =
  | { status: 'empty' }
  | { status: 'error'; error: Ipv6Error }
  | { status: 'ok'; value: bigint; prefix: number; isHostAddress: boolean }

export function parseIpv6Input(input: string): Ipv6InputResult {
  const text = input.trim()
  if (text === '') return { status: 'empty' }

  const tokens = text.split(/\s+/)
  if (tokens.length > 1) {
    return { status: 'error', error: { kind: 'fieldCount', segment: 'format', value: String(tokens.length) } }
  }

  const first = tokens[0] as string
  let addrText = first
  let prefixText: string | null = null
  const slash = first.indexOf('/')
  if (slash >= 0) {
    addrText = first.slice(0, slash)
    prefixText = first.slice(slash + 1)
  }

  const addr = parseIpv6Address(addrText)
  if (!addr.ok) return { status: 'error', error: addr.error }

  let prefix: number
  if (prefixText !== null) {
    const p = parseIpv6Prefix(prefixText)
    if (!p.ok) return { status: 'error', error: p.error }
    prefix = p.value
  } else {
    prefix = 128
  }

  const wildcard = IPV6_ALL ^ prefixMask(prefix)
  const isHostAddress = (addr.value & wildcard) !== 0n
  return { status: 'ok', value: addr.value, prefix, isHostAddress }
}

// ---- 计算 ----

export type Ipv6Scope =
  | 'loopback' // ::1
  | 'unspecified' // ::
  | 'linkLocal' // fe80::/10
  | 'ula' // fc00::/7
  | 'multicast' // ff00::/8
  | 'global' // 2000::/3
  | 'other' // 六类之外的兜底（如 IPv4-mapped ::ffff:0:0/96），如实呈现

/** 前缀长度 → 连续 128 位掩码。 */
export function prefixMask(prefix: number): bigint {
  if (prefix === 0) return 0n
  return IPV6_ALL ^ ((1n << BigInt(128 - prefix)) - 1n)
}

/**
 * scope 六类判定（按网络地址判定，镜像 ipv4-subnet 的 label 口径）：
 * `::1` loopback、`::` unspecified、fe80::/10 link-local、fc00::/7 ULA、
 * ff00::/8 multicast、2000::/3 global；六类之外（如 IPv4-mapped）如实标 other。
 */
export function classifyIpv6(value: bigint): Ipv6Scope {
  if (value === 1n) return 'loopback'
  if (value === 0n) return 'unspecified'
  if ((value >> 118n) === 0x3fan) return 'linkLocal' // fe80::/10 = 1111111010
  if ((value >> 121n) === 0x7en) return 'ula' // fc00::/7 = 1111110
  if ((value >> 120n) === 0xffn) return 'multicast' // ff00::/8
  if ((value >> 125n) === 1n) return 'global' // 2000::/3 = 001
  return 'other'
}

export interface Ipv6Info {
  /** 网络地址（输入已归一化） */
  network: bigint
  prefix: number
  /** 地址总数 2^(128-p)（BigInt，/0 为 2^128） */
  total: bigint
  /** 首地址 = 网络地址（无 IPv4 式 network+1 扣减） */
  first: bigint
  /** 末地址 = 网络地址 | 通配（无 broadcast/usable 扣减语义） */
  last: bigint
  /** 输入为主机地址（已归一化到网络地址） */
  isHostAddress: boolean
  scope: Ipv6Scope
}

/** 由地址与前缀长度计算全部件套（analyze 与切分共用的核心）。 */
export function computeIpv6Subnet(value: bigint, prefix: number): Ipv6Info {
  const mask = prefixMask(prefix)
  const wildcard = IPV6_ALL ^ mask
  const network = value & mask
  return {
    network,
    prefix,
    total: 1n << BigInt(128 - prefix),
    first: network,
    last: network | wildcard,
    isHostAddress: false,
    scope: classifyIpv6(network),
  }
}

/** 解析并计算件套；输入为主机地址时归一化到网络地址。 */
export type Ipv6AnalyzeResult =
  | { status: 'empty' }
  | { status: 'error'; error: Ipv6Error }
  | { status: 'ok'; info: Ipv6Info }

export function analyzeIpv6(input: string): Ipv6AnalyzeResult {
  const parsed = parseIpv6Input(input)
  if (parsed.status !== 'ok') return parsed
  const info = computeIpv6Subnet(parsed.value, parsed.prefix)
  info.isHostAddress = parsed.isHostAddress
  return { status: 'ok', info }
}

// ---- 格式化 ----

/**
 * RFC 5952 归一化输出：小写、去前导零、`::` 压缩最长零串（≥ 2 组）、
 * 等长取先、不保留 IPv4 尾段写法（解析后统一为十六进制组）。
 */
export function formatIpv6(value: bigint): string {
  const groups: number[] = []
  let v = value
  for (let i = 7; i >= 0; i--) {
    groups[i] = Number(v & 0xffffn)
    v >>= 16n
  }
  // 最长零串（≥ 2 组）；等长取先（严格大于保留首个）
  let bestStart = -1
  let bestLen = 0
  let i = 0
  while (i < 8) {
    if (groups[i] === 0) {
      let j = i
      while (j < 8 && groups[j] === 0) j++
      if (j - i > bestLen) {
        bestLen = j - i
        bestStart = i
      }
      i = j
    } else {
      i++
    }
  }
  if (bestLen < 2) return groups.map((g) => g.toString(16)).join(':')
  const left = groups.slice(0, bestStart).map((g) => g.toString(16))
  const right = groups.slice(bestStart + bestLen).map((g) => g.toString(16))
  return `${left.join(':')}::${right.join(':')}`
}

export function formatIpv6Cidr(value: bigint, prefix: number): string {
  return `${formatIpv6(value)}/${prefix}`
}

/** 二进制行：16 位 × 8 组点分（调试分类身份）。 */
export function formatBinaryIpv6(value: bigint): string {
  const parts: string[] = []
  for (let i = 7; i >= 0; i--) {
    const g = Number((value >> BigInt(i * 16)) & 0xffffn)
    parts.push(g.toString(2).padStart(16, '0'))
  }
  return parts.join('.')
}

/** BigInt 千分位（/0 总容量 2^128 不丢精度）。 */
export function formatBigInt(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// ---- 等分切分（Equal Split，2 的幂均分；与 ipv4-subnet 同构；VLSM 不做） ----

export const IPV6_SPLIT_COUNT_OPTIONS: readonly number[] = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]
/** 切分行数上限：超出提示改用更大前缀。 */
export const IPV6_SPLIT_ROW_LIMIT = 1024

export interface Ipv6SplitRow {
  cidr: string
  network: bigint
  /** 首/末地址：区间端点（无扣减语义） */
  first: bigint
  last: bigint
  /** 总容量 2^(128-新前缀) */
  total: bigint
}

export type Ipv6SplitResult =
  | { ok: true; rows: Ipv6SplitRow[]; newPrefix: number }
  | { ok: false; reason: 'tooManySubnets' | 'notPowerOfTwo' | 'invalidTarget' }

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0
}

/**
 * 等分切分：按目标子网数（2 的幂）或目标前缀长均分为等长前缀子网。
 * 行数上限 1024（2^(新前缀-父前缀) ≤ 1024 且新前缀 ≤ 128）。
 * 断言口径：结果首尾相接、无缝隙无重叠恰好覆盖父网。
 */
export function equalSplitIpv6(
  network: bigint,
  prefix: number,
  target: { count: number } | { newPrefix: number },
): Ipv6SplitResult {
  let newPrefix: number
  if ('count' in target) {
    if (!isPowerOfTwo(target.count) || target.count < 2) return { ok: false, reason: 'notPowerOfTwo' }
    newPrefix = prefix + Math.log2(target.count)
  } else {
    if (!Number.isInteger(target.newPrefix) || target.newPrefix <= prefix) {
      return { ok: false, reason: 'invalidTarget' }
    }
    newPrefix = target.newPrefix
  }
  if (newPrefix > 128 || 2 ** (newPrefix - prefix) > IPV6_SPLIT_ROW_LIMIT) {
    return { ok: false, reason: 'tooManySubnets' }
  }

  const parent = computeIpv6Subnet(network, prefix)
  const step = 1n << BigInt(128 - newPrefix)
  const rowCount = 2 ** (newPrefix - prefix)
  const rows: Ipv6SplitRow[] = []
  for (let i = 0; i < rowCount; i++) {
    const net = parent.network + BigInt(i) * step
    rows.push({
      cidr: formatIpv6Cidr(net, newPrefix),
      network: net,
      first: net,
      last: net + step - 1n,
      total: step,
    })
  }
  return { ok: true, rows, newPrefix }
}
