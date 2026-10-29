import { describe, expect, it } from 'vitest'
import { formatBytes, zipFileName } from './stats'

describe('formatBytes（与 WebP 转换器同口径）', () => {
  it('B / KB / MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(2048 * 1024)).toBe('2.0 MB')
  })
})

describe('zipFileName：exif-cleaned-YYYYMMDD-HHmmss.zip（沿用 zip 打包先例）', () => {
  it('本地时间格式化', () => {
    expect(zipFileName(new Date(2026, 9, 29, 7, 5, 3))).toBe('exif-cleaned-20261029-070503.zip')
  })
})
