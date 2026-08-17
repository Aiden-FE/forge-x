/**
 * 生成 e2e 测试图像夹具（node 直接运行；GIF 用 omggif 独立解码校验）。
 *
 * - sample.png: 64×64 RGB 渐变
 * - sample.gif: 8×8 单色（GIF89a，LZW）
 * - oversize.png: 8193×1（超过 8192px 上限）
 * - sample.svg: 24×24 声明尺寸（SVG 栅格化尺寸验证）
 * - noise.gif: 32×32 双色随机噪声（负压缩率验证：噪声图转 WebP 会变大）
 *
 * 用法: node e2e/fixtures/make-fixtures.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import omggif from 'omggif'

const { GifReader } = omggif

const outDir = dirname(fileURLToPath(import.meta.url))

// ---------- PNG ----------
let crcTable
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, pixelFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  const stride = 1 + width * 3
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y)
      const o = y * stride + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}

// ---------- GIF ----------
/** GIF LZW 压缩（规范实现；码长扩展时机与浏览器解码器对齐）。 */
function gifLzwEncode(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  const dict = new Map()
  for (let i = 0; i < clearCode; i++) dict.set(String(i), i)
  const bits = []

  const emit = (code) => {
    for (let i = 0; i < codeSize; i++) bits.push((code >> i) & 1)
    // 参考实现（giflib）语义：写完该码后，若下一个可用码号达到当前位长上限，
    // 则扩展位长（对后续码生效）；插入新串在 emit 之后发生
    if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize++
  }

  const resetDict = () => {
    dict.clear()
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i)
    nextCode = eoiCode + 1
    codeSize = minCodeSize + 1
  }

  emit(clearCode)
  let w = ''
  for (const p of pixels) {
    const key = w + p
    if (dict.has(key)) {
      w = key
      continue
    }
    emit(dict.get(w))
    if (nextCode >= 4095) {
      // 码表满 12 位：发 clear 复位
      emit(clearCode)
      resetDict()
    } else {
      dict.set(key, nextCode++)
    }
    w = String(p)
  }
  if (w !== '') emit(dict.get(w))
  emit(eoiCode)

  const bytes = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) if (i + j < bits.length) b |= bits[i + j] << j
    bytes.push(b)
  }
  return bytes
}

/** 用 omggif（独立参考实现）解码 GIF 首帧，返回 RGBA 像素数组。 */
function gifDecodePixels(gif, expectedW, expectedH) {
  const reader = new GifReader(gif)
  if (reader.width !== expectedW || reader.height !== expectedH) {
    throw new Error(`gif: unexpected size ${reader.width}x${reader.height}`)
  }
  const buf = new Uint8Array(reader.width * reader.height * 4)
  reader.decodeAndBlitFrameRGBA(0, buf)
  return buf
}

function encodeGif(width, height, pixels, gct) {
  const header = Buffer.from('GIF89a', 'ascii')
  const lsd = Buffer.alloc(7)
  lsd.writeUInt16LE(width, 0)
  lsd.writeUInt16LE(height, 2)
  lsd[4] = 0x80 | (Math.log2(gct.length) - 1) // GCT flag + size
  const gctBuf = Buffer.alloc(gct.length * 3)
  gct.forEach(([r, g, b], i) => {
    gctBuf[i * 3] = r
    gctBuf[i * 3 + 1] = g
    gctBuf[i * 3 + 2] = b
  })
  const id = Buffer.from([0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  id.writeUInt16LE(width, 5)
  id.writeUInt16LE(height, 7)
  const minCodeSize = Math.max(2, Math.ceil(Math.log2(gct.length)))
  const lzw = Buffer.from(gifLzwEncode(pixels, minCodeSize))
  const blocks = []
  for (let i = 0; i < lzw.length; i += 0xff) {
    const slice = lzw.subarray(i, Math.min(i + 0xff, lzw.length))
    blocks.push(Buffer.from([slice.length, ...slice]))
  }
  return Buffer.concat([
    header,
    lsd,
    gctBuf,
    id,
    Buffer.from([minCodeSize]),
    ...blocks,
    Buffer.from([0x00]),
    Buffer.from([0x3b]),
  ])
}

// ---------- PRNG ----------
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- 生成 ----------
mkdirSync(outDir, { recursive: true })

// sample.png: 64×64 渐变
const samplePng = encodePng(64, 64, (x, y) => [x * 4, y * 4, (x + y) * 2])
writeFileSync(join(outDir, 'sample.png'), samplePng)

// sample.gif: 8×8 红色
const gifPixels = new Array(64).fill(0)
const gif = encodeGif(8, 8, gifPixels, [[255, 0, 0], [255, 255, 255]])
const decodedPixels = gifDecodePixels(gif, 8, 8)
if (
  decodedPixels.length !== 64 * 4 ||
  decodedPixels.some((v, i) => v !== (i % 4 === 0 ? 255 : i % 4 === 3 ? 255 : 0))
) {
  throw new Error('gif validation failed: omggif decoded unexpected pixels')
}
writeFileSync(join(outDir, 'sample.gif'), gif)

// oversize.png: 8193×1
const oversize = encodePng(8193, 1, (x) => [x % 256, 128, 255 - (x % 256)])
writeFileSync(join(outDir, 'oversize.png'), oversize)

// sample.svg: 24×24 声明尺寸
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#ff5533"/></svg>`
writeFileSync(join(outDir, 'sample.svg'), Buffer.from(svg, 'utf8'))

// noise.gif: 32×32 双色随机噪声（确定性种子），用于负压缩率断言
const rng = mulberry32(0x5eed)
const noisePixels = Array.from({ length: 32 * 32 }, () => (rng() < 0.5 ? 0 : 1))
const noiseGif = encodeGif(32, 32, noisePixels, [[0, 0, 0], [255, 255, 255]])
gifDecodePixels(noiseGif, 32, 32)
writeFileSync(join(outDir, 'noise.gif'), noiseGif)

console.log(`sample.png: ${samplePng.length} bytes`)
console.log(`sample.gif: ${gif.length} bytes (omggif validation OK)`)
console.log(`oversize.png: ${oversize.length} bytes`)
console.log(`sample.svg: ${svg.length} bytes`)
console.log(`noise.gif: ${noiseGif.length} bytes (omggif validation OK)`)
