import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUIET_ZONE,
  ECC_LEVELS,
  MAX_QUIET_ZONE,
  MIN_QUIET_ZONE,
  generateQr,
  generateQrMatrix,
  matrixToSvg,
  normalizeQuietZone,
} from './qr'
import type { QrMatrix } from './qr'

function serializeMatrix(m: QrMatrix): string {
  const rows: string[] = []
  for (let r = 0; r < m.moduleCount; r++) {
    let row = ''
    for (let c = 0; c < m.moduleCount; c++) row += m.isDark(r, c) ? '1' : '0'
    rows.push(row)
  }
  return rows.join('\n')
}

/** Stack-based XML well-formedness check (enough for the fixed SVG shape we emit). */
function checkWellFormedXml(xml: string): void {
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*(\/?)>/g
  const stack: string[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(xml)) !== null) {
    const text = xml.slice(last, match.index)
    if (text.includes('<')) throw new Error(`stray '<' before tag ${match[0]}`)
    last = tagPattern.lastIndex
    const closing = match[1] === '/'
    const name = match[2]
    if (match[4] === '/') continue
    if (closing) {
      const top = stack.pop()
      if (top !== name) throw new Error(`expected </${top}> but found </${name}>`)
    } else {
      stack.push(name)
    }
  }
  if (xml.slice(last).includes('<')) throw new Error(`stray '<' after last tag`)
  if (stack.length > 0) throw new Error(`unclosed tags: ${stack.join(', ')}`)
}

function parseSizeAttrs(svg: string): { width: number; height: number; viewBox: string } {
  const openTag = svg.slice(0, svg.indexOf('>'))
  const width = openTag.match(/\swidth="(\d+)"/)?.[1]
  const height = openTag.match(/\sheight="(\d+)"/)?.[1]
  const viewBox = openTag.match(/\sviewBox="([^"]+)"/)?.[1]
  expect(width, 'width attribute').toBeDefined()
  expect(height, 'height attribute').toBeDefined()
  expect(viewBox, 'viewBox attribute').toBeDefined()
  return { width: Number(width), height: Number(height), viewBox: viewBox! }
}

describe('normalizeQuietZone 配置归一化', () => {
  it('合法范围内的整数原样保留', () => {
    expect(normalizeQuietZone(0)).toBe(0)
    expect(normalizeQuietZone(4)).toBe(4)
    expect(normalizeQuietZone(MAX_QUIET_ZONE)).toBe(MAX_QUIET_ZONE)
  })

  it('向下取整', () => {
    expect(normalizeQuietZone(4.9)).toBe(4)
  })

  it('超出范围时截断到边界', () => {
    expect(normalizeQuietZone(-3)).toBe(MIN_QUIET_ZONE)
    expect(normalizeQuietZone(99)).toBe(MAX_QUIET_ZONE)
  })

  it('非法数值回退到默认值', () => {
    expect(normalizeQuietZone(Number.NaN)).toBe(DEFAULT_QUIET_ZONE)
    expect(normalizeQuietZone(Number.POSITIVE_INFINITY)).toBe(DEFAULT_QUIET_ZONE)
  })
})

describe('纠错级别配置到生成输出的映射', () => {
  it('四档级别都能生成，短文本均为 version 1（21 模块）', () => {
    for (const level of ECC_LEVELS) {
      const m = generateQrMatrix('HELLO', level)
      expect(m.moduleCount, `ecc=${level}`).toBe(21)
    }
  })

  it('不同纠错级别产生不同的矩阵（编码内容不同）', () => {
    const serialized = ECC_LEVELS.map((level) => serializeMatrix(generateQrMatrix('HELLO', level)))
    for (let i = 0; i < serialized.length; i++) {
      for (let j = i + 1; j < serialized.length; j++) {
        expect(serialized[i], `ecc[${i}] vs ecc[${j}]`).not.toBe(serialized[j])
      }
    }
  })

  it('非法级别不会出现（类型层面已约束，防御性检查枚举）', () => {
    expect(ECC_LEVELS).toEqual(['L', 'M', 'Q', 'H'])
  })
})

