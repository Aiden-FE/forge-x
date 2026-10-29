import { describe, expect, it } from 'vitest'
import { MAX_FILE_SIZE, MAX_ITEMS, isAnimatedWebP, parseSvgSize, svgRasterSize, validateBatchCapacity, validateFile } from './validate'

describe('validateFile 逐文件校验（与 WebP 转换器同口径格式集）', () => {
  it('受支持格式 + 合法大小 → 通过', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/webp']) {
      expect(validateFile({ name: 'a.png', size: 1024, type })).toEqual({ ok: true })
    }
  })

  it('不支持的格式 → unsupported-format（AVIF 明确排除）', () => {
    expect(validateFile({ name: 'a.avif', size: 1024, type: 'image/avif' }).ok).toBe(false)
    expect(validateFile({ name: 'a.heic', size: 1024, type: 'image/heic' }).ok).toBe(false)
    expect(validateFile({ name: 'a.txt', size: 1024, type: 'text/plain' }).ok).toBe(false)
    expect(validateFile({ name: 'a.avi', size: 1024, type: 'video/x-msvideo' }).ok).toBe(false)
  })

  it('大小 >20 MiB → file-too-large', () => {
    const r = validateFile({ name: 'big.png', size: MAX_FILE_SIZE + 1, type: 'image/png' })
    expect(r).toEqual({ ok: false, reason: 'file-too-large' })
  })

  it('边界：恰好 20 MiB → 通过', () => {
    expect(validateFile({ name: 'big.png', size: MAX_FILE_SIZE, type: 'image/png' })).toEqual({ ok: true })
  })

  it('首个命中即拒绝：格式不支持且超大小 → unsupported-format', () => {
    const r = validateFile({ name: 'x.avif', size: MAX_FILE_SIZE + 1, type: 'image/avif' })
    expect(r).toEqual({ ok: false, reason: 'unsupported-format' })
  })

  it('mime 缺失时按扩展名识别', () => {
    expect(validateFile({ name: 'photo.jpg', size: 1024, type: '' })).toEqual({ ok: true })
    expect(validateFile({ name: 'photo.unknown', size: 1024, type: '' }).ok).toBe(false)
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

describe('parseSvgSize SVG 尺寸解析（SVG 光栅化尺寸正确的基础）', () => {
  it('声明 width/height → declared', () => {
    expect(parseSvgSize('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"></svg>')).toEqual({
      kind: 'declared',
      width: 640,
      height: 480,
    })
  })

  it('仅 viewBox → viewbox', () => {
    expect(parseSvgSize('<svg viewBox="0 0 200 100"></svg>')).toEqual({
      kind: 'viewbox',
      width: 200,
      height: 100,
    })
  })

  it('百分比尺寸不视为声明 → 按 viewBox', () => {
    expect(parseSvgSize('<svg width="100%" height="100%" viewBox="0 0 10 20"></svg>')).toEqual({
      kind: 'viewbox',
      width: 10,
      height: 20,
    })
  })

  it('两者皆无 → none', () => {
    expect(parseSvgSize('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toEqual({ kind: 'none' })
  })
})

describe('svgRasterSize viewBox 栅格化目标尺寸', () => {
  it('200×100 → 1024×512', () => {
    expect(svgRasterSize(200, 100)).toEqual({ width: 1024, height: 512 })
  })

  it('方形 300×300 → 1024×1024', () => {
    expect(svgRasterSize(300, 300)).toEqual({ width: 1024, height: 1024 })
  })
})

describe('isAnimatedWebP 动画 WebP 检测（第一帧标注的基础）', () => {
  function makeWebp(chunks: { id: string; data: Uint8Array }[]): ArrayBuffer {
    const body = new Uint8Array(
      12 + chunks.reduce((sum, c) => sum + 8 + c.data.length + (c.data.length % 2), 0),
    )
    const view = new DataView(body.buffer)
    let offset = 0
    const writeId = (id: string, o: number) => {
      for (let i = 0; i < 4; i++) body[o + i] = id.charCodeAt(i)
    }
    writeId('RIFF', 0)
    view.setUint32(4, body.length - 8, true)
    writeId('WEBP', 8)
    offset = 12
    for (const c of chunks) {
      writeId(c.id, offset)
      view.setUint32(offset + 4, c.data.length, true)
      body.set(c.data, offset + 8)
      offset += 8 + c.data.length + (c.data.length % 2)
    }
    return body.buffer
  }

  it('含 ANIM 块 → true', () => {
    const buf = makeWebp([
      { id: 'VP8X', data: new Uint8Array(10) },
      { id: 'ANIM', data: new Uint8Array(16) },
    ])
    expect(isAnimatedWebP(buf)).toBe(true)
  })

  it('静态 WebP（VP8 / VP8L）→ false', () => {
    expect(isAnimatedWebP(makeWebp([{ id: 'VP8 ', data: new Uint8Array(100) }]))).toBe(false)
    expect(isAnimatedWebP(makeWebp([{ id: 'VP8L', data: new Uint8Array(100) }]))).toBe(false)
  })
})
