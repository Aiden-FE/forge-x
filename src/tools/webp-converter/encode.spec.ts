import { describe, expect, it } from 'vitest'
import { pickBackend } from './encode'

describe('pickBackend 编码决策', () => {
  it('原生受支持且未尝试 canvas → canvas', () => {
    expect(pickBackend(true, false)).toBe('canvas')
  })

  it('原生不受支持 → wasm', () => {
    expect(pickBackend(false, false)).toBe('wasm')
  })

  it('原生受支持但 canvas 失败（null/抛错）→ 回退 wasm', () => {
    expect(pickBackend(true, true)).toBe('wasm')
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

describe('encodeWasm WASM 编码（node 环境）', () => {
  it('64×64 色块 → 有效 WebP（RIFF....WEBP magic）', async () => {
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
