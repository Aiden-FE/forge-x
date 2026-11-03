import { describe, expect, it } from 'vitest'
import { formatHex, formatHsl, formatRgb, hslToRgb, parseHex, rgbToHsl } from './color'
import {
  MONOCHROME_LIGHTNESS_STEPS,
  PALETTE_RULES,
  buildPalette,
  paletteHex,
  rotateHue,
  swatchTooltip,
} from './palette'
import type { HslColor, RgbColor } from './color'

/** 基色：hsl(30, 70%, 50%)（色相 30° 便于断言正负角度）。 */
const BASE = hslToRgb({ h: 30, s: 70, l: 50, a: 1 })

function close(actual: number, expected: number, eps = 0.5): void {
  expect(Math.abs(actual - expected), `${actual} ≈ ${expected} (±${eps})`).toBeLessThanOrEqual(eps)
}

/** 断言色板某色的 HSL 色相（相对角度口径；经 RGB 往返有 ±0.2 的量化界）。 */
function expectHue(color: RgbColor, expectedHue: number, label: string): void {
  const normalized = (((expectedHue % 360) + 360) % 360)
  close(hslOf(color).h, normalized, 0.5)
  void label
}

/** 结构化形态（原 palette.ts 的 swatchInfo/hslOf：仅测试与悬停提示构成使用，随测试定当）。 */
function swatchInfo(color: RgbColor): { hex: string; rgb: string; hsl: string } {
  return { hex: paletteHex(color), rgb: formatRgb(color), hsl: formatHsl(color) }
}
function hslOf(color: RgbColor): HslColor {
  return rgbToHsl(color)
}

describe('规则集与固定产出数量', () => {
  it('六规则顺序与数量：互补(2)/近似(3)/三角(3)/分裂互补(3)/四方(4)/单色(5)，不做数量调节', () => {
    expect(PALETTE_RULES.map((r) => `${r.id}:${r.count}`)).toEqual([
      'complementary:2',
      'analogous:3',
      'triadic:3',
      'split-complementary:3',
      'tetradic:4',
      'monochrome:5',
    ])
    for (const rule of PALETTE_RULES) {
      expect(buildPalette(rule.id, BASE)).toHaveLength(rule.count)
    }
  })
})

describe('角度数学 fixture（相对基色 30°）', () => {
  it('互补：[0°, +180°] → 色相 [30, 210]', () => {
    const [c0, c1] = buildPalette('complementary', BASE)
    expectHue(c0!, 30, 'base')
    expectHue(c1!, 210, '+180')
  })

  it('近似 ±30°：[0°, +30°, -30°] → 色相 [30, 60, 0]', () => {
    const [c0, plus, minus] = buildPalette('analogous', BASE)
    expectHue(c0!, 30, 'base')
    expectHue(plus!, 60, '+30')
    expectHue(minus!, 0, '-30')
  })

  it('三角 ±120°：[0°, +120°, -120°] → 色相 [30, 150, 270]', () => {
    const [c0, plus, minus] = buildPalette('triadic', BASE)
    expectHue(c0!, 30, 'base')
    expectHue(plus!, 150, '+120')
    expectHue(minus!, 270, '-120')
  })

  it('分裂互补：[0°, +150°, +210°] → 色相 [30, 180, 240]', () => {
    const [c0, plus, minus] = buildPalette('split-complementary', BASE)
    expectHue(c0!, 30, 'base')
    expectHue(plus!, 180, '+150')
    expectHue(minus!, 240, '+210')
  })

  it('四方：[0°, +90°, +180°, +270°] → 色相 [30, 120, 210, 300]', () => {
    const colors = buildPalette('tetradic', BASE)
    const expected = [30, 120, 210, 300]
    colors.forEach((color, index) => expectHue(color, expected[index]!, `tetradic[${index}]`))
  })

  it('色相环绕：负角度与超一周角度 mod 360 归一化', () => {
    // 基色 350° 的 -30° → 320°
    const base350 = hslToRgb({ h: 350, s: 70, l: 50, a: 1 })
    close(hslOf(rotateHue(base350, -30)).h, 320)
    close(hslOf(rotateHue(base350, 390)).h, 20)
  })

  it('双重旋转回到原色（±1 通道内）', () => {
    const twice = rotateHue(rotateHue(BASE, 180), 180)
    expect(Math.abs(twice.r - BASE.r)).toBeLessThanOrEqual(1)
    expect(Math.abs(twice.g - BASE.g)).toBeLessThanOrEqual(1)
    expect(Math.abs(twice.b - BASE.b)).toBeLessThanOrEqual(1)
  })
})

