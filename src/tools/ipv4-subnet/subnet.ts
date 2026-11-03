/**
 * IPv4 子网计算纯逻辑模块（0 依赖，纯位运算）。
 *
 * 术语与口径见 CONTEXT.md：
 * - IPv4 子网计算：仅支持 IPv4（界面明示）；CIDR 与点分掩码双形态输入，
 *   主机地址自动归一化并标注；附带等分切分器；纯本地，不做任何网络请求；
 * - 通配掩码：子网掩码按位取反的结果（ACL 口径），与子网掩码成对展示；
 * - 等分切分：把网络按 2 的幂均分为等长前缀子网，本工具唯一支持的切分形态。
 *
 * 实现约束（规格）：uint32 运算一律用 `>>>` 位运算；主机总数用 2 ** hostBits
 * 的幂运算表示（≤ 2^32，double 精确），不做浮点乘除累积。
 *
 * 错误语义（平台约定「非法输入只错该处」的段级特化）：错误定位到段——
 * IP 段非法（>255 等）vs 前缀超界（>32）vs 掩码非连续（255.0.255.0）分别提示；
 * 界面在错误时保留上一次结果。
 */

// ---- 错误结构（数据化，文案由 Vue 层渲染） ----

export type SubnetSegment = 'octet1' | 'octet2' | 'octet3' | 'octet4' | 'prefix' | 'mask' | 'format'

export type SubnetErrorKind =
  | 'octetFormat' // IP 段含非数字
  | 'octetRange' // IP 段 > 255
  | 'prefixFormat' // 前缀非数字
  | 'prefixRange' // 前缀 > 32
  | 'maskFormat' // 掩码段非法
  | 'maskContiguous' // 掩码非连续（1 序列后必须全 0）
  | 'fieldCount' // 输入段数不符

export interface SubnetError {
  kind: SubnetErrorKind
  segment: SubnetSegment
  /** 越界数值 / 非法原文，供文案插值 */
  value?: string
  max?: number
}

export type ParseResult =
  | { status: 'empty' }
  | { status: 'error'; error: SubnetError }
  | { status: 'ok'; ipU32: number; prefix: number; maskU32: number; isHostAddress: boolean }

// ---- 解析 ----

const OCTET_SEGMENTS: readonly SubnetSegment[] = ['octet1', 'octet2', 'octet3', 'octet4']

/** 点分四段解析：每段 1–3 位十进制 ≤ 255；错误定位到第几段。 */
export function parseDottedQuad(text: string): { ok: true; u32: number } | { ok: false; error: SubnetError } {
  const parts = text.split('.')
  if (parts.length !== 4) {
    return { ok: false, error: { kind: 'octetFormat', segment: 'octet1', value: text } }
  }
  let u32 = 0
  for (let i = 0; i < 4; i++) {
    const part = parts[i] as string
    if (!/^\d{1,3}$/.test(part)) {
      return { ok: false, error: { kind: 'octetFormat', segment: OCTET_SEGMENTS[i] as SubnetSegment, value: part } }
    }
    const value = Number(part)
    if (value > 255) {
      return { ok: false, error: { kind: 'octetRange', segment: OCTET_SEGMENTS[i] as SubnetSegment, value: part, max: 255 } }
    }
    u32 = (u32 * 256 + value) >>> 0
  }
  return { ok: true, u32 }
}

/** 前缀长度解析：0–32 整数。 */
export function parsePrefix(text: string): { ok: true; prefix: number } | { ok: false; error: SubnetError } {
  if (!/^\d{1,3}$/.test(text)) {
    return { ok: false, error: { kind: 'prefixFormat', segment: 'prefix', value: text } }
  }
  const prefix = Number(text)
  if (prefix > 32) {
    return { ok: false, error: { kind: 'prefixRange', segment: 'prefix', value: text, max: 32 } }
  }
  return { ok: true, prefix }
}

/** 点分掩码 → 前缀：段合法 + 连续（1 序列后全 0）。 */
export function parseDottedMask(text: string): { ok: true; prefix: number; maskU32: number } | { ok: false; error: SubnetError } {
  const quad = parseDottedQuad(text)
  if (!quad.ok) {
    return { ok: false, error: { kind: 'maskFormat', segment: 'mask', value: quad.error.value } }
  }
  const maskU32 = quad.u32
  let ones = 0
  for (let bit = 31; bit >= 0; bit--) {
    if (((maskU32 >>> bit) & 1) === 1) ones++
    else break
  }
  const canonical = prefixToMask(ones)
  if (maskU32 !== canonical) {
    return { ok: false, error: { kind: 'maskContiguous', segment: 'mask', value: text } }
  }
  return { ok: true, prefix: ones, maskU32 }
}

