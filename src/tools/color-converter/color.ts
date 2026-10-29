/**
 * 颜色转换器纯逻辑：HEX / RGB / HSL 三向互转（带 alpha）、WCAG 对比度、互补色。
 *
 * 约定（见 CONTEXT.md「色式」「透明度」「对比度」「互补色」）：
 * - 颜色的规范形态为 8-bit RGB + alpha（0–1）；所有文本输出由它派生。
 * - HEX ↔ RGB 精确无损；RGB ↔ HSL 受显示位数限制存在有界舍入误差（±1 通道）。
 * - HSL 的 h/s/l 以「度 / 百分数」计，显示量化到 0.1，保证往返两次后收敛。
 * - alpha 不参与色相旋转与对比度计算。
 */

export interface RgbColor {
  /** 0–255 整数 */
  r: number
  /** 0–255 整数 */
  g: number
  /** 0–255 整数 */
  b: number
  /** 0–1，1 为不透明 */
  a: number
}

export interface HslColor {
  /** 0–360 度（不含 360） */
  h: number
  /** 0–100 百分数 */
  s: number
  /** 0–100 百分数 */
  l: number
  /** 0–1，1 为不透明 */
  a: number
}

export type ParseResult = { ok: true; color: RgbColor } | { ok: false }

const NUMERIC_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/
const HEX_RE = /^#?([0-9a-fA-F]+)$/
const RGB_RE = /^rgba?\s*\(([^)]*)\)$/i
const HSL_RE = /^hsla?\s*\(([^)]*)\)$/i

function isNumeric(text: string): boolean {
  return NUMERIC_RE.test(text)
}

/** 解析 alpha 段：`0.5` / `.5` / `50%` 等写法归一化到 0–1；越界或非数字为非法。 */
function parseAlpha(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed.endsWith('%')) {
    const value = trimmed.slice(0, -1).trim()
    if (!isNumeric(value)) return null
    const percent = Number(value)
    if (percent < 0 || percent > 100) return null
    return percent / 100
  }
  if (!isNumeric(trimmed)) return null
  const value = Number(trimmed)
  if (value < 0 || value > 1) return null
  return value
}

function fromHexDigitQuad(text: string): ParseResult {
  if (!HEX_RE.test(text)) return { ok: false }
  const hex = text.replace(/^#/, '')
  const expand = (part: string) => Number.parseInt(part.length === 1 ? part + part : part, 16)
  if (hex.length === 3 || hex.length === 6) {
    const step = hex.length === 3 ? 1 : 2
    const r = expand(hex.slice(0, step))
    const g = expand(hex.slice(step, step * 2))
    const b = expand(hex.slice(step * 2, step * 3))
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return { ok: false }
    return { ok: true, color: { r, g, b, a: 1 } }
  }
  if (hex.length === 4 || hex.length === 8) {
    const step = hex.length === 4 ? 1 : 2
    const rgb = parseHex(hex.slice(0, step * 3))
    if (!rgb.ok) return { ok: false }
    const aByte = expand(hex.slice(step * 3))
    if (Number.isNaN(aByte)) return { ok: false }
    return { ok: true, color: { ...rgb.color, a: aByte / 255 } }
  }
  return { ok: false }
}

export function parseHex(input: string): ParseResult {
  return fromHexDigitQuad(input.trim())
}

function parseChannel(text: string): number | null {
  const trimmed = text.trim()
  if (!isNumeric(trimmed)) return null
  const value = Number(trimmed)
  if (value < 0 || value > 255) return null
  return Math.round(value)
}

function parseChannelList(inner: string, minParts: number): { channels: [number, number, number]; alpha: number } | null {
  const parts = inner.split(',').map((part) => part.trim())
  if (parts.length < minParts || parts.length > 4) return null
  if (parts.some((part) => part === '')) return null
  const r = parseChannel(parts[0])
  const g = parseChannel(parts[1])
  const b = parseChannel(parts[2])
  if (r === null || g === null || b === null) return null
  let alpha = 1
  if (parts.length === 4) {
    const parsed = parseAlpha(parts[3])
    if (parsed === null) return null
    alpha = parsed
  }
  return { channels: [r, g, b], alpha }
}

export function parseRgb(input: string): ParseResult {
  const trimmed = input.trim()
  const match = RGB_RE.exec(trimmed)
  if (!match) return { ok: false }
  const hasAlphaPrefix = /^rgba/i.test(trimmed)
  const parsed = parseChannelList(match[1], hasAlphaPrefix ? 4 : 3)
  if (!parsed) return { ok: false }
  const [r, g, b] = parsed.channels
  return { ok: true, color: { r, g, b, a: parsed.alpha } }
}

/**
 * 解析 HSL 文本。s / l 必须带百分号（0–100），h 为角度值并按 CSS 语义 mod 360
 * 归一化（负角度与超一周角度均环绕）。
 */
export function parseHsl(input: string): ParseResult {
  const trimmed = input.trim()
  const match = HSL_RE.exec(trimmed)
  if (!match) return { ok: false }
  const hasAlphaPrefix = /^hsla/i.test(trimmed)
  const parts = match[1].split(',').map((part) => part.trim())
  const minParts = hasAlphaPrefix ? 4 : 3
  if (parts.length < minParts || parts.length > 4) return { ok: false }
  if (parts.some((part) => part === '')) return { ok: false }

  if (!isNumeric(parts[0])) return { ok: false }
  const rawHue = Number(parts[0])

  const percents: number[] = []
  for (const part of parts.slice(1, 3)) {
    if (!part.endsWith('%')) return { ok: false }
    const value = part.slice(0, -1).trim()
    if (!isNumeric(value)) return { ok: false }
    const percent = Number(value)
    if (percent < 0 || percent > 100) return { ok: false }
    percents.push(percent)
  }
  if (percents.length !== 2) return { ok: false }

  let alpha = 1
  if (parts.length === 4) {
    const parsed = parseAlpha(parts[3])
    if (parsed === null) return { ok: false }
    alpha = parsed
  }
  return { ok: true, color: hslToRgb({ h: normalizeHue(rawHue), s: percents[0], l: percents[1], a: alpha }) }
}

/** 依次尝试 HEX / RGB / HSL 的通用解析（用于不限定色式的输入框）。 */
export function parseAny(input: string): ParseResult {
  const asHex = parseHex(input)
  if (asHex.ok) return asHex
  const asRgb = parseRgb(input)
  if (asRgb.ok) return asRgb
  return parseHsl(input)
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360
}

/** 显示量化：保留一位小数。规范 HSL 即此量化结果，保证往返收敛。 */
function quantize10(value: number): number {
  return Math.round(value * 10) / 10
}

export function rgbToHsl(color: RgbColor): HslColor {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  const lightness = (max + min) / 2

  let hue = 0
  if (chroma !== 0) {
    if (max === r) {
      hue = 60 * ((g - b) / chroma)
    } else if (max === g) {
      hue = 60 * ((b - r) / chroma + 2)
    } else {
      hue = 60 * ((r - g) / chroma + 4)
    }
    hue = normalizeHue(hue)
  }
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1))

  return {
    h: quantize10(hue) >= 360 ? 0 : quantize10(hue),
    s: quantize10(saturation * 100),
    l: quantize10(lightness * 100),
    a: color.a,
  }
}

