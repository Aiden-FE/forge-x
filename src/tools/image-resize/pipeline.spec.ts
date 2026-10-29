import { describe, expect, it, vi } from 'vitest'
import { ConversionError } from './errors'
import type { ImageCodec, ConvertOutcome } from './pipeline'
import { convertImage } from './pipeline'
import type { ResizePlan } from './resize'

/** 编解码桩：记录调用顺序与参数。 */
function makeCodec(overrides: Partial<ImageCodec> = {}): ImageCodec & { calls: string[] } {
  const calls: string[] = []
  const source = { stub: 'canvas' } as unknown as CanvasImageSource
  return {
    calls,
    decode: vi.fn(async () => {
      calls.push('decode')
      return { source, width: 4000, height: 3000, firstFrame: false }
    }),
    encode: vi.fn(async (_s, w, h, format, q) => {
      calls.push(`encode:${format}:${w}x${h}:q=${q === null ? 'none' : q}`)
      return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    }),
    ...overrides,
  } as ImageCodec & { calls: string[] }
}

const FILE = { name: 'a.png', size: 100, type: 'image/png' } as File

describe('convertImage 编排：decode → resize → encode', () => {
  it('调用顺序 decode → encode，目标尺寸由缩放计划计算', async () => {
    const codec = makeCodec()
    const plan: ResizePlan = { mode: 'longest-edge', edge: 2000 }
    const outcome = await convertImage(codec, FILE, plan, 'webp', 80)
    expect(codec.calls).toEqual(['decode', 'encode:webp:2000x1500:q=80'])
    expect(outcome).toMatchObject({
      width: 2000,
      height: 1500,
      sourceWidth: 4000,
      sourceHeight: 3000,
      firstFrame: false,
    })
    // 携带解码产物（保留供重新转换，避免二次解码）
    const decoded = await (codec.decode as unknown as ReturnType<typeof vi.fn>).mock.results[0].value
    expect(outcome.source).toBe(decoded.source)
  })

  it('PNG：无质量参数（quality = null）', async () => {
    const codec = makeCodec()
    const outcome = await convertImage(codec, FILE, { mode: 'percentage', percent: 50 }, 'png', 80)
    expect(codec.calls).toEqual(['decode', 'encode:png:2000x1500:q=none'])
    expect(outcome.blob.size).toBe(3)
  })

  it('JPEG：传入质量', async () => {
    const codec = makeCodec()
    await convertImage(codec, FILE, { mode: 'percentage', percent: 50 }, 'jpeg', 65)
    expect(codec.calls[1]).toBe('encode:jpeg:2000x1500:q=65')
  })

  it('WebP：传入质量', async () => {
    const codec = makeCodec()
    await convertImage(codec, FILE, { mode: 'percentage', percent: 50 }, 'webp', 90)
    expect(codec.calls[1]).toBe('encode:webp:2000x1500:q=90')
  })

  it('GIF 走第一帧分支：decode.firstFrame → outcome.firstFrame', async () => {
    const gif = { name: 'anim.gif', size: 100, type: 'image/gif' } as File
    const codec = makeCodec({
      decode: async () => ({
        source: {} as CanvasImageSource,
        width: 800,
        height: 600,
        firstFrame: true,
      }),
    })
    const outcome = await convertImage(codec, gif, { mode: 'percentage', percent: 100 }, 'webp', 80)
    expect(outcome.firstFrame).toBe(true)
  })

  it('指定宽高锁关：精确 W×H 传入 encode', async () => {
    const codec = makeCodec()
    await convertImage(codec, FILE, { mode: 'dimensions', width: 500, height: 400, lock: false }, 'png', 80)
    expect(codec.calls[1]).toBe('encode:png:500x400:q=none')
  })

  it('计划非法 → ConversionError(invalid-target-size)，encode 不被调用', async () => {
    const codec = makeCodec()
    await expect(convertImage(codec, FILE, { mode: 'longest-edge', edge: 0 }, 'png', 80)).rejects.toMatchObject({
      name: 'ConversionError',
      reason: 'invalid-target-size',
    })
    expect(codec.calls).toEqual(['decode'])
  })

  it('百分比放大越界（逐文件）→ invalid-target-size', async () => {
    const codec = makeCodec({
      decode: async () => ({ source: {} as CanvasImageSource, width: 8000, height: 8000, firstFrame: false }),
    })
    await expect(
      convertImage(codec, FILE, { mode: 'percentage', percent: 10000 }, 'png', 80),
    ).rejects.toMatchObject({ reason: 'invalid-target-size' })
  })

  it('decode 抛结构化错误 → 原样透传', async () => {
    const codec = makeCodec({ decode: async () => { throw new ConversionError('svg-no-size') } })
    await expect(convertImage(codec, FILE, { mode: 'percentage', percent: 50 }, 'png', 80)).rejects.toMatchObject({
      reason: 'svg-no-size',
    })
  })

  it('decode 抛非结构化错误 → 包装为 decode-failed', async () => {
    const codec = makeCodec({ decode: async () => { throw new Error('boom') } })
    await expect(convertImage(codec, FILE, { mode: 'percentage', percent: 50 }, 'png', 80)).rejects.toMatchObject({
      reason: 'decode-failed',
    })
  })

  it('encode 失败 → 结构化 encode-failed', async () => {
    const codec = makeCodec({
      encode: async () => {
        throw new Error('canvas broken')
      },
    })
    await expect(convertImage(codec, FILE, { mode: 'percentage', percent: 50 }, 'webp', 80)).rejects.toMatchObject({
      name: 'ConversionError',
      reason: 'encode-failed',
    })
  })

  it('ConvertOutcome 携带 blob 与目标尺寸', async () => {
    const codec = makeCodec()
    const outcome: ConvertOutcome = await convertImage(
      codec,
      FILE,
      { mode: 'dimensions', width: 1000, height: 1000, lock: true },
      'jpeg',
      80,
    )
    expect(outcome.width).toBe(1000)
    expect(outcome.height).toBe(750)
    expect(outcome.firstFrame).toBe(false)
    expect(outcome.blob).toBeInstanceOf(Blob)
  })
})