describe('quiet zone 配置到生成输出的映射', () => {
  it('size = moduleCount + 2 * quietZone，并写入 SVG 尺寸属性', () => {
    for (const q of [0, 2, 4]) {
      const result = generateQr('HELLO', 'M', q)
      expect(result).not.toBeNull()
      const r = result!
      expect(r.size).toBe(r.matrix.moduleCount + q * 2)
      expect(r.quietZone).toBe(q)
      const { width, height, viewBox } = parseSizeAttrs(r.svg)
      expect(width).toBe(r.size)
      expect(height).toBe(r.size)
      expect(viewBox).toBe(`0 0 ${r.size} ${r.size}`)
    }
  })

  it('quiet zone 为 0 时模块从原点开始绘制', () => {
    const r = generateQr('HELLO', 'M', 0)!
    expect(r.svg).toContain('d="M0,0h1v1h-1z')
  })

  it('quiet zone 为 4 时模块整体平移 4 个单位', () => {
    const r = generateQr('HELLO', 'M', 4)!
    expect(r.svg).toContain('d="M4,4h1v1h-1z')
  })

  it('超界 quiet zone 被截断后再映射', () => {
    const r = generateQr('HELLO', 'M', 999)!
    expect(r.quietZone).toBe(MAX_QUIET_ZONE)
    expect(r.size).toBe(r.matrix.moduleCount + MAX_QUIET_ZONE * 2)
  })
})

describe('空输入空状态', () => {
  it('空字符串 → null（UI 据此显示空状态而不是报错）', () => {
    expect(generateQr('', 'M', DEFAULT_QUIET_ZONE)).toBeNull()
  })
})

describe('SVG 输出有效性', () => {
  it('输出为合法 XML：标签配对、无游离 <', () => {
    for (const level of ECC_LEVELS) {
      const r = generateQr('HELLO', level, 4)!
      expect(() => checkWellFormedXml(r.svg)).not.toThrow()
    }
  })

  it('包含 SVG 命名空间与黑前景/白背景', () => {
    const r = generateQr('HELLO', 'M', 4)!
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(r.svg).toContain('<rect')
    expect(r.svg).toContain('fill="#ffffff"')
    expect(r.svg).toContain('<path d="M4,4')
    expect(r.svg).toContain('fill="#000000"')
    expect(r.svg.endsWith('</svg>')).toBe(true)
  })

  it('含 XML 特殊字符的输入不会破坏输出结构', () => {
    const r = generateQr('<&">HELLO', 'M', 2)!
    expect(() => checkWellFormedXml(r.svg)).not.toThrow()
    expect(r.svg).not.toContain('<&')
  })

  it('matrixToSvg 对超界 quiet zone 同样截断', () => {
    const m = generateQrMatrix('HELLO', 'M')
    const svg = matrixToSvg(m, -1)
    expect(parseSizeAttrs(svg).width).toBe(m.moduleCount)
  })
})

describe('QR 标准结构（可扫描性逻辑对照）', () => {
  it('三个 finder pattern 与 QR 规范一致', () => {
    const m = generateQrMatrix('HELLO', 'M')
    const isFinderDark = (r: number, c: number) =>
      r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
    const origins: Array<[number, number]> = [
      [0, 0],
      [0, m.moduleCount - 7],
      [m.moduleCount - 7, 0],
    ]
    for (const [or, oc] of origins) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          expect(m.isDark(or + r, oc + c), `finder@(${or},${oc}) cell(${r},${c})`).toBe(isFinderDark(r, c))
        }
      }
    }
  })

  it('timing pattern（第 6 行/列）黑白交替', () => {
    const m = generateQrMatrix('HELLO', 'M')
    for (let c = 8; c <= m.moduleCount - 9; c++) {
      expect(m.isDark(6, c), `row6 col${c}`).toBe(c % 2 === 0)
    }
    for (let r = 8; r <= m.moduleCount - 9; r++) {
      expect(m.isDark(r, 6), `col6 row${r}`).toBe(r % 2 === 0)
    }
  })

  it('UTF-8 中文输入可生成（字节按 UTF-8 编码）', () => {
    const r = generateQr('你好 ForgeX', 'H', 4)!
    expect(r.matrix.moduleCount).toBeGreaterThanOrEqual(21)
    expect(r.matrix.moduleCount % 4).toBe(1) // 有效 QR 版本尺寸：21 + 4k
    expect(r.matrix.isDark(0, 0)).toBe(true) // finder 角必然为暗
  })
})
