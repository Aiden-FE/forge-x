import { describe, expect, it } from 'vitest'
import { MAX_FILE_SIZE, MAX_ITEMS, detectFormat, isStrippableFormat, validateBatchCapacity, validateFile } from './validate'

describe('detectFormat：查看格式集 JPEG / PNG / TIFF', () => {
  it('mime 识别', () => {
    expect(detectFormat({ name: 'a.jpg', size: 1, type: 'image/jpeg' })).toBe('jpeg')
    expect(detectFormat({ name: 'a.png', size: 1, type: 'image/png' })).toBe('png')
    expect(detectFormat({ name: 'a.tif', size: 1, type: 'image/tiff' })).toBe('tiff')
  })

  it('mime 缺失时按扩展名识别（含 .jpeg/.tif/.tiff）', () => {
    expect(detectFormat({ name: 'photo.jpeg', size: 1, type: '' })).toBe('jpeg')
    expect(detectFormat({ name: 'photo.JPG', size: 1, type: '' })).toBe('jpeg')
    expect(detectFormat({ name: 'photo.png', size: 1, type: '' })).toBe('png')
    expect(detectFormat({ name: 'photo.tif', size: 1, type: '' })).toBe('tiff')
    expect(detectFormat({ name: 'photo.tiff', size: 1, type: '' })).toBe('tiff')
  })

  it('排除格式（WebP / HEIC / GIF 等）→ null', () => {
    expect(detectFormat({ name: 'a.webp', size: 1, type: 'image/webp' })).toBeNull()
    expect(detectFormat({ name: 'a.heic', size: 1, type: 'image/heic' })).toBeNull()
    expect(detectFormat({ name: 'a.gif', size: 1, type: 'image/gif' })).toBeNull()
    expect(detectFormat({ name: 'a.txt', size: 1, type: 'text/plain' })).toBeNull()
    expect(detectFormat({ name: 'noext', size: 1, type: '' })).toBeNull()
  })
})

describe('isStrippableFormat：清除仅支持 JPEG / PNG（TIFF 仅查看）', () => {
  it('jpeg / png → true', () => {
    expect(isStrippableFormat('jpeg')).toBe(true)
    expect(isStrippableFormat('png')).toBe(true)
  })

  it('tiff → false（清除需重写全部 IFD，超出现有段级/块级能力）', () => {
    expect(isStrippableFormat('tiff')).toBe(false)
  })
})

describe('validateFile 逐文件校验（格式 → 大小，首个命中即拒绝）', () => {
  it('受支持格式 + 合法大小 → 通过', () => {
    expect(validateFile({ name: 'a.jpg', size: 1024, type: 'image/jpeg' })).toEqual({ ok: true })
    expect(validateFile({ name: 'a.png', size: 1024, type: 'image/png' })).toEqual({ ok: true })
    expect(validateFile({ name: 'a.tiff', size: 1024, type: 'image/tiff' })).toEqual({ ok: true })
  })

  it('不支持的格式 → unsupported-format', () => {
    expect(validateFile({ name: 'a.webp', size: 1024, type: 'image/webp' })).toEqual({
      ok: false,
      reason: 'unsupported-format',
    })
    expect(validateFile({ name: 'a.heic', size: 1024, type: 'image/heic' }).ok).toBe(false)
  })

  it('大小 >20 MiB → file-too-large', () => {
    const r = validateFile({ name: 'big.png', size: MAX_FILE_SIZE + 1, type: 'image/png' })
    expect(r).toEqual({ ok: false, reason: 'file-too-large' })
  })

  it('边界：恰好 20 MiB → 通过', () => {
    expect(validateFile({ name: 'big.png', size: MAX_FILE_SIZE, type: 'image/png' })).toEqual({ ok: true })
  })

  it('首个命中即拒绝：格式不支持且超大小 → unsupported-format', () => {
    const r = validateFile({ name: 'x.webp', size: MAX_FILE_SIZE + 1, type: 'image/webp' })
    expect(r).toEqual({ ok: false, reason: 'unsupported-format' })
  })
})

describe('validateBatchCapacity 批量 ≤ 20 文件', () => {
  it('恰好 20 项 → 通过', () => {
    expect(validateBatchCapacity(MAX_ITEMS, 0)).toEqual({ ok: true })
  })

  it('加入后超过 20 项 → too-many-files', () => {
    expect(validateBatchCapacity(MAX_ITEMS, 1)).toEqual({ ok: false, reason: 'too-many-files' })
    expect(validateBatchCapacity(MAX_ITEMS - 1, 2)).toEqual({ ok: false, reason: 'too-many-files' })
  })

  it('未超限 → 通过', () => {
    expect(validateBatchCapacity(MAX_ITEMS - 1, 1)).toEqual({ ok: true })
  })
})