/** 前缀长度 → 连续掩码（uint32）。 */
export function prefixToMask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
}

/**
 * 单输入框自动识别：CIDR `a.b.c.d/n` 主形态；点分掩码 `10.0.0.0 255.255.255.0`
 * （空格分隔）；裸 IP 自动补 /32。主机位非零 → 归一化为网络地址并标注
 * isHostAddress（不拒绝、不静默吞掉差异）。
 */
export function parseSubnetInput(input: string): ParseResult {
  const text = input.trim()
  if (text === '') return { status: 'empty' }

  const tokens = text.split(/\s+/)
  if (tokens.length > 2) {
    return { status: 'error', error: { kind: 'fieldCount', segment: 'format', value: String(tokens.length) } }
  }

  const first = tokens[0] as string
  let ipText = first
  let prefixText: string | null = null
  const slash = first.indexOf('/')
  if (slash >= 0) {
    ipText = first.slice(0, slash)
    prefixText = first.slice(slash + 1)
  }

  let maskU32: number
  let prefix: number

  if (tokens.length === 2) {
    // 点分掩码形态：第二 token 必须是掩码
    const mask = parseDottedMask(tokens[1] as string)
    if (!mask.ok) return { status: 'error', error: mask.error }
    const ip = parseDottedQuad(ipText)
    if (!ip.ok) return { status: 'error', error: ip.error }
    maskU32 = mask.maskU32
    prefix = mask.prefix
  } else if (prefixText !== null) {
    // CIDR 形态
    const ip = parseDottedQuad(ipText)
    if (!ip.ok) return { status: 'error', error: ip.error }
    const p = parsePrefix(prefixText)
    if (!p.ok) return { status: 'error', error: p.error }
    maskU32 = prefixToMask(p.prefix)
    prefix = p.prefix
  } else {
    // 裸 IP → /32（主机地址视角）
    const ip = parseDottedQuad(ipText)
    if (!ip.ok) return { status: 'error', error: ip.error }
    maskU32 = 0xffffffff
    prefix = 32
  }

  const ipU32 = parseDottedQuad(ipText)
  if (!ipU32.ok) return { status: 'error', error: ipU32.error }

  const wildcard = (~maskU32) >>> 0
  const isHostAddress = ((ipU32.u32 & wildcard) >>> 0) !== 0

  return { status: 'ok', ipU32: ipU32.u32, prefix, maskU32, isHostAddress }
}

// ---- 计算（九件套） ----

export type NetworkClass = 'A' | 'B' | 'C' | 'D' | 'E'

export type NetworkLabel = 'private' | 'loopback' | 'linklocal' | 'multicast' | 'reserved' | 'public'

export interface SubnetInfo {
  networkU32: number
  /** /31（RFC 3021）与 /32 无广播语义 */
  broadcastU32: number | null
  maskU32: number
  /** 通配掩码（掩码按位取反，ACL 口径） */
  wildcardU32: number
  prefix: number
  /** 输入为主机地址（已归一化到网络地址） */
  isHostAddress: boolean
  /** 地址总数（2 的幂，≤ 2^32，double 精确） */
  total: number
  /** 可用主机数：一般 total-2；/31 为 2（RFC 3021）；/32 为 1 */
  usable: number
  /** 可用主机范围：/32 无范围语义 */
  firstHostU32: number | null
  lastHostU32: number | null
  class: NetworkClass
  label: NetworkLabel
}

function networkClass(networkU32: number): NetworkClass {
  const first = networkU32 >>> 24
  if (first <= 127) return 'A'
  if (first <= 191) return 'B'
  if (first <= 223) return 'C'
  if (first <= 239) return 'D'
  return 'E'
}

/** 私网/特殊判定（RFC 1918 + 127/8 + 169.254/16 + 224/4 + 240/4），按网络地址判定。 */
export function classifyNetwork(networkU32: number): NetworkLabel {
  const first = networkU32 >>> 24
  const second = (networkU32 >>> 16) & 0xff
  if (first === 127) return 'loopback'
  if (first === 169 && second === 254) return 'linklocal'
  if (first === 10) return 'private'
  if (first === 172 && second >= 16 && second <= 31) return 'private'
  if (first === 192 && second === 168) return 'private'
  if (first >= 224 && first <= 239) return 'multicast'
  if (first >= 240) return 'reserved'
  return 'public'
}

