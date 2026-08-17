import { describe, expect, it } from 'vitest'
import { compressionRatio, formatBytes, formatDimensions, formatRatio, zipFileName } from './stats'

describe('compressionRatio 压缩率', () => {
  it('文件变小 → 正值：1000 → 400 = 0.6', () => {
    expect(compressionRatio(1000, 400)).toBeCloseTo(0.6, 10)
  })

  it('文件变大 → 负值：1000 → 1200 = -0.2', () => {
    expect(compressionRatio(1000, 1200)).toBeCloseTo(-0.2, 10)
  })

  it('大小相同 → 0', () => {
    expect(compressionRatio(512, 512)).toBe(0)
  })
})

describe('formatRatio 压缩率展示', () => {
  it('0.6 → 60.0%', () => {
    expect(formatRatio(0.6)).toBe('60.0%')
  })

  it('-0.2 → -20.0%', () => {
    expect(formatRatio(-0.2)).toBe('-20.0%')
  })

  it('0 → 0.0%', () => {
    expect(formatRatio(0)).toBe('0.0%')
  })
})

describe('formatBytes 大小格式化', () => {
  it('512 → 512 B', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('边界：1024 → 1.0 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  it('2048 → 2.0 KB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('5242880 → 5.0 MB', () => {
    expect(formatBytes(5242880)).toBe('5.0 MB')
  })

  it('0 → 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
})

describe('formatDimensions 尺寸展示', () => {
  it('640×480', () => {
    expect(formatDimensions(640, 480)).toBe('640×480')
  })
})

describe('zipFileName 打包文件名', () => {
  it('格式 webp-converted-YYYYMMDD-HHmmss.zip（本地时间、零填充）', () => {
    const d = new Date(2026, 0, 5, 9, 7, 3)
    expect(zipFileName(d)).toBe('webp-converted-20260105-090703.zip')
  })

  it('跨年月份零填充', () => {
    expect(zipFileName(new Date(2026, 11, 31, 23, 59, 59))).toBe('webp-converted-20261231-235959.zip')
  })
})
