import { describe, expect, it } from 'vitest'
import { OUTPUT_EXT, OUTPUT_MIME, needsQuality, pickBackend } from './encode'

describe('OUTPUT_EXT / OUTPUT_MIME 输出格式词汇', () => {
  it('三种输出格式的 MIME 与扩展名', () => {
    expect(OUTPUT_MIME.png).toBe('image/png')
    expect(OUTPUT_MIME.jpeg).toBe('image/jpeg')
    expect(OUTPUT_MIME.webp).toBe('image/webp')
    expect(OUTPUT_EXT.png).toBe('.png')
    expect(OUTPUT_EXT.jpeg).toBe('.jpg')
    expect(OUTPUT_EXT.webp).toBe('.webp')
  })
})

describe('pickBackend WebP 编码决策（ADR-0001 混合路径）', () => {
  it('原生受支持且未尝试 canvas → canvas', () => {
    expect(pickBackend(true, false)).toBe('canvas')
  })

  it('feature-detect：原生不受支持 → wasm 回退', () => {
    expect(pickBackend(false, false)).toBe('wasm')
  })

  it('原生受支持但 canvas 失败（null/抛错）→ 回退 wasm', () => {
    expect(pickBackend(true, true)).toBe('wasm')
  })
})

describe('needsQuality 质量仅 JPEG/WebP 生效', () => {
  it('PNG 无质量概念 → false', () => {
    expect(needsQuality('png')).toBe(false)
  })

  it('JPEG → true', () => {
    expect(needsQuality('jpeg')).toBe(true)
  })

  it('WebP → true', () => {
    expect(needsQuality('webp')).toBe(true)
  })
})

import { encodeWasm } from './encode'

/** 合成 ImageData（node 环境无 ImageData 构造器，按鸭子类型构造；wasm 编码器只读取 data/width/height）。 */
function makeImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = (x * 4) & 0xff
      data[i + 1] = (y * 4) & 0xff
      data[i + 2] = ((x + y) * 2) & 0xff
      data[i + 3] = 255
    }
  }
  return { data, width, height } as unknown as ImageData
}

describe('encodeWasm jsquash WASM 回退路径（node 环境）', () => {
  it('「Canvas 不支持 webp」分支下产物有效：64×64 色块 → RIFF....WEBP magic', async () => {
    const blob = await encodeWasm(makeImageData(64, 64), 80)
    expect(blob.type).toBe('image/webp')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(12)
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('RIFF')
    expect(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])).toBe('WEBP')
  }, 30000)

  it('质量参数生效：高质量 ≥ 低质量文件大小', async () => {
    const img = makeImageData(64, 64)
    const low = await encodeWasm(img, 10)
    const high = await encodeWasm(img, 95)
    expect(high.size).toBeGreaterThanOrEqual(low.size)
  }, 30000)
})