/** 由网络地址与前缀长度计算全部九项（analyze 与切分共用的核心）。 */
export function computeSubnet(networkU32: number, prefix: number): SubnetInfo {
  const maskU32 = prefixToMask(prefix)
  const wildcardU32 = (~maskU32) >>> 0
  const network = (networkU32 & maskU32) >>> 0
  const broadcastU32 = (network | wildcardU32) >>> 0
  const total = 2 ** (32 - prefix)

  let usable: number
  let firstHostU32: number | null
  let lastHostU32: number | null
  if (prefix === 32) {
    // /32 单主机：无范围/广播语义
    usable = 1
    firstHostU32 = null
    lastHostU32 = null
  } else if (prefix === 31) {
    // /31 点对点（RFC 3021）：2 个地址、无广播、可用 2
    usable = 2
    firstHostU32 = network
    lastHostU32 = broadcastU32
  } else {
    usable = total - 2
    firstHostU32 = (network + 1) >>> 0
    lastHostU32 = (broadcastU32 - 1) >>> 0
  }

  return {
    networkU32: network,
    broadcastU32: prefix >= 31 ? null : broadcastU32,
    maskU32,
    wildcardU32,
    prefix,
    isHostAddress: false,
    total,
    usable,
    firstHostU32,
    lastHostU32,
    class: networkClass(network),
    label: classifyNetwork(network),
  }
}

/** 解析并计算九件套；输入为主机地址时归一化到网络地址。 */
export type AnalyzeResult =
  | { status: 'empty' }
  | { status: 'error'; error: SubnetError }
  | { status: 'ok'; info: SubnetInfo }

export function analyze(input: string): AnalyzeResult {
  const parsed = parseSubnetInput(input)
  if (parsed.status !== 'ok') return parsed
  const info = computeSubnet(parsed.ipU32, parsed.prefix)
  info.isHostAddress = parsed.isHostAddress
  return { status: 'ok', info }
}

// ---- 格式化 ----

export function formatIp(u32: number): string {
  return `${u32 >>> 24}.${(u32 >>> 16) & 0xff}.${(u32 >>> 8) & 0xff}.${u32 & 0xff}`
}

export function formatCidr(u32: number, prefix: number): string {
  return `${formatIp(u32)}/${prefix}`
}

/** 二进制行：四段 8 位点分（调试分类身份）。 */
export function formatBinaryIp(u32: number): string {
  const octets = [u32 >>> 24, (u32 >>> 16) & 0xff, (u32 >>> 8) & 0xff, u32 & 0xff]
  return octets.map((o) => o.toString(2).padStart(8, '0')).join('.')
}

// ---- 等分切分（Equal Split，2 的幂均分；VLSM 不做） ----

export const SPLIT_COUNT_OPTIONS: readonly number[] = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]
/** 切分行数上限：超出提示改用更大前缀。 */
export const SPLIT_ROW_LIMIT = 1024

export interface SplitRow {
  cidr: string
  networkU32: number
  firstU32: number | null
  lastU32: number | null
  usable: number
  total: number
}

export type SplitResult =
  | { ok: true; rows: SplitRow[]; newPrefix: number }
  | { ok: false; reason: 'tooManySubnets' | 'notPowerOfTwo' | 'invalidTarget' }

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0
}

/**
 * 等分切分：按目标子网数（2 的幂）或目标前缀长均分为等长前缀子网。
 * 行数上限 1024（2^(新前缀-父前缀) ≤ 1024 且新前缀 ≤ 32）。
 * 断言口径：结果首尾相接、无缝隙无重叠恰好覆盖父网。
 */
export function equalSplit(
  networkU32: number,
  prefix: number,
  target: { count: number } | { newPrefix: number },
): SplitResult {
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
  if (newPrefix > 32 || 2 ** (newPrefix - prefix) > SPLIT_ROW_LIMIT) {
    return { ok: false, reason: 'tooManySubnets' }
  }

  const child = computeSubnet(networkU32, newPrefix)
  const step = 2 ** (32 - newPrefix)
  const rowCount = 2 ** (newPrefix - prefix)
  const rows: SplitRow[] = []
  for (let i = 0; i < rowCount; i++) {
    // networkU32 + i*step ≤ 2^32 - 1，double 精确；>>>0 转 uint32
    const net = (child.networkU32 + i * step) >>> 0
    const info = computeSubnet(net, newPrefix)
    rows.push({
      cidr: formatCidr(info.networkU32, newPrefix),
      networkU32: info.networkU32,
      firstU32: info.firstHostU32,
      lastU32: info.lastHostU32,
      usable: info.usable,
      total: info.total,
    })
  }
  return { ok: true, rows, newPrefix }
}