export function hslToRgb(color: HslColor): RgbColor {
  const hue = normalizeHue(color.h) / 60
  const saturation = color.s / 100
  const lightness = color.l / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs((hue % 2) - 1))
  let rgb: [number, number, number]
  if (hue < 1) rgb = [chroma, x, 0]
  else if (hue < 2) rgb = [x, chroma, 0]
  else if (hue < 3) rgb = [0, chroma, x]
  else if (hue < 4) rgb = [0, x, chroma]
  else if (hue < 5) rgb = [x, 0, chroma]
  else rgb = [chroma, 0, x]
  const m = lightness - chroma / 2
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
    a: color.a,
  }
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}

/** `#rrggbb`（alpha=1）或 `#rrggbbaa`；字母小写。 */
export function formatHex(color: RgbColor): string {
  const alphaByte = Math.round(color.a * 255)
  let hex = `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}`
  if (alphaByte !== 255) hex += toHexByte(alphaByte)
  return hex
}

/** alpha 文本：三位小数（可表示全部 256 个 8-bit alpha 值且往返稳定）。 */
function formatAlpha(color: RgbColor): string {
  return String(Math.round(color.a * 1000) / 1000)
}

export function formatRgb(color: RgbColor): string {
  const base = `${color.r}, ${color.g}, ${color.b}`
  return color.a === 1 ? `rgb(${base})` : `rgba(${base}, ${formatAlpha(color)})`
}

export function formatHsl(color: RgbColor): string {
  const hsl = rgbToHsl(color)
  const base = `${hsl.h}, ${hsl.s}%, ${hsl.l}%`
  return color.a === 1 ? `hsl(${base})` : `hsla(${base}, ${formatAlpha(color)})`
}

/** WCAG 2.1 相对亮度（alpha 不参与）。 */
export function relativeLuminance(color: RgbColor): number {
  const linear = (channel: number) => {
    const u = channel / 255
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b)
}

/** WCAG 对比度比值（1–21）；仅由两色相对亮度决定，与顺序无关。 */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export interface WcagLevels {
  /** AA 普通文本（≥ 4.5） */
  aaNormal: boolean
  /** AA 大文本（≥ 3） */
  aaLarge: boolean
  /** AAA 普通文本（≥ 7） */
  aaaNormal: boolean
  /** AAA 大文本（≥ 4.5） */
  aaaLarge: boolean
}

/** WCAG 2.1 判定；阈值为规范事实（≥ 含边界），不可自定义。 */
export function wcagLevels(ratio: number): WcagLevels {
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  }
}

/** 互补色：HSL 色相旋转 180°；alpha 保持不变。 */
export function complementary(color: RgbColor): RgbColor {
  const hsl = rgbToHsl(color)
  return hslToRgb({ ...hsl, h: normalizeHue(hsl.h + 180) })
}
