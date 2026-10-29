/**
 * 测试专用 fixture 构造器（纯字节手工构造，不依赖解码器 / Image API）。
 *
 * 全部为手工二进制：
 * - TIFF：小端（II），IFD0 + Exif IFD + GPS IFD；短值（≤4 字节）按 TIFF 规范内联存储。
 * - JPEG：段 = FFD8 + (marker + BE 长度 + payload)；SOS 后为熵编码数据 + EOI。
 * - PNG：signature + chunk（BE 长度 + type + data + CRC，CRC 表手写）。
 *
 * 真值锚点：GPS [39,54,15]'N' / [116,23,29]'E' → 39.904166…° / 116.391388…°。
 */
import { deflateSync } from 'node:zlib'

export const u16le = (v: number): Uint8Array => new Uint8Array([v & 0xff, (v >> 8) & 0xff])
export const u32le = (v: number): Uint8Array => new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff])
export const u16be = (v: number): Uint8Array => new Uint8Array([(v >> 8) & 0xff, v & 0xff])
export const u32be = (v: number): Uint8Array => new Uint8Array([(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff])

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const a of parts) {
    out.set(a, o)
    o += a.length
  }
  return out
}

const enc = new TextEncoder()

/** ASCII + 终止 NUL（TIFF ASCII 值惯例）。 */
const asciiZ = (s: string): Uint8Array => concatBytes([enc.encode(s), new Uint8Array([0])])

/* ---------------- CRC32（PNG，反射多项式 0xEDB88320） ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

export function crc32(bytes: ArrayLike<number>): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ (bytes as Uint8Array)[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/* ---------------- TIFF ---------------- */

export interface TiffFixture {
  bytes: Uint8Array
  /** IFD0 中 Make/Model 等标签真值，供断言 */
  make: string
  model: string
  iso: number
}

/**
 * 最小合法 TIFF（小端）：
 * IFD0: Make='TestCam', Model='X100', Orientation=6, ExifIFD 指针, GPSIFD 指针
 * ExifIFD: ExposureTime=1/250, FNumber=2.8, ISO=400
 * GPSIFD: LatitudeRef='N', Latitude=[39,54,15], LongitudeRef='E', Longitude=[116,23,29]
 */
export function buildTiffFixture(): TiffFixture {
  const IFD0 = 8
  const EXIF_OFF = IFD0 + 2 + 5 * 12 + 4
  const GPS_OFF = EXIF_OFF + 2 + 3 * 12 + 4
  const DATA = GPS_OFF + 2 + 4 * 12 + 4

  const make = asciiZ('TestCam')
  const model = asciiZ('X100')
  const expTime = concatBytes([u32le(1), u32le(250)])
  const fNumber = concatBytes([u32le(28), u32le(10)])
  const latR = concatBytes([u32le(39), u32le(1), u32le(54), u32le(1), u32le(15), u32le(1)])
  const lonR = concatBytes([u32le(116), u32le(1), u32le(23), u32le(1), u32le(29), u32le(1)])

  let o = DATA
  const makeOff = o
  o += make.length
  const modelOff = o
  o += model.length
  const expOff = o
  o += expTime.length
  const fnOff = o
  o += fNumber.length
  const latOff = o
  o += latR.length
  const lonOff = o
  o += lonR.length

  // tag entry: tag u16, type u16, count u32, value/offset u32（值 ≤4 字节内联左对齐）
  const entry = (tag: number, type: number, count: number, field: Uint8Array): Uint8Array =>
    concatBytes([u16le(tag), u16le(type), u32le(count), field])

  const ifd0 = concatBytes([
    u16le(5),
    entry(0x010f, 2, make.length, u32le(makeOff)),
    entry(0x0110, 2, model.length, u32le(modelOff)),
    entry(0x0112, 3, 1, concatBytes([u16le(6), u16le(0)])),
    entry(0x8769, 4, 1, u32le(EXIF_OFF)),
    entry(0x8825, 4, 1, u32le(GPS_OFF)),
    u32le(0),
  ])

  const exifIfd = concatBytes([
    u16le(3),
    entry(0x829a, 5, 1, u32le(expOff)),
    entry(0x829d, 5, 1, u32le(fnOff)),
    entry(0x8827, 3, 1, concatBytes([u16le(400), u16le(0)])),
    u32le(0),
  ])

  const gpsIfd = concatBytes([
    u16le(4),
    entry(0x0001, 2, 2, concatBytes([new Uint8Array([0x4e, 0x00]), u16le(0)])), // 'N\0' 内联
    entry(0x0002, 5, 3, u32le(latOff)),
    entry(0x0003, 2, 2, concatBytes([new Uint8Array([0x45, 0x00]), u16le(0)])), // 'E\0' 内联
    entry(0x0004, 5, 3, u32le(lonOff)),
    u32le(0),
  ])

  return {
    bytes: concatBytes([
      new Uint8Array([0x49, 0x49, 0x2a, 0x00]),
      u32le(8),
      ifd0,
      exifIfd,
      gpsIfd,
      make,
      model,
      expTime,
      fNumber,
      latR,
      lonR,
    ]),
    make: 'TestCam',
    model: 'X100',
    iso: 400,
  }
}