describe('单色明暗 5 档', () => {
  it('亮度序列 [-30,-15,0,+15,+30]（中档即基色，饱和度/色相不变）', () => {
    const steps = buildPalette('monochrome', BASE)
    expect(steps).toHaveLength(5)
    const lightness = steps.map((c) => hslOf(c).l)
    expect(lightness.length).toBe(5)
    ;[20, 35, 50, 65, 80].forEach((expected, index) => close(lightness[index]!, expected))
    expect(MONOCHROME_LIGHTNESS_STEPS).toEqual([-30, -15, 0, 15, 30])
    for (const color of steps) {
      close(hslOf(color).h, 30)
      close(hslOf(color).s, 70, 1.5) // 饱和度在明暗两端对通道取整更敏感
    }
  })

  it('亮度序列单调不减且钳制 0–100（基色 l=90 时高端两档收在 100）', () => {
    const nearWhite = hslToRgb({ h: 30, s: 70, l: 90, a: 1 })
    const steps = buildPalette('monochrome', nearWhite).map((c) => hslOf(c).l)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!)
    }
    expect(steps.every((l) => l >= 0 && l <= 100)).toBe(true)
    ;[60, 75, 90, 100, 100].forEach((expected, index) => close(steps[index]!, expected))
  })

  it('基色 l=10 时低端两档收在 0', () => {
    const nearBlack = hslToRgb({ h: 30, s: 70, l: 10, a: 1 })
    const steps = buildPalette('monochrome', nearBlack).map((c) => hslOf(c).l)
    ;[0, 0, 10, 25, 40].forEach((expected, index) => close(steps[index]!, expected))
  })
})

describe('alpha 与口径一致性', () => {
  it('alpha 不参与调和（基色 alpha 原样保留）', () => {
    const translucent: RgbColor = { ...BASE, a: 0.5 }
    for (const rule of PALETTE_RULES) {
      const palette = buildPalette(rule.id, translucent)
      for (const color of palette) expect(color.a).toBe(0.5)
    }
  })

  it('paletteHex 为大写 HEX（复制口径）', () => {
    expect(paletteHex({ r: 171, g: 205, b: 239, a: 1 })).toBe('#ABCDEF')
    expect(paletteHex(BASE)).toBe(formatHex(BASE).toUpperCase())
  })

  it('swatch 悬停展示 HEX / RGB / HSL（一行三段）', () => {
    const info = swatchInfo(BASE)
    expect(info.hex).toMatch(/^#[0-9A-F]{6}$/)
    expect(info.rgb).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    expect(info.hsl).toMatch(/^hsl\([\d.]+, [\d.]+%, [\d.]+%\)$/)
    expect(swatchTooltip(BASE)).toBe(`${info.hex} · ${info.rgb} · ${info.hsl}`)
  })

  it('往返：色板色 → 转换器解析后显示一致（HEX 精确）', () => {
    for (const rule of PALETTE_RULES) {
      const palette = buildPalette(rule.id, BASE)
      for (const color of palette) {
        const parsed = parseHex(paletteHex(color))
        expect(parsed.ok).toBe(true)
        if (parsed.ok) {
          expect(parsed.color).toEqual(color) // HEX↔RGB 精确无损
        }
      }
    }
  })
})
