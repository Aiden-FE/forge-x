/**
 * 10 票扩展：OKLCH 验收。
 *
 * - oklch.com / CSS Color 4（Björn Ottosson 公开表）采样容差断言——容差声明：
 *   L ±0.001、C ±0.001、H ±0.1°（远高于双精度浮点噪声 ~1e-12，远低于显示
 *   精度 0.01% / 0.0001 / 0.01°；矩阵抄错一位数字的偏差 ≫ 容差）；
 * - sRGB 色域外 → 色域裁剪（保 L/H 收缩 C）+ clamped 标注（不报错不静默）；
 * - 往返收敛 ±1 沿用（pass1 ≤ ±1，pass2 精确不动点），口径同 HSL 先例；
 * - `oklch()` 串粘贴解析 + 裸 L/C/H 三分量输入（含百分数 / deg / alpha 变体）。
 */
import { describe, expect, it } from 'vitest'
import { formatHex } from './color'
import type { RgbColor } from './color'
import { formatOklch, oklchToRgb, parseOklch, rgbToOklch } from './oklch'

function ok(res: ReturnType<typeof parseOklch>): { color: RgbColor; clamped: boolean } {
  if (!res.ok) throw new Error('expected parse to succeed')
  return { color: res.color, clamped: res.clamped }
}

/** Deterministic PRNG（同 color.spec 先例，种子不同）。 */
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('oklch.com 采样容差（sRGB → OKLCH）', () => {
  // 公开对照值：oklch.com 与 CSS Color 4 参考实现一致（Björn Ottosson 表）。
  const samples: Array<{ rgb: RgbColor; l: number; c: number; h: number | null }> = [
    { rgb: { r: 255, g: 0, b: 0, a: 1 }, l: 0.627955, c: 0.257683, h: 29.234 },
    { rgb: { r: 0, g: 255, b: 0, a: 1 }, l: 0.866440, c: 0.294818, h: 142.499 },
    { rgb: { r: 0, g: 0, b: 255, a: 1 }, l: 0.452014, c: 0.313235, h: 264.048 },
    { rgb: { r: 255, g: 255, b: 0, a: 1 }, l: 0.967983, c: 0.211006, h: 109.769 },
    // 白/黑：只断 L 与 C（H 在 C≈0 时数值上无意义，实现归 0）
    { rgb: { r: 255, g: 255, b: 255, a: 1 }, l: 1.0, c: 0, h: null },
    { rgb: { r: 0, g: 0, b: 0, a: 1 }, l: 0, c: 0, h: null },
  ]

  it('六个采样点 L/C/H 落在声明容差内（L ±0.001、C ±0.001、H ±0.1°）', () => {
    for (const sample of samples) {
      const oklch = rgbToOklch(sample.rgb)
      expect(Math.abs(oklch.l - sample.l), `${formatHex(sample.rgb)} L`).toBeLessThanOrEqual(0.001)
      expect(Math.abs(oklch.c - sample.c), `${formatHex(sample.rgb)} C`).toBeLessThanOrEqual(0.001)
      if (sample.h !== null) {
        expect(Math.abs(oklch.h - sample.h), `${formatHex(sample.rgb)} H`).toBeLessThanOrEqual(0.1)
      } else {
        expect(oklch.h, `${formatHex(sample.rgb)} H(C=0 归零)`).toBe(0)
      }
    }
  })

  it('逆向采样：oklch.com 的 OKLCH 串回到 sRGB 原色（±1，域内不裁剪）', () => {
    const cases: Array<[string, RgbColor]> = [
      ['oklch(62.795% 0.25768 29.234)', { r: 255, g: 0, b: 0, a: 1 }],
      ['oklch(86.644% 0.29482 142.495)', { r: 0, g: 255, b: 0, a: 1 }],
      ['oklch(45.201% 0.31323 264.052)', { r: 0, g: 0, b: 255, a: 1 }],
    ]
    for (const [text, expected] of cases) {
      const res = ok(parseOklch(text))
      expect(res.clamped, text).toBe(false)
      expect(Math.abs(res.color.r - expected.r), text).toBeLessThanOrEqual(1)
      expect(Math.abs(res.color.g - expected.g), text).toBeLessThanOrEqual(1)
      expect(Math.abs(res.color.b - expected.b), text).toBeLessThanOrEqual(1)
    }
  })

  it('正逆向恒等：oklchToRgb(rgbToOklch(x)) ≈ x（±1，全立方体抽样含角落）', () => {
    const rand = mulberry32(0x0c1a)
    const samples: RgbColor[] = []
    for (let i = 0; i < 300; i++) {
      samples.push({
        r: Math.floor(rand() * 256),
        g: Math.floor(rand() * 256),
        b: Math.floor(rand() * 256),
        a: 1,
      })
    }
    // 角落区（0–3 与 252–255 全组合）是矩阵逆误差最危险处
    for (const lo of [0, 252]) {
      for (let r = lo; r < lo + 4; r++) {
        for (let g = lo; g < lo + 4; g++) {
          for (let b = lo; b < lo + 4; b++) samples.push({ r, g, b, a: 1 })
        }
      }
    }
    for (const x of samples) {
      const back = oklchToRgb({ ...rgbToOklch(x), a: x.a })
      expect(Math.abs(back.color.r - x.r), formatHex(x)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.color.g - x.g), formatHex(x)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.color.b - x.b), formatHex(x)).toBeLessThanOrEqual(1)
      expect(back.clamped, formatHex(x)).toBe(false)
    }
  })
})

