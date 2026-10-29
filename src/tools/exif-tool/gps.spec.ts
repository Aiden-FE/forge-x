import { describe, expect, it } from 'vitest'
import { dmsArrayToDecimal, formatGpsDecimal, formatGpsDms } from './gps'

describe('dmsArrayToDecimal：度分秒数组 → 十进制度', () => {
  it('[39,54,15] → 39.904166…', () => {
    expect(dmsArrayToDecimal([39, 54, 15])).toBeCloseTo(39.90416666666, 8)
  })

  it('[116,23,29] → 116.391388…', () => {
    expect(dmsArrayToDecimal([116, 23, 29])).toBeCloseTo(116.39138888888, 8)
  })

  it('无秒位（数组长度 2）→ 度 + 分', () => {
    expect(dmsArrayToDecimal([39, 30])).toBeCloseTo(39.5, 10)
  })

  it('空数组 → 0', () => {
    expect(dmsArrayToDecimal([])).toBe(0)
  })
})

describe('formatGpsDecimal：十进制度显示（规格要求的 GPS 展示口径）', () => {
  it('保留 6 位小数 + 半球参考', () => {
    expect(formatGpsDecimal(39.90416666666667, 'N')).toBe('39.904167° N')
    expect(formatGpsDecimal(116.3913888888889, 'E')).toBe('116.391389° E')
  })

  it('无参考 → 仅角度', () => {
    expect(formatGpsDecimal(39.90416666666667)).toBe('39.904167°')
  })

  it('南/西参考', () => {
    expect(formatGpsDecimal(33.5, 'S')).toBe('33.500000° S')
    expect(formatGpsDecimal(100.25, 'W')).toBe('100.250000° W')
  })
})

describe('formatGpsDms：DMS 换算（手算真值）', () => {
  it('39.9042° 换算为 39°54′15″ N 一类的 DMS', () => {
    expect(formatGpsDms([39, 54, 15], 'N')).toBe('39°54′15″ N')
    expect(formatGpsDms([116, 23, 29], 'E')).toBe('116°23′29″ E')
  })

  it('秒取整四舍五入：[39,54,15.4] → 15″；[39,54,15.6] → 16″', () => {
    expect(formatGpsDms([39, 54, 15.4], 'N')).toBe('39°54′15″ N')
    expect(formatGpsDms([39, 54, 15.6], 'N')).toBe('39°54′16″ N')
  })

  it('进位：59.7″ 取整进 1′；分位 60 进 1°', () => {
    expect(formatGpsDms([39, 54, 59.7], 'N')).toBe('39°55′0″ N')
    expect(formatGpsDms([39, 60, 15], 'N')).toBe('40°0′15″ N')
  })

  it('无参考 → 仅 DMS', () => {
    expect(formatGpsDms([39, 54, 15])).toBe('39°54′15″')
  })

  it('小数分（无秒）：[39, 30] → 39°30′0″', () => {
    expect(formatGpsDms([39, 30], 'N')).toBe('39°30′0″ N')
  })
})
