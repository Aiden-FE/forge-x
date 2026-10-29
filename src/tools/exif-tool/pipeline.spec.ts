import { describe, expect, it, vi } from 'vitest'
import { cleanJpegFixture, cleanPngFixtureParts, buildPngFixture, richJpegFixture, richPngFixture } from './testFixtures'
import type { InspectResult } from './inspect'
import type { PhotoInspector, StripOutcome } from './pipeline'
import { exifrInspector, stripAndVerify } from './pipeline'

/* ---------- 编排测试：注入桩 inspector（node 环境闭环全真另有用例） ---------- */

function stubInspector(canned: Array<Pick<InspectResult, 'entryCount' | 'hasIcc'>>): PhotoInspector & { calls: number[] } {
  let i = 0
  return {
    calls: [],
    inspect: vi.fn(async (_bytes, format) => {
      const c = canned[Math.min(i, canned.length - 1)]
      i++
      return {
        format,
        entryCount: c.entryCount,
        hasIcc: c.hasIcc,
        groups: [],
        rawTags: [],
        gps: null,
      }
    }),
  }
}

const RICH_JPEG = richJpegFixture()
const RICH_PNG = buildPngFixture(richPngFixture())

describe('stripAndVerify 编排（注入桩）', () => {
  it('调用顺序 原体 inspect → strip → 产物 inspect；结果携带前后条目数与 hasIcc', async () => {
    const inspector = stubInspector([{ entryCount: 5, hasIcc: true }, { entryCount: 0, hasIcc: true }])
    const outcome = await stripAndVerify(inspector, RICH_JPEG, 'jpeg')
    expect(inspector.inspect).toHaveBeenCalledTimes(2)
    expect(outcome).toMatchObject({
      entryCountBefore: 5,
      residualCount: 0,
      verified: true,
      hasIcc: true,
      originalSize: RICH_JPEG.length,
      cleanedSize: outcome.output.length,
    })
    expect(outcome.cleanedSize).toBeLessThan(RICH_JPEG.length)
  })

  it('残留 > 0 → verified=false（UI 标错误态，不静默通过）', async () => {
    const inspector = stubInspector([{ entryCount: 5, hasIcc: false }, { entryCount: 2, hasIcc: false }])
    const outcome = await stripAndVerify(inspector, RICH_JPEG, 'jpeg')
    expect(outcome.verified).toBe(false)
    expect(outcome.residualCount).toBe(2)
  })

  it('TIFF → ExifError(format-not-strippable)，不触碰字节', async () => {
    const inspector = stubInspector([{ entryCount: 3, hasIcc: false }])
    await expect(stripAndVerify(inspector, RICH_JPEG, 'tiff')).rejects.toMatchObject({
      name: 'ExifError',
      reason: 'format-not-strippable',
    })
    expect(inspector.inspect).not.toHaveBeenCalled()
  })

  it('原体解析失败 → ExifError(view-failed)', async () => {
    const inspector: PhotoInspector = {
      inspect: async () => {
        throw new Error('boom')
      },
    }
    await expect(stripAndVerify(inspector, RICH_JPEG, 'png')).rejects.toMatchObject({
      name: 'ExifError',
      reason: 'view-failed',
    })
  })
})

/* ---------- 真实闭环（exifr 重解析真产物）：「残留 = 0」+ ICC 保留 ---------- */

describe('stripAndVerify 真实闭环（real strip + real exifr inspect）', () => {
  it('JPEG 富 fixture：清除后自动重解析 → 残留 0，ICC 保留，尺寸变小', async () => {
    const outcome: StripOutcome = await stripAndVerify(exifrInspector, RICH_JPEG, 'jpeg')
    expect(outcome.verified).toBe(true)
    expect(outcome.entryCountBefore).toBeGreaterThan(0)
    expect(outcome.residualCount).toBe(0)
    expect(outcome.hasIcc).toBe(true)
    expect(outcome.cleanedSize).toBeLessThan(RICH_JPEG.length)
  })

  it('PNG 富 fixture：清除后自动重解析 → 残留 0，iCCP 保留', async () => {
    const outcome = await stripAndVerify(exifrInspector, RICH_PNG, 'png')
    expect(outcome.verified).toBe(true)
    expect(outcome.entryCountBefore).toBeGreaterThan(0)
    expect(outcome.residualCount).toBe(0)
    expect(outcome.hasIcc).toBe(true)
  })

  it('干净文件：前后都是 0 条，仍通过', async () => {
    const outcome = await stripAndVerify(exifrInspector, cleanJpegFixture(), 'jpeg')
    expect(outcome.entryCountBefore).toBe(0)
    expect(outcome.residualCount).toBe(0)
    expect(outcome.verified).toBe(true)
  })

  it('PNG 幂等闭环：清除两次仍为 0 条', async () => {
    const once = await stripAndVerify(exifrInspector, RICH_PNG, 'png')
    const twice = await stripAndVerify(exifrInspector, once.output, 'png')
    expect(twice.residualCount).toBe(0)
    expect(twice.verified).toBe(true)
  })

  it('干净 PNG（无元数据结构块）也走闭环', async () => {
    const outcome = await stripAndVerify(exifrInspector, buildPngFixture(cleanPngFixtureParts()), 'png')
    expect(outcome.verified).toBe(true)
    expect(outcome.hasIcc).toBe(false)
  })
})
