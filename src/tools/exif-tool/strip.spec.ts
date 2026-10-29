import { describe, expect, it } from 'vitest'
import { buildJpegFixture, cleanJpegFixture, richJpegFixture } from './testFixtures'
import { jpegHasIccProfile, scanJpegSegments, stripJpegMetadata } from './strip'

const RICH = richJpegFixture()
const MARKER_NAMES: Record<number, string> = {
  0xd8: 'SOI',
  0xe0: 'APP0',
  0xe1: 'APP1',
  0xe2: 'APP2',
  0xe3: 'APP3',
  0xed: 'APP13',
  0xfe: 'COM',
  0xdb: 'DQT',
  0xc0: 'SOF0',
  0xc4: 'DHT',
  0xda: 'SOS',
  0xd9: 'EOI',
}

function markerSequence(bytes: Uint8Array): string[] {
  return scanJpegSegments(bytes).map((s) => MARKER_NAMES[s.marker] ?? `0x${s.marker.toString(16)}`)
}

describe('scanJpegSegments：段级解析', () => {
  it('富 fixture 段序正确（SOI 起步，SOS 后含熵编码数据，EOI 收尾）', () => {
    const segs = scanJpegSegments(RICH)
    expect(segs[0]).toMatchObject({ marker: 0xd8 })
    expect(segs.slice(1).map((s) => s.marker)).toEqual([0xe0, 0xe2, 0xe1, 0xe1, 0xe3, 0xed, 0xfe, 0xdb, 0xc0, 0xc4, 0xda, 0xd9])
  })

  it('SOS 段覆盖其后全部熵编码数据直至 EOI', () => {
    const segs = scanJpegSegments(RICH)
    const sos = segs.find((s) => s.marker === 0xda)
    expect(sos && RICH.slice(sos.totalStart, sos.totalEnd)).toEqual(
      new Uint8Array([0xff, 0xda, 0x00, 0x06, 1, 2, 3, 4, 0x00, 0x11, 0x22, 0x33]),
    )
  })

  it('非 JPEG（无 SOI）→ ExifError(corrupt-file)', () => {
    expect(() => scanJpegSegments(new Uint8Array([1, 2, 3, 4]))).toThrowError(
      expect.objectContaining({ name: 'ExifError', reason: 'corrupt-file' }),
    )
  })

  it('段长度越界（截断）→ ExifError(corrupt-file)', () => {
    const truncated = buildJpegFixture(['app0-jfif']).slice(0, 6)
    expect(() => scanJpegSegments(truncated)).toThrowError(
      expect.objectContaining({ name: 'ExifError', reason: 'corrupt-file' }),
    )
  })
})

describe('stripJpegMetadata：段级无损剥除（不重编码）', () => {
  it('EXIF/XMP(APP1)、APP3、APP13、COM 消失；APP0/APP2(ICC)/DQT/SOF0/DHT/SOS 保留', async () => {
    const out = await stripJpegMetadata(RICH)
    expect(markerSequence(out)).toEqual(['SOI', 'APP0', 'APP2', 'DQT', 'SOF0', 'DHT', 'SOS', 'EOI'])
  })

  it('保留段字节级一致（含 APP2 ICC payload）', async () => {
    const out = await stripJpegMetadata(RICH)
    const before = scanJpegSegments(RICH)
    const after = scanJpegSegments(out)
    for (const type of ['APP0', 'APP2', 'DQT', 'SOF0', 'DHT']) {
      const a = before.find((s) => MARKER_NAMES[s.marker] === type)
      const b = after.find((s) => MARKER_NAMES[s.marker] === type)
      expect(a && b).toBeTruthy()
      if (!a || !b) continue
      expect(RICH.slice(a.totalStart, a.totalEnd)).toEqual(out.slice(b.totalStart, b.totalEnd))
    }
  })

  it('「像素级不变」：SOS 头之后的熵编码扫描数据逐字节一致', async () => {
    const out = await stripJpegMetadata(RICH)
    const before = scanJpegSegments(RICH)
    const after = scanJpegSegments(out)
    const sosBefore = before.find((s) => s.marker === 0xda)
    const sosAfter = after.find((s) => s.marker === 0xda)
    expect(sosBefore && sosAfter).toBeTruthy()
    if (!sosBefore || !sosAfter) return
    const scanBefore = RICH.slice(sosBefore.totalStart, sosBefore.totalEnd)
    const scanAfter = out.slice(sosAfter.totalStart, sosAfter.totalEnd)
    expect(scanAfter).toEqual(scanBefore)
    expect(scanBefore.length).toBe(12)
  })

  it('产物比原体小（剥掉的段不再出现）', async () => {
    const out = await stripJpegMetadata(RICH)
    expect(out.length).toBeLessThan(RICH.length)
  })

  it('无元数据 JPEG → 输出逐字节一致', async () => {
    const clean = cleanJpegFixture()
    expect(await stripJpegMetadata(clean)).toEqual(clean)
  })

  it('幂等：清除两次 = 清除一次', async () => {
    const once = await stripJpegMetadata(RICH)
    expect(await stripJpegMetadata(once)).toEqual(once)
  })

  it('仅有 COM 段（piexifjs remove 不处理的段）也被剥除', async () => {
    const comOnly = buildJpegFixture(['app0-jfif', 'com', 'dqt', 'sos'])
    const out = await stripJpegMetadata(comOnly)
    expect(markerSequence(out)).toEqual(['SOI', 'APP0', 'DQT', 'SOS', 'EOI'])
  })
})

describe('jpegHasIccProfile：APP2/ICC_PROFILE 签名（ICC 白名单保留的结构验证）', () => {
  it('含 ICC APP2 → true', () => {
    expect(jpegHasIccProfile(RICH)).toBe(true)
  })

  it('无 APP2 → false', () => {
    expect(jpegHasIccProfile(cleanJpegFixture())).toBe(false)
  })
})