describe('色域裁剪（CONTEXT.md：裁剪必须可见）', () => {
  it('色域外（大 C）：clamped=true，保 L/H 收缩 C 到最近可表示色', () => {
    const res = oklchToRgb({ l: 0.7, c: 0.4, h: 30, a: 1 })
    expect(res.clamped).toBe(true)
    // 裁剪保持 L/H（8-bit 量化带来小漂移；H 保持角度，C 显著收缩）
    const back = rgbToOklch(res.color)
    expect(Math.abs(back.l - 0.7)).toBeLessThanOrEqual(0.02)
    expect(Math.abs(back.h - 30)).toBeLessThanOrEqual(2)
    expect(back.c).toBeLessThan(0.4)
    expect(back.c).toBeGreaterThan(0.1)
  })

  it('色域内：clamped=false（含高饱和域内色）', () => {
    expect(oklchToRgb({ l: 0.627955, c: 0.257683, h: 29.234, a: 1 }).clamped).toBe(false)
    expect(oklchToRgb({ l: 0.5, c: 0, h: 0, a: 1 }).clamped).toBe(false)
    expect(oklchToRgb({ l: 0, c: 0, h: 0, a: 1 }).clamped).toBe(false)
    expect(oklchToRgb({ l: 1, c: 0, h: 0, a: 1 }).clamped).toBe(false)
  })

  it('极端 L 边界（L=1 大 C）：收缩到 C≈0（白），仍标注已裁剪', () => {
    const res = oklchToRgb({ l: 1, c: 0.37, h: 264, a: 1 })
    expect(res.clamped).toBe(true)
    expect(formatHex(res.color)).toBe('#ffffff')
  })

  it('parseOklch 透传 clamped 标注（粘贴即见，不静默）', () => {
    expect(ok(parseOklch('oklch(70% 0.4 30)')).clamped).toBe(true)
    expect(ok(parseOklch('oklch(70% 0.05 30)')).clamped).toBe(false)
    expect(ok(parseOklch('0.7 0.4 30')).clamped).toBe(true)
  })
})

describe('往返收敛 ±1（口径同 HSL 先例）', () => {
  function roundtripOklch(c: RgbColor): RgbColor {
    const res = parseOklch(formatOklch(c))
    if (!res.ok) throw new Error(`roundtrip parse failed for ${formatOklch(c)}`)
    return res.color
  }

  function assertWithinOne(a: RgbColor, b: RgbColor, label: string): void {
    expect(Math.abs(a.r - b.r), `${label} r`).toBeLessThanOrEqual(1)
    expect(Math.abs(a.g - b.g), `${label} g`).toBeLessThanOrEqual(1)
    expect(Math.abs(a.b - b.b), `${label} b`).toBeLessThanOrEqual(1)
    expect(Math.abs(a.a - b.a), `${label} a`).toBeLessThanOrEqual(1e-9)
  }

  function assertFixedPoint(x0: RgbColor, label: string): void {
    const x1 = roundtripOklch(x0)
    assertWithinOne(x1, x0, `${label} pass1`)
    const x2 = roundtripOklch(x1)
    expect(x2, `${label} pass2 fixed point`).toEqual(x1)
  }

  it('标准色往返 ≤ ±1 且两次收敛', () => {
    assertFixedPoint({ r: 255, g: 0, b: 0, a: 1 }, 'red')
    assertFixedPoint({ r: 0, g: 255, b: 0, a: 1 }, 'green')
    assertFixedPoint({ r: 0, g: 0, b: 255, a: 1 }, 'blue')
    assertFixedPoint({ r: 171, g: 205, b: 239, a: 1 }, '171,205,239')
  })

  it('全部灰阶（0–255）往返 ≤ ±1 且两次收敛（含近灰 H 归零路径）', () => {
    for (let v = 0; v <= 255; v++) {
      assertFixedPoint({ r: v, g: v, b: v, a: 1 }, `gray${v}`)
    }
  })

  it('暗部/亮部/随机色往返收敛（种子随机，含 alpha）', () => {
    const rand = mulberry32(0x0c1b)
    const samples: RgbColor[] = []
    for (let r = 0; r <= 12; r++) {
      for (let g = 0; g <= 12; g++) {
        for (let b = 0; b <= 12; b++) samples.push({ r, g, b, a: 1 })
      }
    }
    for (let r = 243; r <= 255; r++) {
      for (let g = 243; g <= 255; g++) {
        for (let b = 243; b <= 255; b++) samples.push({ r, g, b, a: 1 })
      }
    }
    for (let i = 0; i < 400; i++) {
      const a = rand()
      samples.push({
        r: Math.floor(rand() * 256),
        g: Math.floor(rand() * 256),
        b: Math.floor(rand() * 256),
        a: a < 0.5 ? 1 : Math.round(a * 1000) / 1000,
      })
    }
    for (const s of samples) {
      assertFixedPoint(s, `${formatHex(s)}`)
    }
  })
})

