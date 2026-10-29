/**
 * JPEG 段级剥除（纯字符串/字节域，不重编码——像素级无损承诺）。
 *
 * 依赖 piexifjs（平台硬约定：dynamic import 首用加载）做 APP1:Exif 段剥除；
 * 其余元数据段由本模块段级走查处理（XMP 亦居 APP1；APP3–APP15 元数据载体；
 * COM 注释段）。保留白名单：APP0（JFIF 结构）+ APP2（ICC 颜色配置文件）——
 * 白名单只给 ICC 一个（见根 CONTEXT.md「颜色配置文件」）。
 */

import { ExifError } from './errors'

/* ---------------- piexifjs 首用加载（参照 csv-json loadPapa 模式） ---------------- */

interface PiexifApi {
  remove(jpeg: string): string
  ImageIFD: Record<number, string>
  ExifIFD: Record<number, string>
  GPSIFD: Record<number, string>
}

let piexifPromise: Promise<PiexifApi> | null = null

export function loadPiexif(): Promise<PiexifApi> {
  piexifPromise ??= (async () => {
    const mod = (await import('piexifjs')) as unknown as { default?: PiexifApi } & Partial<PiexifApi>
    const api = mod.default ?? mod
    if (!api || typeof api.remove !== 'function') throw new ExifError('strip-failed')
    return api as PiexifApi
  })()
  return piexifPromise
}

/* ---------------- 字节 ↔ 二进制字符串（piexifjs 的字符串域） ---------------- */

function bytesToBinaryString(bytes: Uint8Array): string {
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
    out += String.fromCharCode(...slice)
  }
  return out
}

function binaryStringToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

/* ---------------- 段级扫描 ---------------- */

export interface JpegSegmentInfo {
  marker: number
  /** 含 marker 与长度字段的整段区间 [totalStart, totalEnd) */
  totalStart: number
  totalEnd: number
  /** 段 payload 区间（SOS 为熵编码数据区间） */
  dataStart: number
  dataEnd: number
}

/**
 * 扫描 JPEG 段序列（SOI 起步，EOI 收尾）。
 * - SOS 段覆盖其头部 + 熵编码数据（跳过 FF00 填充与 RSTn），到下一个真实 marker 为止。
 * - 结构损坏（无 SOI / 长度越界 / 游离字节）→ ExifError('corrupt-file')。
 */
export function scanJpegSegments(bytes: Uint8Array): JpegSegmentInfo[] {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ExifError('corrupt-file')
  const segments: JpegSegmentInfo[] = [{ marker: 0xd8, totalStart: 0, totalEnd: 2, dataStart: 2, dataEnd: 2 }]
  let pos = 2
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) throw new ExifError('corrupt-file')
    let markerPos = pos
    while (markerPos < bytes.length && bytes[markerPos] === 0xff) markerPos++
    if (markerPos >= bytes.length) throw new ExifError('corrupt-file')
    const marker = bytes[markerPos]
    if (marker === 0x00 || marker === 0xff) throw new ExifError('corrupt-file')
    const segStart = markerPos - 1

    if (marker === 0xd9) {
      // EOI
      segments.push({ marker, totalStart: segStart, totalEnd: segStart + 2, dataStart: segStart, dataEnd: segStart + 2 })
      pos = segStart + 2
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // 无长度字段的独立 marker（TEM / RSTn）
      segments.push({ marker, totalStart: segStart, totalEnd: markerPos + 1, dataStart: markerPos + 1, dataEnd: markerPos + 1 })
      pos = markerPos + 1
      continue
    }
    const lenPos = markerPos + 1
    if (lenPos + 2 > bytes.length) throw new ExifError('corrupt-file')
    const length = (bytes[lenPos] << 8) | bytes[lenPos + 1] // 含长度字段自身 2 字节
    const headerEnd = lenPos + length
    if (length < 2 || headerEnd > bytes.length) throw new ExifError('corrupt-file')

    if (marker === 0xda) {
      // SOS：头部后为熵编码数据；FF00/RSTn 为填充，下一个真实 marker 结束熵数据
      let i = headerEnd
      while (i + 1 < bytes.length) {
        if (bytes[i] !== 0xff) {
          i++
          continue
        }
        const next = bytes[i + 1]
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          i += 2
          continue
        }
        break
      }
      segments.push({ marker, totalStart: segStart, totalEnd: i, dataStart: headerEnd, dataEnd: i })
      pos = i
      continue
    }

    segments.push({ marker, totalStart: segStart, totalEnd: headerEnd, dataStart: lenPos + 2, dataEnd: headerEnd })
    pos = headerEnd
  }
  return segments
}

/* ---------------- 剥除 ---------------- */

/** APP 段保留白名单：APP0（JFIF 结构）+ APP2（ICC）。 */
const KEEP_APP_MARKERS = new Set([0xe0, 0xe2])
const COM_MARKER = 0xfe

/**
 * 段级重建：剥除元数据 APP 段（APP1/APP3–APP15）与 COM，其余段逐字节保留。
 */
export function stripJpegSegments(bytes: Uint8Array): Uint8Array {
  const segments = scanJpegSegments(bytes)
  const parts: Uint8Array[] = []
  for (const seg of segments) {
    const isApp = seg.marker >= 0xe0 && seg.marker <= 0xef
    if ((isApp && !KEEP_APP_MARKERS.has(seg.marker)) || seg.marker === COM_MARKER) continue
    parts.push(bytes.slice(seg.totalStart, seg.totalEnd))
  }
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/**
 * JPEG 元数据剥除（异步：piexifjs 首用 dynamic import）。
 * 第一段 piexifjs remove 剥 APP1:Exif；第二段走查剥 XMP(APP1)/APP3–APP15/COM。
 * 只做段级操作，不重编码；产物解码后像素与原体逐像素一致。
 */
export async function stripJpegMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const piexif = await loadPiexif()
  let afterPiexif: Uint8Array
  try {
    afterPiexif = binaryStringToBytes(piexif.remove(bytesToBinaryString(bytes)))
  } catch {
    throw new ExifError('corrupt-file')
  }
  return stripJpegSegments(afterPiexif)
}

/* ---------------- ICC 结构检测 ---------------- */

const ICC_PROFILE_SIG = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00] // 'ICC_PROFILE\0'

/** JPEG 是否携带 ICC 颜色配置文件（APP2 + ICC_PROFILE 签名）。 */
export function jpegHasIccProfile(bytes: Uint8Array): boolean {
  try {
    for (const seg of scanJpegSegments(bytes)) {
      if (seg.marker !== 0xe2) continue
      const payload = bytes.subarray(seg.dataStart, seg.dataEnd)
      if (payload.length < ICC_PROFILE_SIG.length) continue
      let match = true
      for (let i = 0; i < ICC_PROFILE_SIG.length; i++) {
        if (payload[i] !== ICC_PROFILE_SIG[i]) {
          match = false
          break
        }
      }
      if (match) return true
    }
  } catch {
    return false
  }
  return false
}
