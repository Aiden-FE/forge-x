import { describe, expect, it } from 'vitest'
import {
  buildPngFixture,
  cleanPngFixtureParts,
  concatBytes,
  crc32,
  encodePngChunk,
  PNG_SIGNATURE,
  pngItxtData,
  pngTextData,
  richPngFixture,
} from './testFixtures'
import { listPngTextEntries, parsePngChunks, pngHasIccProfile, stripPngMetadata } from './pngChunk'

const RICH = buildPngFixture(richPngFixture())

describe('parsePngChunks：结构解析（length + type + data + CRC）', () => {
  it('富 fixture → ok，块类型按序，CRC 全部有效', () => {
    const r = parsePngChunks(RICH)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.chunks.map((c) => c.type)).toEqual(['IHDR', 'tEXt', 'iTXt', 'iTXt', 'eXIf', 'iCCP', 'IDAT', 'IEND'])
    expect(r.chunks.every((c) => c.crcOk)).toBe(true)
  })

  it('签名错误 → invalid-signature', () => {
    const bad = new Uint8Array(RICH)
    bad[0] = 0x00
    expect(parsePngChunks(bad)).toEqual({ ok: false, reason: 'invalid-signature' })
  })

  it('截断（chunk 长度越界）→ truncated', () => {
    const r = parsePngChunks(concatBytes([PNG_SIGNATURE, encodePngChunk('IHDR', new Uint8Array(13)).slice(0, 8)]))
    expect(r).toEqual({ ok: false, reason: 'truncated' })
  })

  it('CRC 损坏 → 仍解析（宽松），该块 crcOk=false（不阻断剥除）', () => {
    const corrupted = new Uint8Array(RICH)
    corrupted[corrupted.length - 1] ^= 0xff // IEND 末位 CRC 字节翻转
    const r = parsePngChunks(corrupted)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const iend = r.chunks.find((c) => c.type === 'IEND')
    expect(iend?.crcOk).toBe(false)
    expect(r.chunks.find((c) => c.type === 'IHDR')?.crcOk).toBe(true)
  })
})

describe('stripPngMetadata：原生 chunk 重写剥 tEXt/iTXt/zTXt/eXIf（不重编码像素）', () => {
  it('元数据块消失，关键结构块原样保留', () => {
    const out = stripPngMetadata(RICH)
    const r = parsePngChunks(out)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.chunks.map((c) => c.type)).toEqual(['IHDR', 'iCCP', 'IDAT', 'IEND'])
    expect(r.chunks.every((c) => c.crcOk)).toBe(true)
  })

  it('保留块字节级不变（length/type/data/CRC 逐字节一致）', () => {
    const out = stripPngMetadata(RICH)
    const before = parsePngChunks(RICH)
    const after = parsePngChunks(out)
    expect(before.ok && after.ok).toBe(true)
    if (!before.ok || !after.ok) return
    for (const type of ['IHDR', 'iCCP', 'IDAT', 'IEND']) {
      const a = before.chunks.find((c) => c.type === type)
      const b = after.chunks.find((c) => c.type === type)
      expect(a && b).toBeTruthy()
      if (!a || !b) continue
      expect(RICH.slice(a.totalStart, a.totalEnd)).toEqual(out.slice(b.totalStart, b.totalEnd))
    }
  })

  it('无元数据 PNG → 输出与输入逐字节一致', () => {
    const clean = buildPngFixture(cleanPngFixtureParts())
    expect(stripPngMetadata(clean)).toEqual(clean)
  })

  it('幂等：清除两次 = 清除一次', () => {
    expect(stripPngMetadata(stripPngMetadata(RICH))).toEqual(stripPngMetadata(RICH))
  })

  it('输出重新扫描 → tEXt/iTXt/eXIf 条目为 0', () => {
    const out = stripPngMetadata(RICH)
    expect(listPngTextEntries(out)).toEqual([])
    const r = parsePngChunks(out)
    if (r.ok) {
      expect(r.chunks.some((c) => c.type === 'eXIf')).toBe(false)
    }
  })

  it('结构损坏（截断）→ ExifError(corrupt-file)', () => {
    const truncated = concatBytes([PNG_SIGNATURE, encodePngChunk('IHDR', new Uint8Array(13)).slice(0, 8)])
    expect(() => stripPngMetadata(truncated)).toThrowError(expect.objectContaining({ name: 'ExifError', reason: 'corrupt-file' }))
  })
})

describe('pngHasIccProfile：iCCP 存在性（ICC 白名单保留的结构验证）', () => {
  it('含 iCCP → true', () => {
    expect(pngHasIccProfile(RICH)).toBe(true)
  })

  it('无 iCCP → false', () => {
    const noIcc = buildPngFixture(cleanPngFixtureParts())
    expect(pngHasIccProfile(noIcc)).toBe(false)
  })
})

describe('listPngTextEntries：tEXt / iTXt 文本条目（查看侧）', () => {
  it('解析 tEXt 与未压缩 iTXt', () => {
    const entries = listPngTextEntries(RICH)
    expect(entries).toEqual([
      { key: 'Comment', value: 'hello world' },
      { key: 'Description', value: 'some description' },
    ])
  })

  it('XMP 前缀 iTXt 不进入文本列表（XMP 属性由 exifr 展示，避免重复）', () => {
    const parts = richPngFixture()
    const xmpOnly = buildPngFixture([parts[0], parts[3], { type: 'IEND', data: new Uint8Array(0) }])
    expect(listPngTextEntries(xmpOnly)).toEqual([])
  })

  it('压缩 iTXt（flag=1）跳过展示', () => {
    const compressedItxt = { type: 'iTXt', data: pngItxtData('Secret', 'compressed text', { compressed: true }) }
    const withCompressed = buildPngFixture([
      { type: 'IHDR', data: new Uint8Array(13) },
      { type: 'tEXt', data: pngTextData('Comment', 'visible') },
      compressedItxt,
      { type: 'IEND', data: new Uint8Array(0) },
    ])
    expect(listPngTextEntries(withCompressed)).toEqual([{ key: 'Comment', value: 'visible' }])
  })

  it('CRC 计算真值：空数据 IEND 块的 CRC 为 0xAE426082', () => {
    const iend = encodePngChunk('IEND', new Uint8Array(0))
    expect(crc32(iend.slice(4, 8))).toBe(0xae426082)
  })
})