describe('parseOklch：oklch() 串与裸三分量', () => {
  it('CSS Color 4 语法（数字 / 百分数 / deg 后缀 / alpha）', () => {
    expect(ok(parseOklch('oklch(0.6279554 0.2576833 29.2338)')).color).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseOklch('oklch(62.8% 0.258 29.2)')).color.r).toBeGreaterThan(250)
    expect(ok(parseOklch('oklch(62.8% 25.8% 29deg / 0.5)')).color.a).toBeCloseTo(0.5, 10)
    // 百分数色度基准 100% = 0.4（CSS Color 4）：64.42% ≈ 0.2577
    const pct = ok(parseOklch('oklch(62.8% 64.42% 29.2)')).color
    expect(Math.abs(pct.r - 255)).toBeLessThanOrEqual(1)
    expect(pct.g).toBeLessThanOrEqual(1)
    expect(pct.b).toBeLessThanOrEqual(1)
  })

  it('裸三分量输入形态（L C H [+ / alpha]，空格或逗号分隔）', () => {
    expect(ok(parseOklch('0.6279554 0.2576833 29.2338')).color).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseOklch('0.63, 0.26, 29')).color.r).toBeGreaterThan(250)
    expect(ok(parseOklch('0.63 0.26 29 / 50%')).color.a).toBeCloseTo(0.5, 10)
  })

  it('色相按 CSS 语义 mod 360（负角度与超一周环绕）', () => {
    expect(ok(parseOklch('oklch(0.63 0.26 -330.77)')).color.r).toBeGreaterThan(250) // ≈29.23
    expect(ok(parseOklch('oklch(0.63 0.26 389.23)')).color.r).toBeGreaterThan(250) // ≈29.23
  })

  it('非法输入返回错误结构（不抛异常）', () => {
    expect(parseOklch('oklch(1.1 0.1 30)').ok).toBe(false) // L > 1
    expect(parseOklch('oklch(101% 0.1 30)').ok).toBe(false)
    expect(parseOklch('oklch(-0.1 0.1 30)').ok).toBe(false) // L < 0
    expect(parseOklch('oklch(0.6 -0.1 30)').ok).toBe(false) // C < 0
    expect(parseOklch('oklch(0.6 0.1)').ok).toBe(false) // 缺分量
    expect(parseOklch('oklch(0.6 0.1 30 5)').ok).toBe(false) // 多分量
    expect(parseOklch('oklch(0.6 0.1 30 / 2)').ok).toBe(false) // alpha 越界
    expect(parseOklch('oklch(0.6 0.1 30 / 1 / 1)').ok).toBe(false)
    expect(parseOklch('oklch(0.6 0.1 abc)').ok).toBe(false)
    expect(parseOklch('oklch()').ok).toBe(false)
    expect(parseOklch('red').ok).toBe(false)
    expect(parseOklch('').ok).toBe(false)
    expect(parseOklch('   ').ok).toBe(false)
  })
})

describe('formatOklch（显示量化即规范值）', () => {
  it('红：oklch(62.8% 0.2577 29.23)', () => {
    expect(formatOklch({ r: 255, g: 0, b: 0, a: 1 })).toBe('oklch(62.8% 0.2577 29.23)')
  })

  it('白/黑/灰：C 与 H 归零呈现', () => {
    expect(formatOklch({ r: 255, g: 255, b: 255, a: 1 })).toBe('oklch(100% 0 0)')
    expect(formatOklch({ r: 0, g: 0, b: 0, a: 1 })).toBe('oklch(0% 0 0)')
    expect(formatOklch({ r: 128, g: 128, b: 128, a: 1 })).toBe('oklch(59.99% 0 0)')
  })

  it('alpha < 1 时携带 / alpha 段（三位小数）', () => {
    expect(formatOklch({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('oklch(62.8% 0.2577 29.23 / 0.5)')
    expect(formatOklch({ r: 255, g: 0, b: 0, a: 0.502 })).toBe('oklch(62.8% 0.2577 29.23 / 0.502)')
  })

  it('输出可被 parseOklch 复原（所有域内色输出即合法输入）', () => {
    const rand = mulberry32(0xf0b)
    for (let i = 0; i < 50; i++) {
      const c: RgbColor = {
        r: Math.floor(rand() * 256),
        g: Math.floor(rand() * 256),
        b: Math.floor(rand() * 256),
        a: 1,
      }
      const text = formatOklch(c)
      const res = parseOklch(text)
      expect(res.ok, text).toBe(true)
      if (res.ok) expect(res.clamped, text).toBe(false)
    }
  })
})
