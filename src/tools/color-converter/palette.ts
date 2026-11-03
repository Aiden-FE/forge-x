/**
 * 色板（CONTEXT.md「色板」）：基于基色按六种调和规则固定产出，产出数量固定、
 * 不做数量调节（13 票扩展）。
 *
 * - 纯 HSL 角度几何调和（「没有智能，只有角度」）：复用 color.ts 的
 *   rgbToHsl / hslToRgb，与既有 HEX/RGB/HSL 口径一致；OKLCH 不在范围（族级决策）。
 * - alpha 不参与调和（与「互补色」口径一致）：基色 alpha 原样保留。
 * - swatch 点击复制 HEX（大写口径）；悬停展示 HEX / RGB / HSL。
 */

import { formatHex, formatHsl, formatRgb, hslToRgb, rgbToHsl } from './color'
import type { RgbColor } from './color'

export type PaletteRuleId =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'tetradic'
  | 'monochrome'

/** 六规则的固定产出（id + 数量）；顺序即 UI 呈现顺序。 */
export const PALETTE_RULES: Array<{ id: PaletteRuleId; count: number }> = [
  { id: 'complementary', count: 2 },
  { id: 'analogous', count: 3 },
  { id: 'triadic', count: 3 },
  { id: 'split-complementary', count: 3 },
  { id: 'tetradic', count: 4 },
  { id: 'monochrome', count: 5 },
]

/** 色相旋转 delta 度（CSS 语义 mod 360 归一化；alpha 保持）。 */
export function rotateHue(color: RgbColor, delta: number): RgbColor {
  const hsl = rgbToHsl(color)
  return hslToRgb({ ...hsl, h: (((hsl.h + delta) % 360) + 360) % 360 })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 单色明暗的固定五档偏移（亮度百分比）；中档即基色。 */
export const MONOCHROME_LIGHTNESS_STEPS = [-30, -15, 0, 15, 30] as const

/**
 * 按规则产出色板（角度口径，相对基色色相）：
 * - 互补：[0°, +180°]（2 色）
 * - 近似：[0°, +30°, -30°]（3 色）
 * - 三角：[0°, +120°, -120°]（3 色）
 * - 分裂互补：[0°, +150°, +210°]（3 色）
 * - 四方：[0°, +90°, +180°, +270°]（4 色）
 * - 单色：亮度 [-30, -15, 0, +15, +30]（钳制 0–100，5 档）
 */
export function buildPalette(rule: PaletteRuleId, base: RgbColor): RgbColor[] {
  switch (rule) {
    case 'complementary':
      return [base, rotateHue(base, 180)]
    case 'analogous':
      return [base, rotateHue(base, 30), rotateHue(base, -30)]
    case 'triadic':
      return [base, rotateHue(base, 120), rotateHue(base, -120)]
    case 'split-complementary':
      return [base, rotateHue(base, 150), rotateHue(base, 210)]
    case 'tetradic':
      return [base, rotateHue(base, 90), rotateHue(base, 180), rotateHue(base, 270)]
    case 'monochrome': {
      const hsl = rgbToHsl(base)
      return MONOCHROME_LIGHTNESS_STEPS.map((step) =>
        hslToRgb({ ...hsl, l: clamp(hsl.l + step, 0, 100) }),
      )
    }
  }
}

/** swatch 复制内容：大写 HEX（与转换器同色等值，仅大小写口径）。 */
export function paletteHex(color: RgbColor): string {
  return formatHex(color).toUpperCase()
}

/** swatch 悬停展示：HEX / RGB / HSL 一行文本。 */
export function swatchTooltip(color: RgbColor): string {
  return `${paletteHex(color)} · ${formatRgb(color)} · ${formatHsl(color)}`
}


