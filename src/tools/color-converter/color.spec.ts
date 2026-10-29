import { describe, expect, it } from 'vitest'
import {
  complementary,
  contrastRatio,
  formatHex,
  formatHsl,
  formatRgb,
  hslToRgb,
  parseAny,
  parseHex,
  parseHsl,
  parseRgb,
  relativeLuminance,
  rgbToHsl,
  wcagLevels,
} from './color'
import type { HslColor, ParseResult, RgbColor } from './color'

/** Unwrap a parse result expected to succeed; fails the test otherwise. */
function ok(res: ParseResult): RgbColor {
  if (!res.ok) throw new Error('expected parse to succeed')
  return res.color
}

function expectError(res: ParseResult): void {
  expect(res.ok).toBe(false)
}

function close(actual: number, expected: number, eps = 1e-9): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps)
}

/** Deterministic PRNG so the property tests are reproducible. */
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('HEX 解析', () => {
  it('#RRGGBB 长形态（大小写、可省略 #）', () => {
    expect(ok(parseHex('#FF0000'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseHex('ff0000'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseHex('#AbCdEf'))).toEqual({ r: 171, g: 205, b: 239, a: 1 })
  })

  it('#RGB 3 位短形态（逐位加倍）', () => {
    expect(ok(parseHex('#f00'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseHex('abc'))).toEqual({ r: 170, g: 187, b: 204, a: 1 })
  })

  it('#RRGGBBAA 8 位带 alpha', () => {
    const c = ok(parseHex('#ff000080'))
    expect(c.r).toBe(255)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
    close(c.a, 128 / 255)
  })

  it('#RGBA 4 位短形态带 alpha', () => {
    const c = ok(parseHex('#f00c'))
    expect(c.r).toBe(255)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
    close(c.a, 204 / 255)
    close(c.a, 0.8)
  })

  it('alpha 边界 0 与 1', () => {
    expect(ok(parseHex('#00000000')).a).toBe(0)
    expect(ok(parseHex('#000000ff')).a).toBe(1)
  })

  it('非法输入返回错误结构（不抛异常）', () => {
    expectError(parseHex('#gg'))
    expectError(parseHex('#gg0000'))
    expectError(parseHex('#12345'))
    expectError(parseHex('#1234567'))
    expectError(parseHex('#ff0000gg'))
    expectError(parseHex('##ff0000'))
    expectError(parseHex('#12 3456'))
    expectError(parseHex(''))
    expectError(parseHex('   '))
  })
})

describe('RGB 解析', () => {
  it('rgb() 基本形态（含空白）', () => {
    expect(ok(parseRgb('rgb(255,0,0)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseRgb('rgb( 255 , 0 , 0 )'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseRgb('RGB(171, 205, 239)'))).toEqual({ r: 171, g: 205, b: 239, a: 1 })
  })

  it('rgba() 十进制 alpha', () => {
    const c = ok(parseRgb('rgba(0,0,0,0.5)'))
    expect(c.r).toBe(0)
    close(c.a, 0.5)
  })

  it('rgba() 百分数 alpha 归一化', () => {
    close(ok(parseRgb('rgba(0,0,0,50%)')).a, 0.5)
    expect(ok(parseRgb('rgba(255,0,0,0%)')).a).toBe(0)
    expect(ok(parseRgb('rgba(255,0,0,100%)')).a).toBe(1)
    expect(ok(parseRgb('rgb(255,0,0,25%)')).a).toBe(0.25)
  })

  it('alpha 边界 0 与 1', () => {
    expect(ok(parseRgb('rgba(255,0,0,0)')).a).toBe(0)
    expect(ok(parseRgb('rgba(255,0,0,1)')).a).toBe(1)
  })

  it('小数通道四舍五入到 8-bit', () => {
    expect(ok(parseRgb('rgb(127.5, 0, 0)')).r).toBe(128)
  })

  it('非法输入返回错误结构', () => {
    expectError(parseRgb('rgb(300,0,0)'))
    expectError(parseRgb('rgb(-1,0,0)'))
    expectError(parseRgb('rgb(255,0)'))
    expectError(parseRgb('rgba(0,0,0)'))
    expectError(parseRgb('rgba(0,0,0,1.5)'))
    expectError(parseRgb('rgba(0,0,0,100.5%)'))
    expectError(parseRgb('rgb(255,0,0,)'))
    expectError(parseRgb('rgb(a,b,c)'))
    expectError(parseRgb('rgb(255,0,0'))
    expectError(parseRgb('rgb()'))
    expectError(parseRgb('rgb(255,0,0,0.5,0.5)'))
    expectError(parseRgb(''))
  })
})

describe('HSL 解析', () => {
  it('hsl() 基本形态', () => {
    expect(ok(parseHsl('hsl(0,100%,50%)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseHsl('hsl(210, 68%, 80.4%)'))).toEqual({ r: 171, g: 205, b: 239, a: 1 })
  })

  it('hsla() alpha：十进制与百分数', () => {
    close(ok(parseHsl('hsla(0,100%,50%,0.5)')).a, 0.5)
    close(ok(parseHsl('hsla(0,100%,50%,50%)')).a, 0.5)
    close(ok(parseHsl('hsl(0,100%,50%,25%)')).a, 0.25)
  })

  it('色相按 CSS 语义 mod 360 归一化（含负数）', () => {
    expect(ok(parseHsl('hsl(360,100%,50%)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseHsl('hsl(390,100%,50%)')).g).toBe(128) // 30° → rgb(255,128,0)
    expect(ok(parseHsl('hsl(-30,100%,50%)')).b).toBe(128) // 330° → rgb(255,0,128)
  })

  it('非法输入返回错误结构', () => {
    expectError(parseHsl('hsl(210,44,80%)')) // s 缺 %
    expectError(parseHsl('hsl(210,44%,80)')) // l 缺 %
    expectError(parseHsl('hsl(210,101%,50%)'))
    expectError(parseHsl('hsl(210,-1%,50%)'))
    expectError(parseHsl('hsl(210,50%)'))
    expectError(parseHsl('hsla(0,100%,50%)'))
    expectError(parseHsl('hsl(0,100%,50%,2)'))
    expectError(parseHsl(''))
  })
})

describe('parseAny 通用派发', () => {
  it('依次尝试 HEX / RGB / HSL', () => {
    expect(ok(parseAny('#ff0000'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseAny('rgb(255,0,0)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseAny('hsl(0,100%,50%)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expectError(parseAny('nope'))
  })
})

describe('已知值精确转换（独立真值）', () => {
  it('RGB ↔ HSL 标准色', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0, a: 1 })).toEqual<HslColor>({ h: 0, s: 100, l: 50, a: 1 })
    expect(rgbToHsl({ r: 0, g: 255, b: 0, a: 1 })).toEqual<HslColor>({ h: 120, s: 100, l: 50, a: 1 })
    expect(rgbToHsl({ r: 0, g: 0, b: 255, a: 1 })).toEqual<HslColor>({ h: 240, s: 100, l: 50, a: 1 })
    expect(rgbToHsl({ r: 255, g: 255, b: 0, a: 1 })).toEqual<HslColor>({ h: 60, s: 100, l: 50, a: 1 })
    expect(rgbToHsl({ r: 0, g: 255, b: 255, a: 1 })).toEqual<HslColor>({ h: 180, s: 100, l: 50, a: 1 })
    expect(rgbToHsl({ r: 255, g: 0, b: 255, a: 1 })).toEqual<HslColor>({ h: 300, s: 100, l: 50, a: 1 })
    expect(rgbToHsl({ r: 0, g: 0, b: 0, a: 1 })).toEqual<HslColor>({ h: 0, s: 0, l: 0, a: 1 })
    expect(rgbToHsl({ r: 255, g: 255, b: 255, a: 1 })).toEqual<HslColor>({ h: 0, s: 0, l: 100, a: 1 })
  })

  it('HSL ↔ RGB 标准色', () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50, a: 1 })).toEqual<RgbColor>({ r: 255, g: 0, b: 0, a: 1 })
    expect(hslToRgb({ h: 120, s: 100, l: 50, a: 1 })).toEqual<RgbColor>({ r: 0, g: 255, b: 0, a: 1 })
    expect(hslToRgb({ h: 240, s: 100, l: 50, a: 1 })).toEqual<RgbColor>({ r: 0, g: 0, b: 255, a: 1 })
    expect(hslToRgb({ h: 0, s: 0, l: 0, a: 1 })).toEqual<RgbColor>({ r: 0, g: 0, b: 0, a: 1 })
    expect(hslToRgb({ h: 0, s: 0, l: 100, a: 1 })).toEqual<RgbColor>({ r: 255, g: 255, b: 255, a: 1 })
  })

  it('rgb(171,205,239) 的 HSL 真值为 hsl(210, 68%, 80.392…%)', () => {
    const hsl = rgbToHsl({ r: 171, g: 205, b: 239, a: 1 })
    expect(hsl.h).toBe(210)
    close(hsl.s, 68, 1e-9)
    close(hsl.l, 80.4, 0.05)
  })

  it('HEX 与 RGB 精确无损', () => {
    expect(formatHex({ r: 171, g: 205, b: 239, a: 1 })).toBe('#abcdef')
    expect(ok(parseHex('#abcdef'))).toEqual({ r: 171, g: 205, b: 239, a: 1 })
    expect(formatRgb({ r: 171, g: 205, b: 239, a: 1 })).toBe('rgb(171, 205, 239)')
  })

  it('alpha = 1 时输出省略 alpha；< 1 时携带', () => {
    expect(formatHsl({ r: 255, g: 0, b: 0, a: 1 })).toBe('hsl(0, 100%, 50%)')
    expect(formatRgb({ r: 0, g: 0, b: 0, a: 1 })).toBe('rgb(0, 0, 0)')
    expect(formatRgb({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)')
    expect(formatHsl({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('hsla(0, 100%, 50%, 0.5)')
    expect(formatHex({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('#ff000080')
  })

  it('HEX8 解析出的 alpha 在 RGB 文本中保留三位小数', () => {
    expect(formatRgb(ok(parseHex('#ff000080')))).toBe('rgba(255, 0, 0, 0.502)')
  })

  it('HSL 文本保留一位小数', () => {
    expect(formatHsl({ r: 171, g: 205, b: 239, a: 1 })).toBe('hsl(210, 68%, 80.4%)')
    expect(formatHsl({ r: 0, g: 128, b: 0, a: 1 })).toBe('hsl(120, 100%, 25.1%)')
    expect(formatHsl({ r: 128, g: 128, b: 128, a: 1 })).toBe('hsl(0, 0%, 50.2%)')
  })
})

describe('RGB↔HSL 舍入容差与往返收敛', () => {
  /** g(x): HSL 文本往返 = parse(formatHsl(x)) */
  function roundtripHsl(c: RgbColor): RgbColor {
    const res = parseHsl(formatHsl(c))
    if (!res.ok) throw new Error(`roundtrip parse failed for ${formatHsl(c)}`)
    return res.color
  }

  function assertWithinOne(a: RgbColor, b: RgbColor, label: string): void {
    expect(Math.abs(a.r - b.r), `${label} r`).toBeLessThanOrEqual(1)
    expect(Math.abs(a.g - b.g), `${label} g`).toBeLessThanOrEqual(1)
    expect(Math.abs(a.b - b.b), `${label} b`).toBeLessThanOrEqual(1)
  }

  function assertFixedPoint(x0: RgbColor, label: string): void {
    const x1 = roundtripHsl(x0)
    assertWithinOne(x1, x0, `${label} pass1`)
    const x2 = roundtripHsl(x1)
    expect(x2, `${label} pass2 fixed point`).toEqual(x1)
  }

  it('已知色往返 ≤ ±1 且两次收敛', () => {
    assertFixedPoint({ r: 171, g: 205, b: 239, a: 1 }, '171,205,239')
    assertFixedPoint({ r: 255, g: 0, b: 0, a: 1 }, 'red')
    assertFixedPoint({ r: 0, g: 128, b: 0, a: 1 }, 'green')
    assertFixedPoint({ r: 128, g: 128, b: 128, a: 1 }, 'gray')
  })

  it('全部灰阶（0–255）往返 ≤ ±1 且两次收敛', () => {
    for (let v = 0; v <= 255; v++) {
      assertFixedPoint({ r: v, g: v, b: v, a: 1 }, `gray${v}`)
    }
  })

  it('暗部/亮部/随机色往返收敛（种子随机，含 alpha）', () => {
    const rand = mulberry32(0xc0ffee)
    const samples: RgbColor[] = []
    // 暗部与亮部是 s/l 相对误差爆炸的危险区，重点覆盖
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

  it('HEX 往返逐字节稳定（含 alpha 量化）', () => {
    const rand = mulberry32(0xbeef)
    for (let i = 0; i < 200; i++) {
      const x0: RgbColor = {
        r: Math.floor(rand() * 256),
        g: Math.floor(rand() * 256),
        b: Math.floor(rand() * 256),
        a: rand() < 0.5 ? 1 : Math.round(rand() * 1000) / 1000,
      }
      const hex1 = formatHex(x0)
      const parsed = parseHex(hex1)
      if (!parsed.ok) throw new Error(`parse failed for ${hex1}`)
      expect(formatHex(parsed.color), hex1).toBe(hex1)
    }
    // 特例：百分数 alpha 50% → hex8 → 文本稳定
    const half = ok(parseRgb('rgba(0,0,0,50%)'))
    expect(formatHex(half)).toBe('#00000080')
    const back = parseHex('#00000080')
    if (!back.ok) throw new Error('unreachable')
    expect(formatHex(back.color)).toBe('#00000080')
  })
})

describe('WCAG 对比度', () => {
  const BLACK: RgbColor = { r: 0, g: 0, b: 0, a: 1 }
  const WHITE: RgbColor = { r: 255, g: 255, b: 255, a: 1 }

  it('相对亮度边界：黑 = 0，白 = 1', () => {
    close(relativeLuminance(BLACK), 0)
    close(relativeLuminance(WHITE), 1)
  })

  it('黑/白对比度 = 21', () => {
    close(contrastRatio(BLACK, WHITE), 21, 1e-9)
  })

  it('同色对比度 = 1', () => {
    close(contrastRatio(WHITE, WHITE), 1, 1e-12)
    close(contrastRatio({ r: 113, g: 112, b: 255, a: 1 }, { r: 113, g: 112, b: 255, a: 1 }), 1, 1e-12)
  })

  it('与顺序无关', () => {
    const a: RgbColor = { r: 171, g: 205, b: 239, a: 1 }
    const b: RgbColor = { r: 20, g: 30, b: 40, a: 1 }
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a))
    expect(contrastRatio(BLACK, WHITE)).toBe(contrastRatio(WHITE, BLACK))
  })

  it('红/白 = 3.998…（WCAG 公式手算真值）', () => {
    close(contrastRatio({ r: 255, g: 0, b: 0, a: 1 }, WHITE), 1.05 / 0.2626, 1e-9)
  })

  it('#777777/白 ≈ 4.48（公开参考值），过 AA 大文本、不过 AA 普通', () => {
    const gray: RgbColor = { r: 119, g: 119, b: 119, a: 1 }
    const ratio = contrastRatio(gray, WHITE)
    close(ratio, 4.48, 0.01)
    const lv = wcagLevels(ratio)
    expect(lv.aaNormal).toBe(false)
    expect(lv.aaLarge).toBe(true)
    expect(lv.aaaNormal).toBe(false)
    expect(lv.aaaLarge).toBe(false)
  })

  it('白/蓝 = 8.59（公开参考值）', () => {
    close(contrastRatio(WHITE, { r: 0, g: 0, b: 255, a: 1 }), 8.59, 0.01)
  })

  it('alpha 不参与对比度', () => {
    expect(contrastRatio({ ...BLACK, a: 0 }, WHITE)).toBe(contrastRatio(BLACK, WHITE))
    expect(contrastRatio({ ...WHITE, a: 0.3 }, { ...BLACK, a: 0.7 })).toBe(contrastRatio(WHITE, BLACK))
  })

  it('阈值边界精确判定（4.5 / 3 / 7，≥ 为通过）', () => {
    expect(wcagLevels(4.5)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true })
    expect(wcagLevels(4.499).aaNormal).toBe(false)
    expect(wcagLevels(7).aaaNormal).toBe(true)
    expect(wcagLevels(6.999).aaaNormal).toBe(false)
    expect(wcagLevels(3).aaLarge).toBe(true)
    expect(wcagLevels(2.999).aaLarge).toBe(false)
    expect(wcagLevels(21)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: true, aaaLarge: true })
    expect(wcagLevels(1)).toEqual({ aaNormal: false, aaLarge: false, aaaNormal: false, aaaLarge: false })
  })
})

describe('互补色', () => {
  it('#ff0000 → #00ffff', () => {
    expect(formatHex(complementary({ r: 255, g: 0, b: 0, a: 1 }))).toBe('#00ffff')
  })

  it('alpha 保持不变（alpha 不参与色相定义）', () => {
    expect(complementary({ r: 255, g: 0, b: 0, a: 0.5 })).toEqual({ r: 0, g: 255, b: 255, a: 0.5 })
  })

  it('灰色互补色为自身', () => {
    expect(complementary({ r: 128, g: 128, b: 128, a: 1 })).toEqual({ r: 128, g: 128, b: 128, a: 1 })
  })

  it('双重互补回到原色附近（±1）', () => {
    const rand = mulberry32(0x1234)
    for (let i = 0; i < 100; i++) {
      const c: RgbColor = {
        r: Math.floor(rand() * 256),
        g: Math.floor(rand() * 256),
        b: Math.floor(rand() * 256),
        a: 1,
      }
      const twice = complementary(complementary(c))
      expect(Math.abs(twice.r - c.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(twice.g - c.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(twice.b - c.b)).toBeLessThanOrEqual(1)
    }
  })
})
