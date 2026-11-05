/**
 * OKLCH 色彩空间（10 票扩展）——CSS Color 4 标准公式自实现，0 依赖。
 *
 * 口径（票据锁定 + CONTEXT.md「色域裁剪」）：
 * - 变换链：sRGB →（传函线性化）→ linear sRGB →（M1）→ LMS →（∛）→ LMS'
 *   →（M2）→ OKLab →（C=√(a²+b²)，H=atan2(b,a)）→ OKLCH；逆向逐级回代。
 *   矩阵取 Björn Ottosson 拟合值（CSS Color 4 与 oklch.com 同源）。
 * - 线性化阈值用 CSS Color 4 的 0.04045（≠ WCAG 亮度公式的 0.03928——那是
 *   对比度专用口径，两处刻意不同）。
 * - sRGB 色域外输入（通道超出 [0,1] 超过容差）：保 L/H 二分收缩 C 钳制到
 *   最近可表示色并返回 clamped=true——不报错、不静默（色域裁剪）。
 * - 显示量化：L 百分数 2 位小数、C 4 位、H 2 位——保证往返两次收敛（口径
 *   同 HSL 的「显示量化即规范值」）。
 * - WCAG 对比度与六规则色板维持 HSL 口径不动（OKLCH 调和出界，见 palette.ts）。
 */

import type { RgbColor } from './color'

export interface OklchColor {
  /** 0–1（CSS 语义上的明度） */
  l: number
  /** ≥ 0（色度） */
  c: number
  /** 0–360 度（不含 360；C=0 时为 0） */
  h: number
  /** 0–1，1 为不透明（不参与色相/色度） */
  a: number
}

export type OklchParseResult =
  | { ok: true; color: RgbColor; clamped: boolean }
  | { ok: false }

/* ------------------------------------------------------------------ *
 * 传函与矩阵（CSS Color 4 / Björn Ottosson）
 * ------------------------------------------------------------------ */

function srgbToLinear(channel: number): number {
  const u = channel / 255
  return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
}

/** linear sRGB → LMS（M1）。 */
function toLms(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ]
}

/** LMS → linear sRGB（M1⁻¹）。 */
function fromLms(l: number, m: number, s: number): [number, number, number] {
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** OKLCH → linear sRGB（可能越出色域；越界量由此暴露）。 */
function oklchToLinearSrgb(l: number, c: number, hRad: number): [number, number, number] {
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  return fromLms(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_)
}

/* ------------------------------------------------------------------ *
 * RGB → OKLCH
 * ------------------------------------------------------------------ */

export function rgbToOklch(color: RgbColor): OklchColor {
  const [l, m, s] = toLms(srgbToLinear(color.r), srgbToLinear(color.g), srgbToLinear(color.b))
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.hypot(A, B)
  // 近灰阈值：纯灰的 C 是浮点噪声量级（~1e-8），此时的 H 数值上随机跳变
  // （白 ≠ 318°）——低于显示精度即归零，H 同步归 0（与 HSL chroma=0 口径一致）。
  if (c < 1e-7) {
    return { l: L, c: 0, h: 0, a: color.a }
  }
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return { l: L, c, h: ((h % 360) + 360) % 360, a: color.a }
}

/* ------------------------------------------------------------------ *
 * OKLCH → RGB（含色域裁剪）
 * ------------------------------------------------------------------ */

/** 通道越界容差：≤ 1/255 的越界在 8-bit 量化中本就归并到边界，不算裁剪。 */
const GAMUT_EPS = 1 / 255

/** 二分迭代次数：2⁻²⁰ 的 C 步长远低于 8-bit 分辨率。 */
const CLAMP_ITERATIONS = 20

function inGamut(channels: [number, number, number]): boolean {
  return channels.every(
    (channel) =>
      Number.isFinite(channel) && channel >= -GAMUT_EPS && channel <= 1 + GAMUT_EPS,
  )
}

/** linear 通道（可能微越界）→ 8-bit：先去线性化（gamma 编码），再钳制取整。 */
function quantizeLinear(channels: [number, number, number], alpha: number): RgbColor {
  const byte = (channel: number): number =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(channel))) * 255)
  return { r: byte(channels[0]), g: byte(channels[1]), b: byte(channels[2]), a: alpha }
}

/**
 * OKLCH → sRGB。色域外（通道越界超容差）时色域裁剪：保 L/H 不动，二分收缩
 * C 至最近可表示色（oklch.com 同款行为先例），返回 clamped=true 供 UI 标注。
 */
export function oklchToRgb(color: OklchColor): { color: RgbColor; clamped: boolean } {
  const hRad = (color.h * Math.PI) / 180
  const raw = oklchToLinearSrgb(color.l, color.c, hRad)
  if (inGamut(raw)) return { color: quantizeLinear(raw, color.a), clamped: false }

  let lo = 0
  let hi = color.c
  for (let i = 0; i < CLAMP_ITERATIONS; i += 1) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToLinearSrgb(color.l, mid, hRad))) lo = mid
    else hi = mid
  }
  return {
    color: quantizeLinear(oklchToLinearSrgb(color.l, lo, hRad), color.a),
    clamped: true,
  }
}

