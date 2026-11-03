/**
 * 单文件转换编排（可测缝）：decode → 编辑（裁剪 → 旋转）→ 缩放计算 → encode。
 *
 * - 编解码器以接口注入：测试用桩验证调用顺序与参数（node 环境无 Canvas/Image），
 *   生产用 browserCodec（decode.ts + encode.ts）。
 * - 编辑段（文件级参数，CONTEXT.md「图像管线」）：裁剪 → 旋转，发生在缩放计算之前；
 *   裁剪框像素 = 缩放阶段的输入边界，旋转 90° 交换宽高后进入缩放计算。
 * - 缩放计划 → 目标尺寸按编辑后尺寸逐文件计算；非法（0/负/超 65500 单边）→
 *   结构化错误，不触碰已转换结果。
 * - 质量仅 JPEG/WebP 传入（PNG 无质量概念，传 null）。
 * - outcome.source 恒为解码原图（非编辑后画布）：重新转换需按最新的文件级
 *   裁剪/旋转参数重新应用编辑，不能用上次编辑的产物。
 */
import type { OutputFormat } from './encode'
import { needsQuality } from './encode'
import { ConversionError } from './errors'
import type { ImageEdit } from './edit'
import { editedDims, hasEdit } from './edit'
import type { ResizePlan } from './resize'
import { computeTargetSize } from './resize'

export interface SourceImage {
  source: CanvasImageSource
  width: number
  height: number
  /** 输入为动画图片（GIF / 动画 WebP）时为 true，仅取第一帧 */
  firstFrame: boolean
}

export interface ImageCodec {
  decode(file: File): Promise<SourceImage>
  encode(source: CanvasImageSource, width: number, height: number, format: OutputFormat, quality: number | null): Promise<Blob>
  /** 管线编辑段（裁剪 → 旋转）；仅当文件带文件级参数时被调用。 */
  edit?(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, edit: ImageEdit): Promise<SourceImage>
}

export interface ConvertOutcome {
  blob: Blob
  /** 目标（输出）尺寸 */
  width: number
  height: number
  /** 解码出的原始尺寸（UI 展示「原始 → 转换」与尺寸变化比） */
  sourceWidth: number
  sourceHeight: number
  /** 解码产物（保留供重新转换，避免二次解码） */
  source: CanvasImageSource
  firstFrame: boolean
}

/** 生产编解码器：DOM 解码 + 编辑段画布 + 混合路径编码。 */
export const browserCodec: ImageCodec = {
  async decode(file) {
    const { decodeImage } = await import('./decode')
    const decoded = await decodeImage(file)
    return { source: decoded.canvas, width: decoded.width, height: decoded.height, firstFrame: decoded.firstFrame }
  },
  async encode(source, width, height, format, quality) {
    const { encodeImage } = await import('./encode')
    return encodeImage(source, width, height, format, quality)
  },
  async edit(source, sourceWidth, sourceHeight, edit) {
    const { editCanvasImage } = await import('./edit')
    const out = editCanvasImage(source, sourceWidth, sourceHeight, edit)
    return { source: out.canvas, width: out.width, height: out.height, firstFrame: false }
  },
}

/**
 * 编排：decode → 编辑（裁剪 → 旋转，文件级）→ computeTargetSize → encode。
 * 目标尺寸按编辑后的尺寸计算（裁剪框像素 = 缩放阶段输入边界；旋转先换宽高）。
 * 失败一律抛 ConversionError（结构化 reason 由 UI 映射文案）。
 */
export async function convertImage(
  codec: ImageCodec,
  file: File,
  plan: ResizePlan,
  format: OutputFormat,
  quality: number,
  edit?: ImageEdit,
): Promise<ConvertOutcome> {
  let decoded: SourceImage
  try {
    decoded = await codec.decode(file)
  } catch (e) {
    if (e instanceof ConversionError) throw e
    throw new ConversionError('decode-failed')
  }

  // 编辑段：仅当文件带实际生效的裁剪/旋转时进入（原图直通零开销）
  let work = { source: decoded.source, width: decoded.width, height: decoded.height }
  if (hasEdit(edit)) {
    if (!codec.edit) throw new ConversionError('decode-failed')
    try {
      const edited = await codec.edit(decoded.source, decoded.width, decoded.height, edit)
      work = { source: edited.source, width: edited.width, height: edited.height }
    } catch (e) {
      if (e instanceof ConversionError) throw e
      throw new ConversionError('decode-failed')
    }
  }
  // 几何：编辑后尺寸 = 纯函数 editedDims；目标尺寸按其计算
  const dims = editedDims(decoded.width, decoded.height, edit)

  const target = computeTargetSize({ width: dims.width, height: dims.height }, plan)
  if (!target.ok) throw new ConversionError('invalid-target-size')

  // 质量仅对 JPEG/WebP 生效；PNG 传 null（无质量参数）
  const q = needsQuality(format) ? quality : null
  try {
    const blob = await codec.encode(work.source, target.width, target.height, format, q)
    return {
      blob,
      width: target.width,
      height: target.height,
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      source: decoded.source,
      firstFrame: decoded.firstFrame,
    }
  } catch (e) {
    if (e instanceof ConversionError) throw e
    throw new ConversionError('encode-failed')
  }
}
