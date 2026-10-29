/**
 * 单文件清除编排（可测缝）：查看（残留对比基线）→ 剥除 → 自动重解析验证。
 *
 * - 编排依赖以接口注入（PhotoInspector）：node 测试用桩验证调用顺序与参数；
 *   生产用 exifrInspector（inspect.ts 真实 exifr 解析）。
 * - 「残留 = 0」闭环（见根 CONTEXT.md「残留元数据」）：清除后自动用查看侧重解析产物，
 *   残留条目数必须为 0；验证不过 → verified=false（UI 标错误态，不静默通过）。
 * - 剥除仅 JPEG（piexifjs 段级）/ PNG（chunk 重写）；TIFF 不支持清除。
 */
import { ExifError } from './errors'
import type { InspectResult } from './inspect'
import { inspectPhoto } from './inspect'
import { stripPngMetadata } from './pngChunk'
import { stripJpegMetadata } from './strip'
import type { PhotoFormat } from './validate'

export interface PhotoInspector {
  inspect(bytes: Uint8Array, format: PhotoFormat): Promise<InspectResult>
}

/** 生产查看器：真实 exifr 解析。 */
export const exifrInspector: PhotoInspector = { inspect: inspectPhoto }

export interface StripOutcome {
  /** 清除产物字节（像素级无损：段/块级重写，不重编码） */
  output: Uint8Array
  originalSize: number
  cleanedSize: number
  /** 清除前元数据条目数 */
  entryCountBefore: number
  /** 自动重解析产物所得残留条目数（承诺为 0） */
  residualCount: number
  /** 闭环验证结果：residualCount === 0 */
  verified: boolean
  /** 产物仍携带 ICC（白名单保留验证） */
  hasIcc: boolean
}

export async function stripAndVerify(
  inspector: PhotoInspector,
  bytes: Uint8Array,
  format: PhotoFormat,
): Promise<StripOutcome> {
  if (format !== 'jpeg' && format !== 'png') throw new ExifError('format-not-strippable')

  let before: InspectResult
  try {
    before = await inspector.inspect(bytes, format)
  } catch (e) {
    if (e instanceof ExifError) throw e
    throw new ExifError('view-failed')
  }

  let cleaned: Uint8Array
  try {
    cleaned = format === 'jpeg' ? await stripJpegMetadata(bytes) : stripPngMetadata(bytes)
  } catch (e) {
    if (e instanceof ExifError) throw e
    throw new ExifError('strip-failed')
  }

  let after: InspectResult
  try {
    after = await inspector.inspect(cleaned, format)
  } catch {
    throw new ExifError('residual-not-clean')
  }

  const residualCount = after.entryCount
  return {
    output: cleaned,
    originalSize: bytes.length,
    cleanedSize: cleaned.length,
    entryCountBefore: before.entryCount,
    residualCount,
    verified: residualCount === 0,
    hasIcc: after.hasIcc,
  }
}