/* ---------------- JPEG ---------------- */

export type JpegPartKind =
  | 'app0-jfif'
  | 'app1-exif'
  | 'app1-xmp'
  | 'app2-icc'
  | 'app3'
  | 'app13'
  | 'com'
  | 'dqt'
  | 'sof0'
  | 'dht'
  | 'sos'

const XMP_XML =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmp:Rating="5"/></rdf:RDF></x:xmpmeta>'

const XMP_XML_PNG =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmp:Rating="3"/></rdf:RDF></x:xmpmeta>'

/** 结构合法的最小 ICC profile（132B 头 + 0 个 tag），仅用于结构保留验证。 */
export function minimalIccProfile(): Uint8Array {
  const p = new Uint8Array(132)
  const view = new DataView(p.buffer)
  view.setUint32(0, 132, false)
  view.setUint32(8, 0x02100000, false)
  p.set(enc.encode('mntr'), 12)
  p.set(enc.encode('RGB '), 16)
  p.set(enc.encode('XYZ '), 20)
  p.set(enc.encode('acsp'), 36)
  p.set(enc.encode('APPL'), 40)
  view.setUint32(68, 0xf6d6, false) // D50 X
  view.setUint32(72, 0x010000, false) // D50 Y
  view.setUint32(76, 0xd32d, false) // D50 Z
  return p
}

const jpegSegment = (marker: number, payload: Uint8Array): Uint8Array =>
  concatBytes([new Uint8Array([0xff, marker]), u16be(payload.length + 2), payload])

function jpegPart(kind: JpegPartKind): Uint8Array {
  switch (kind) {
    case 'app0-jfif':
      return jpegSegment(0xe0, concatBytes([enc.encode('JFIF\0'), new Uint8Array([1, 2, 1, 0, 1, 0, 1, 0, 0])]))
    case 'app1-exif':
      return jpegSegment(0xe1, concatBytes([enc.encode('Exif\0\0'), buildTiffFixture().bytes]))
    case 'app1-xmp':
      return jpegSegment(0xe1, concatBytes([enc.encode('http://ns.adobe.com/xap/1.0/\0'), enc.encode(XMP_XML)]))
    case 'app2-icc':
      return jpegSegment(0xe2, concatBytes([enc.encode('ICC_PROFILE\0'), new Uint8Array([1, 1]), deflateSync(minimalIccProfile())]))
    case 'app3':
      return jpegSegment(0xe3, enc.encode('junk-private'))
    case 'app13':
      return jpegSegment(0xed, enc.encode('Photoshop 3.0\0' + '8BIM\x04\x04\0\0\0\0\0\0'))
    case 'com':
      return jpegSegment(0xfe, enc.encode('hidden comment'))
    case 'dqt':
      return jpegSegment(0xdb, new Uint8Array([0, 1, 2, 3]))
    case 'sof0':
      return jpegSegment(0xc0, new Uint8Array([8, 0, 1, 1, 3, 0, 0, 0, 0]))
    case 'dht':
      return jpegSegment(0xc4, new Uint8Array([0, 1, 2, 3]))
    case 'sos':
      return jpegSegment(0xda, new Uint8Array([1, 2, 3, 4]))
  }
}

