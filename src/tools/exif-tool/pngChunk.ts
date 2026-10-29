/**
 * PNG chunk 级操作（纯字节，不依赖 DOM / Node API，可在 node 测试）。
 *
 * 剥除语义（规格 §1/§2）：原生 chunk 重写剥 tEXt / iTXt / zTXt / eXIf；
 * 其余 chunk（含 ICC 的 iCCP、IHDR/IDAT/IEND 等关键块）原样保留——
 * 不重编码像素，逐 chunk 复制（length + type + data + CRC 均不变）。
 */

import { ExifError } from './errors'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 元数据 chunk 白名单外名单：唯一剥除对象。iCCP（ICC）不在其中——白名单唯一保留。 */
const METADATA_CHUNK_TYPES = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf'])

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

/** PNG CRC（反射多项式 0xEDB88320，无符号 32 位）。 */
export function crc32(bytes: ArrayLike<number>): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function readU32be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

export interface PngChunkInfo {
  type: string
  /** 含 length/type/CRC 的整块在原字节流中的区间 [totalStart, totalEnd) */
  totalStart: number
  totalEnd: number
  data: Uint8Array
  crcOk: boolean
}

export type PngParseResult = { ok: true; chunks: PngChunkInfo[] } | { ok: false; reason: 'invalid-signature' | 'truncated' }

/**
 * 解析 PNG chunk 序列。CRC 不匹配不阻断解析（宽松，crcOk 标记）；
 * 签名错误 / 截断为结构错误。
 */
export function parsePngChunks(bytes: Uint8Array): PngParseResult {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) return { ok: false, reason: 'invalid-signature' }
  }
  const chunks: PngChunkInfo[] = []
  let offset = SIGNATURE.length
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return { ok: false, reason: 'truncated' }
    const length = readU32be(bytes, offset)
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    const totalEnd = offset + 12 + length
    if (totalEnd > bytes.length) return { ok: false, reason: 'truncated' }
    const data = bytes.slice(offset + 8, offset + 8 + length)
    const crcStored = readU32be(bytes, offset + 8 + length)
    const crcOk = crc32(bytes.subarray(offset + 4, offset + 8 + length)) === crcStored
    chunks.push({ type, totalStart: offset, totalEnd, data, crcOk })
    offset = totalEnd
  }
  return { ok: true, chunks }
}

export function isMetadataChunkType(type: string): boolean {
  return METADATA_CHUNK_TYPES.has(type)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/**
 * 剥除元数据 chunk：非元数据 chunk 逐字节原样保留（CRC 亦不变）。
 * 结构损坏 → ExifError('corrupt-file')。
 */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const parsed = parsePngChunks(bytes)
  if (!parsed.ok) throw new ExifError('corrupt-file')
  const parts: Uint8Array[] = [bytes.slice(0, SIGNATURE.length)]
  for (const chunk of parsed.chunks) {
    if (isMetadataChunkType(chunk.type)) continue
    parts.push(bytes.slice(chunk.totalStart, chunk.totalEnd))
  }
  return concat(parts)
}

export interface PngTextEntry {
  key: string
  value: string
}

/**
 * 列出 tEXt / iTXt 文本条目（查看侧）。
 * - tEXt 按 Latin-1 解码；iTXt 文本按 UTF-8 解码。
 * - 压缩 iTXt / zTXt（flag=1）跳过展示（剥除仍覆盖）。
 * - XMP 前缀 iTXt 跳过（XMP 属性由 exifr 解析展示，避免重复）。
 */
export function listPngTextEntries(bytes: Uint8Array): PngTextEntry[] {
  const parsed = parsePngChunks(bytes)
  if (!parsed.ok) return []
  const latin1 = new TextDecoder('latin1')
  const utf8 = new TextDecoder('utf-8')
  const entries: PngTextEntry[] = []
  for (const chunk of parsed.chunks) {
    if (chunk.type === 'tEXt') {
      const nul = chunk.data.indexOf(0)
      if (nul < 0) continue
      entries.push({
        key: latin1.decode(chunk.data.slice(0, nul)),
        value: latin1.decode(chunk.data.slice(nul + 1)),
      })
    } else if (chunk.type === 'iTXt') {
      const nul1 = chunk.data.indexOf(0)
      if (nul1 < 0) continue
      const key = latin1.decode(chunk.data.slice(0, nul1))
      if (key.startsWith('XML:com.adobe.xmp')) continue
      // 结构：keyword\0 flag(1B) method(1B) lang\0 translated\0 text
      const flag = chunk.data[nul1 + 1]
      if (flag !== 0) continue // 压缩文本跳过
      const nul2 = chunk.data.indexOf(0, nul1 + 3) // lang 后
      if (nul2 < 0) continue
      const nul3 = chunk.data.indexOf(0, nul2 + 1) // translated 后
      if (nul3 < 0) continue
      entries.push({ key, value: utf8.decode(chunk.data.slice(nul3 + 1)) })
    }
  }
  return entries
}

/** iCCP（ICC 颜色配置文件）chunk 是否存在。 */
export function pngHasIccProfile(bytes: Uint8Array): boolean {
  const parsed = parsePngChunks(bytes)
  if (!parsed.ok) return false
  return parsed.chunks.some((c) => c.type === 'iCCP')
}
