import { describe, expect, it } from 'vitest'
import { buildJpegFixture, cleanJpegFixture, richJpegFixture, richPngFixture, buildPngFixture } from './testFixtures'
import { inspectPhoto } from './inspect'

const RICH_JPEG = richJpegFixture()
const RICH_PNG = buildPngFixture(richPngFixture())

function findEntry(result: { groups: Array<{ id: string; entries: Array<{ key: string; value: string }> }> }, key: string) {
  for (const g of result.groups) {
    const e = g.entries.find((x) => x.key === key)
    if (e) return { group: g.id, ...e }
  }
  return undefined
}

describe('inspectPhoto：JPEG 查看（分组可读视图 + 原始标签）', () => {
  it('机型/曝光字段正确且分组', async () => {
    const r = await inspectPhoto(RICH_JPEG, 'jpeg')
    expect(r.format).toBe('jpeg')
    expect(findEntry(r, 'Make')).toMatchObject({ group: 'camera', value: 'TestCam' })
    expect(findEntry(r, 'Model')).toMatchObject({ group: 'camera', value: 'X100' })
    expect(findEntry(r, 'ISO')).toMatchObject({ group: 'capture', value: '400' })
    expect(findEntry(r, 'FNumber')).toMatchObject({ group: 'capture' })
    expect(findEntry(r, 'ExposureTime')).toMatchObject({ group: 'capture' })
    // orientation 属基本信息组
    expect(findEntry(r, 'Orientation')?.group).toBe('basic')
    // XMP 属性（xmp:Rating）作为元数据条目出现
    expect(findEntry(r, 'Rating')).toMatchObject({ value: '5' })
  })

  it('entryCount = 分组条目总数（残留对比口径）', async () => {
    const r = await inspectPhoto(RICH_JPEG, 'jpeg')
    const total = r.groups.reduce((s, g) => s + g.entries.length, 0)
    expect(r.entryCount).toBe(total)
    expect(r.entryCount).toBeGreaterThan(0)
  })

  it('exifr 计算键（latitude/longitude/errors/icc）不作为条目出现', async () => {
    const r = await inspectPhoto(RICH_JPEG, 'jpeg')
    const keys = r.groups.flatMap((g) => g.entries.map((e) => e.key))
    expect(keys).not.toContain('latitude')
    expect(keys).not.toContain('longitude')
    expect(keys).not.toContain('errors')
    expect(keys).not.toContain('icc')
  })

  it('GPS：十进制度 + DMS（真值 39°54′15″ N / 39.904167°）', async () => {
    const r = await inspectPhoto(RICH_JPEG, 'jpeg')
    expect(r.gps).not.toBeNull()
    expect(r.gps?.lat).toBeCloseTo(39.90416666666, 8)
    expect(r.gps?.lon).toBeCloseTo(116.39138888888, 8)
    expect(r.gps?.decimal).toBe('39.904167° N, 116.391389° E')
    expect(r.gps?.dms).toBe('39°54′15″ N, 116°23′29″ E')
  })

  it('原始标签列表含 tag id（271=Make / 34855=ISO）与名称', async () => {
    const r = await inspectPhoto(RICH_JPEG, 'jpeg')
    const make = r.rawTags.find((t) => t.id === 271)
    expect(make).toMatchObject({ name: 'Make', value: 'TestCam' })
    const iso = r.rawTags.find((t) => t.id === 34855)
    expect(iso?.name).toBe('ISOSpeedRatings') // piexifjs 词典名（原始标签视图口径）
    expect(r.rawTags.some((t) => t.id === undefined)).toBe(true) // XMP 非数值键
  })

  it('ICC（APP2）结构检测 → hasIcc true', async () => {
    expect((await inspectPhoto(RICH_JPEG, 'jpeg')).hasIcc).toBe(true)
    expect((await inspectPhoto(cleanJpegFixture(), 'jpeg')).hasIcc).toBe(false)
  })

  it('无元数据 JPEG → entryCount 0 + gps null（空状态依据）', async () => {
    const r = await inspectPhoto(buildJpegFixture(['app0-jfif', 'dqt', 'sof0', 'dht', 'sos']), 'jpeg')
    expect(r.entryCount).toBe(0)
    expect(r.gps).toBeNull()
    expect(r.rawTags).toEqual([])
  })
})

describe('inspectPhoto：PNG 查看（tEXt/iTXt 文本 + eXIf 词典 + XMP）', () => {
  it('tEXt/iTXt 文本条目 + eXIf 机型字段 + XMP 属性', async () => {
    const r = await inspectPhoto(RICH_PNG, 'png')
    expect(findEntry(r, 'Comment')).toMatchObject({ group: 'basic', value: 'hello world' })
    expect(findEntry(r, 'Description')).toMatchObject({ value: 'some description' })
    expect(findEntry(r, 'Model')).toMatchObject({ group: 'camera', value: 'X100' })
    expect(findEntry(r, 'Rating')).toMatchObject({ value: '3' })
  })

  it('eXIf 内 GPS 正确解析（同一 TIFF 真值）', async () => {
    const r = await inspectPhoto(RICH_PNG, 'png')
    expect(r.gps?.decimal).toBe('39.904167° N, 116.391389° E')
  })

  it('iCCP → hasIcc true', async () => {
    expect((await inspectPhoto(RICH_PNG, 'png')).hasIcc).toBe(true)
  })

  it('原始标签含数值 tag id', async () => {
    const r = await inspectPhoto(RICH_PNG, 'png')
    expect(r.rawTags.some((t) => t.id === 271)).toBe(true)
  })
})

describe('inspectPhoto：TIFF 查看', () => {
  it('机型/曝光/GPS 字段正确', async () => {
    const tiff = (await import('./testFixtures')).buildTiffFixture().bytes
    const r = await inspectPhoto(tiff, 'tiff')
    expect(findEntry(r, 'Make')).toMatchObject({ group: 'camera', value: 'TestCam' })
    expect(r.gps?.decimal).toBe('39.904167° N, 116.391389° E')
    expect(r.entryCount).toBeGreaterThan(0)
  })
})