/* ------------------------------------------------------------------ *
 * 文本解析：`oklch()` 串粘贴 + 裸 L/C/H 三分量
 * ------------------------------------------------------------------ */

const OKLCH_RE = /^oklch\(([^)]*)\)$/i
const NUMERIC_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/

/** CSS 色度百分数基准：100% = 0.4（CSS Color 4）。 */
const CHROMA_PERCENT_BASE = 0.4

function isNumeric(text: string): boolean {
  return NUMERIC_RE.test(text)
}

/** 解析 L 或 C 段：数字或百分数（L 基准 1，C 基准 0.4）；返回 null 为非法。 */
function parseComponent(text: string, percentBase: number, min: number): number | null {
  const trimmed = text.trim()
  let scale = 1
  let digits = trimmed
  if (trimmed.endsWith('%')) {
    digits = trimmed.slice(0, -1).trim()
    scale = percentBase / 100
  }
  if (!isNumeric(digits)) return null
  const value = Number(digits) * scale
  if (!Number.isFinite(value) || value < min) return null
  return value
}

/** 解析 H 段：任意有限角度（可带 deg 后缀），按 CSS 语义 mod 360。 */
function parseHue(text: string): number | null {
  const trimmed = text.trim()
  const digits = trimmed.toLowerCase().endsWith('deg')
    ? trimmed.slice(0, -3).trim()
    : trimmed
  if (!isNumeric(digits)) return null
  const value = Number(digits)
  if (!Number.isFinite(value)) return null
  return ((value % 360) + 360) % 360
}

/** 解析 alpha 段（与 color.ts 同口径：`0.5` / `50%`，越界非法）。 */
function parseAlpha(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed.endsWith('%')) {
    const digits = trimmed.slice(0, -1).trim()
    if (!isNumeric(digits)) return null
    const percent = Number(digits)
    if (percent < 0 || percent > 100) return null
    return percent / 100
  }
  if (!isNumeric(trimmed)) return null
  const value = Number(trimmed)
  if (value < 0 || value > 1) return null
  return value
}

/**
 * 解析 OKLCH 文本。两种形态：
 * - `oklch(L C H)` / `oklch(L C H / A)`（CSS Color 4 语法，可从 oklch.com 粘贴；
 *   L/C 可写百分数，H 可带 deg，分隔符空格或逗号皆容忍）；
 * - 裸三分量 `L C H`（[+ / A] 可选）——L/C/H 逐分量输入形态。
 * L 限 0–1（0–100%），C ≥ 0（上不设限——越界由色域裁剪接管并标注）。
 */
export function parseOklch(input: string): OklchParseResult {
  const trimmed = input.trim()
  const match = OKLCH_RE.exec(trimmed)
  const body = match ? match[1] : trimmed

  // alpha 以 `/` 分隔（先于分隔符拆分）。
  const slashSplit = body.split('/')
  if (slashSplit.length > 2) return { ok: false }
  const mainPart = slashSplit[0]
  const alphaPart = slashSplit[1]

  const parts = mainPart.split(/[\s,]+/).filter((part) => part !== '')
  if (parts.length !== 3) return { ok: false }

  const l = parseComponent(parts[0], 1, 0)
  const c = parseComponent(parts[1], CHROMA_PERCENT_BASE, 0)
  const h = parseHue(parts[2])
  if (l === null || l > 1 || c === null || h === null) return { ok: false }

  let alpha = 1
  if (alphaPart !== undefined) {
    const parsed = parseAlpha(alphaPart)
    if (parsed === null) return { ok: false }
    alpha = parsed
  }

  const converted = oklchToRgb({ l, c, h, a: alpha })
  return { ok: true, color: converted.color, clamped: converted.clamped }
}

/* ------------------------------------------------------------------ *
 * 文本输出（显示量化即规范值）
 * ------------------------------------------------------------------ */

/** 量化并去尾零：62.80 → "62.8"，25.00 → "25"。 */
function trimFixed(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed === '' || trimmed === '-' ? '0' : trimmed
}

/** `oklch(L% C H)`（alpha=1 省略 alpha 段）；L/C/H 显示量化见文件头。 */
export function formatOklch(color: RgbColor): string {
  const oklch = rgbToOklch(color)
  const base = `${trimFixed(oklch.l * 100, 2)}% ${trimFixed(oklch.c, 4)} ${trimFixed(oklch.h, 2)}`
  if (color.a === 1) return `oklch(${base})`
  return `oklch(${base} / ${trimFixed(color.a, 3)})`
}