/** SOI + 指定段 + 熵编码数据 + EOI。熵编码数据固定 [0x00,0x11,0x22,0x33]。 */
export function buildJpegFixture(parts: JpegPartKind[]): Uint8Array {
  return concatBytes([
    new Uint8Array([0xff, 0xd8]),
    ...parts.map(jpegPart),
    new Uint8Array([0x00, 0x11, 0x22, 0x33]),
    new Uint8Array([0xff, 0xd9]),
  ])
}

/** 元数据齐全的「富」fixture：EXIF + GPS + XMP + APP13 + COM + ICC 全带。 */
export function richJpegFixture(): Uint8Array {
  return buildJpegFixture(['app0-jfif', 'app2-icc', 'app1-exif', 'app1-xmp', 'app3', 'app13', 'com', 'dqt', 'sof0', 'dht', 'sos'])
}

/** 无元数据 JPEG：仅 JFIF 结构 + 扫描数据。 */
export function cleanJpegFixture(): Uint8Array {
  return buildJpegFixture(['app0-jfif', 'dqt', 'sof0', 'dht', 'sos'])
}

/* ---------------- PNG ---------------- */

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface PngPart {
  type: string
  data: Uint8Array
}

export function pngIhdrData(): Uint8Array {
  return concatBytes([u32be(1), u32be(1), new Uint8Array([8, 2, 0, 0, 0])])
}

export function pngTextData(key: string, value: string): Uint8Array {
  return concatBytes([enc.encode(key), new Uint8Array([0]), enc.encode(value)])
}

/** iTXt：key\0 flag\0 method\0 lang\0 translated\0 text。 */
export function pngItxtData(key: string, text: string, opts: { compressed?: boolean; xmpPrefix?: boolean } = {}): Uint8Array {
  const body = opts.compressed ? deflateSync(enc.encode(text)) : enc.encode(text)
  const prefixKey = opts.xmpPrefix ? 'XML:com.adobe.xmp' : key
  return concatBytes([
    enc.encode(prefixKey),
    new Uint8Array([0]),
    new Uint8Array([opts.compressed ? 1 : 0]),
    new Uint8Array([0]),
    new Uint8Array([0]),
    new Uint8Array([0]),
    body,
  ])
}

export function pngIccpData(name = 'icc'): Uint8Array {
  return concatBytes([enc.encode(name), new Uint8Array([0, 0]), deflateSync(minimalIccProfile())])
}

/** eXIf chunk 数据 = TIFF fixture 原样嵌入。 */
export function pngExifData(): Uint8Array {
  return buildTiffFixture().bytes
}

export function pngIdatData(): Uint8Array {
  return deflateSync(new Uint8Array([0, 255, 0, 0, 0, 255]))
}

export function encodePngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = concatBytes([enc.encode(type), data])
  return concatBytes([u32be(data.length), body, u32be(crc32(body))])
}

/** signature + chunks。 */
export function buildPngFixture(parts: PngPart[]): Uint8Array {
  return concatBytes([PNG_SIGNATURE, ...parts.map((p) => encodePngChunk(p.type, p.data))])
}

/** 元数据齐全的「富」PNG：tEXt + iTXt + XMP iTXt + eXIf + iCCP + 图像结构块。 */
export function richPngFixture(): PngPart[] {
  return [
    { type: 'IHDR', data: pngIhdrData() },
    { type: 'tEXt', data: pngTextData('Comment', 'hello world') },
    { type: 'iTXt', data: pngItxtData('Description', 'some description') },
    { type: 'iTXt', data: pngItxtData('ignored', XMP_XML_PNG, { xmpPrefix: true }) },
    { type: 'eXIf', data: pngExifData() },
    { type: 'iCCP', data: pngIccpData() },
    { type: 'IDAT', data: pngIdatData() },
    { type: 'IEND', data: new Uint8Array(0) },
  ]
}

export function cleanPngFixtureParts(): PngPart[] {
  return [
    { type: 'IHDR', data: pngIhdrData() },
    { type: 'IDAT', data: pngIdatData() },
    { type: 'IEND', data: new Uint8Array(0) },
  ]
}
