/**
 * 单文件转换编排（可测缝）：decode → 缩放计算 → encode。
 *
 * - 编解码器以接口注入：测试用桩验证调用顺序与参数（node 环境无 Canvas/Image），
 *   生产用 browserCodec（decode.ts + encode.ts）。
 * - 缩放计划 → 目标尺寸逐文件计算；非法（0/负/超 65500 单边）→ 结构化错误，不触碰已转换结果。
 * - 质量仅 JPEG/WebP 传入（PNG 无质量概念，传 null）。
 */
import type { OutputFormat } from './encode'
import { needsQuality } from './encode'
import { ConversionError } from './errors'
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

/** 生产编解码器：DOM 解码 + 混合路径编码。 */
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
}

/**
 * 编排：decode → computeTargetSize → encode。
 * 失败一律抛 ConversionError（结构化 reason 由 UI 映射文案）。
 */
export async function convertImage(
  codec: ImageCodec,
  file: File,
  plan: ResizePlan,
  format: OutputFormat,
  quality: number,
): Promise<ConvertOutcome> {
  let decoded: SourceImage
  try {
    decoded = await codec.decode(file)
  } catch (e) {
    if (e instanceof ConversionError) throw e
    throw new ConversionError('decode-failed')
  }

  const target = computeTargetSize({ width: decoded.width, height: decoded.height }, plan)
  if (!target.ok) throw new ConversionError('invalid-target-size')

  // 质量仅对 JPEG/WebP 生效；PNG 传 null（无质量参数）
  const q = needsQuality(format) ? quality : null
  try {
    const blob = await codec.encode(decoded.source, target.width, target.height, format, q)
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
