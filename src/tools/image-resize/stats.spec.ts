import { describe, expect, it } from 'vitest'
import { collectZipEntries, compressionRatio, formatBytes, formatDimensions, formatRatio, zipFileName } from './stats'
import type { ZipEntryLike } from './stats'

describe('compressionRatio 压缩率（(原始−转换后)/原始）', () => {
  it('文件变小 → 正值：1000 → 400 = 0.6', () => {
    expect(compressionRatio(1000, 400)).toBeCloseTo(0.6, 10)
  })

  it('文件变大 → 负值：1000 → 1200 = -0.2（小图重编码变大场景）', () => {
    expect(compressionRatio(1000, 1200)).toBeCloseTo(-0.2, 10)
  })

  it('大小相同 → 0', () => {
    expect(compressionRatio(512, 512)).toBe(0)
  })
})

describe('formatRatio 压缩率展示（结构化值 → 文案，负值带符号）', () => {
  it('0.6 → 60.0%', () => {
    expect(formatRatio(0.6)).toBe('60.0%')
  })

  it('-0.2 → -20.0%（负值呈现，UI 配「变大」语义）', () => {
    expect(formatRatio(-0.2)).toBe('-20.0%')
  })

  it('0 → 0.0%', () => {
    expect(formatRatio(0)).toBe('0.0%')
  })
})

describe('formatBytes 输出大小格式化', () => {
  it('512 → 512 B', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('边界：1024 → 1.0 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  it('5242880 → 5.0 MB', () => {
    expect(formatBytes(5242880)).toBe('5.0 MB')
  })

  it('0 → 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
})

describe('formatDimensions 尺寸变化展示', () => {
  it('640×480', () => {
    expect(formatDimensions(640, 480)).toBe('640×480')
  })
})

describe('zipFileName 打包文件名', () => {
  it('格式 image-resized-YYYYMMDD-HHmmss.zip（本地时间、零填充）', () => {
    const d = new Date(2026, 0, 5, 9, 7, 3)
    expect(zipFileName(d)).toBe('image-resized-20260105-090703.zip')
  })

  it('跨年月份零填充', () => {
    expect(zipFileName(new Date(2026, 11, 31, 23, 59, 59))).toBe('image-resized-20261231-235959.zip')
  })
})

describe('collectZipEntries zip 前条目构造（仅成功产物）', () => {
  const blob = (size: number) => ({ size }) as Blob

  it('仅收集成功行，名称用加入批次时确定的输出名', () => {
    const rows: ZipEntryLike[] = [
      { status: 'success', outputName: 'a.jpg', blob: blob(10) },
      { status: 'failed', outputName: 'b.jpg', blob: undefined },
      { status: 'converting', outputName: 'c.jpg', blob: undefined },
      { status: 'success', outputName: 'd.png', blob: blob(20) },
    ]
    expect(collectZipEntries(rows)).toEqual([
      { name: 'a.jpg', blob: rows[0].blob },
      { name: 'd.png', blob: rows[3].blob },
    ])
  })

  it('全部失败 → 空数组（zip 按钮禁用依据）', () => {
    const rows: ZipEntryLike[] = [{ status: 'failed', outputName: 'a.jpg', blob: undefined }]
    expect(collectZipEntries(rows)).toEqual([])
  })
})
