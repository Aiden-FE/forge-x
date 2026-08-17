/**
 * 纯输入校验模块（不依赖 Vue / DOM）。
 *
 * 唯一可测缝：文件元数据 / 尺寸 / SVG 文本 → 结构化校验结果。
 *
 * 语义约定（见根 CONTEXT.md 与 .scratch/webp-converter/spec.md）：
 * - 逐文件校验按序进行，首个命中即拒绝：格式 → 大小；解码后再做尺寸校验。
 * - 批次校验：加入后列表行数超过 MAX_ITEMS 时拒绝新文件。
 * - 所有失败逐文件展示，不阻塞整批。
 */

export const MAX_FILE_SIZE = 20 * 1024 * 1024
export const MAX_DIMENSION = 8192
export const MAX_ITEMS = 50
/** 仅含 viewBox 的 SVG 栅格化时最长边目标像素 */
export const SVG_FALLBACK_MAX_DIMENSION = 1024

const SUPPORTED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/webp',
])

const SUPPORTED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.svg',
  '.webp',
])

export type RejectionReason =
  | 'unsupported-format'
  | 'file-too-large'
  | 'too-many-files'
  | 'image-too-large'

/** 逐文件失败原因统一词汇：校验拒绝 + 运行时转换失败（供 UI 映射文案）。 */
export type FailureReason = RejectionReason | 'svg-no-size' | 'decode-failed' | 'encode-failed'

export interface FileLike {
  name: string
  size: number
  type: string
}

export type CheckResult = { ok: true } | { ok: false; reason: RejectionReason }

/** 格式是否在支持列表内（mime 或扩展名任一命中即可）。 */
export function isSupportedFormat(file: FileLike): boolean {
  if (SUPPORTED_MIMES.has(file.type.toLowerCase())) return true
  const dot = file.name.lastIndexOf('.')
  if (dot <= 0) return false
  return SUPPORTED_EXTENSIONS.has(file.name.slice(dot).toLowerCase())
}

/** 逐文件校验：格式 → 大小，首个命中即拒绝。 */
export function validateFile(file: FileLike): CheckResult {
  if (!isSupportedFormat(file)) return { ok: false, reason: 'unsupported-format' }
  if (file.size > MAX_FILE_SIZE) return { ok: false, reason: 'file-too-large' }
  return { ok: true }
}

/** 批次数量校验：existingCount + incomingCount 不得超过 MAX_ITEMS。 */
export function validateBatchCapacity(existingCount: number, incomingCount: number): CheckResult {
  if (existingCount + incomingCount > MAX_ITEMS) return { ok: false, reason: 'too-many-files' }
  return { ok: true }
}

/** 解码后尺寸校验：最长边不得超过 MAX_DIMENSION。 */
export function validateDimensions(width: number, height: number): CheckResult {
  if (Math.max(width, height) > MAX_DIMENSION) return { ok: false, reason: 'image-too-large' }
  return { ok: true }
}

export type SvgSize =
  | { kind: 'declared'; width: number; height: number }
  | { kind: 'viewbox'; width: number; height: number }
  | { kind: 'none' }

/**
 * 解析 SVG 根标签的尺寸信息：
 * - width/height 均为绝对像素 → declared（按声明栅格化）
 * - 否则有 viewBox → viewbox（按宽高比栅格化）
 * - 否则 → none（调用方应拒绝）
 */
export function parseSvgSize(svgText: string): SvgSize {
  const tagMatch = svgText.match(/<svg[^>]*>/i)
  if (!tagMatch) return { kind: 'none' }
  const tag = tagMatch[0]

  const num = (name: string): number | null => {
    const m = tag.match(new RegExp(`(?<![-\\w])${name}\\s*=\\s*["']?([\\d]+(?:\\.[\\d]+)?)(?:px)?["']?(?=[\\s>/])`, 'i'))
    return m ? Number(m[1]) : null
  }

  const width = num('width')
  const height = num('height')
  if (width != null && height != null) return { kind: 'declared', width, height }

  const viewBox = tag.match(/viewBox\s*=\s*["']?\s*[-+.\d]+[\s,]+[-+.\d]+[\s,]+([-+.\d]+)[\s,]+([-+.\d]+)/i)
  if (viewBox) return { kind: 'viewbox', width: Number(viewBox[1]), height: Number(viewBox[2]) }

  return { kind: 'none' }
}

/** viewBox 宽高比栅格化目标：最长边缩放到 SVG_FALLBACK_MAX_DIMENSION（取整，最小 1px）。 */
/** 仅含 viewBox 的 SVG 栅格化时最长边固定 1024px（见 CONTEXT.md 词汇表）。 */
export function svgRasterSize(viewWidth: number, viewHeight: number): { width: number; height: number } {
  const scale = SVG_FALLBACK_MAX_DIMENSION / Math.max(viewWidth, viewHeight)
  return {
    width: Math.max(1, Math.round(viewWidth * scale)),
    height: Math.max(1, Math.round(viewHeight * scale)),
  }
}

/**
 * 检测 WebP 文件是否为动画（含 ANIM / ANMF 块）。
 * 按 RIFF 块结构遍历，不做全量字节搜索，避免误判。
 */
export function isAnimatedWebP(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 30) return false
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    const size =
      bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24)
    if (id === 'ANIM' || id === 'ANMF') return true
    offset += 8 + size + (size & 1)
  }
  return false
}
