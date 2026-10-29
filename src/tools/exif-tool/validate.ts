/**
 * 纯输入校验模块（不依赖 Vue / DOM）。
 *
 * 语义约定（见根 CONTEXT.md 与 .scratch/hot-tools-v0.3.0/issues/14-exif-tool-spec.md）：
 * - 查看格式集：JPEG / PNG / TIFF（PNG 读 tEXt/iTXt/eXIf）。
 * - 清除格式集：仅 JPEG / PNG（段级/块级无损剥除）；TIFF 仅查看。
 * - 批量 ≤ 20 文件、单文件 ≤ 20 MiB（WebP 转换器口径；批量 20 为 EXIF 先例）。
 * - 逐文件校验按序进行，首个命中即拒绝：格式 → 大小。
 * - 所有失败逐文件展示，不阻塞整批。
 */

export const MAX_FILE_SIZE = 20 * 1024 * 1024
export const MAX_ITEMS = 20

/** 查看支持的格式。 */
export type PhotoFormat = 'jpeg' | 'png' | 'tiff'

const FORMAT_MIMES: Record<PhotoFormat, Set<string>> = {
  jpeg: new Set(['image/jpeg']),
  png: new Set(['image/png']),
  tiff: new Set(['image/tiff']),
}

const FORMAT_EXTENSIONS: Record<PhotoFormat, Set<string>> = {
  jpeg: new Set(['.jpg', '.jpeg']),
  png: new Set(['.png']),
  tiff: new Set(['.tif', '.tiff']),
}

export type RejectionReason = 'unsupported-format' | 'file-too-large' | 'too-many-files'

/** 逐文件失败原因统一词汇：校验拒绝 + 运行时失败（供 UI 映射文案）。 */
export type FailureReason =
  | RejectionReason
  | 'view-failed'
  | 'strip-failed'
  | 'corrupt-file'
  | 'format-not-strippable'
  | 'residual-not-clean'

export interface FileLike {
  name: string
  size: number
  type: string
}

export type CheckResult = { ok: true } | { ok: false; reason: RejectionReason }

/** 识别格式（mime 或扩展名任一命中即可）；不支持的格式 → null。 */
export function detectFormat(file: FileLike): PhotoFormat | null {
  const mime = file.type.toLowerCase()
  for (const format of Object.keys(FORMAT_MIMES) as PhotoFormat[]) {
    if (FORMAT_MIMES[format].has(mime)) return format
  }
  const dot = file.name.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = file.name.slice(dot).toLowerCase()
  for (const format of Object.keys(FORMAT_EXTENSIONS) as PhotoFormat[]) {
    if (FORMAT_EXTENSIONS[format].has(ext)) return format
  }
  return null
}

/** 清除白名单：仅 JPEG / PNG（TIFF 需重写全部 IFD，仅支持查看）。 */
export function isStrippableFormat(format: PhotoFormat): boolean {
  return format === 'jpeg' || format === 'png'
}

/** 逐文件校验：格式 → 大小，首个命中即拒绝。 */
export function validateFile(file: FileLike): CheckResult {
  if (detectFormat(file) === null) return { ok: false, reason: 'unsupported-format' }
  if (file.size > MAX_FILE_SIZE) return { ok: false, reason: 'file-too-large' }
  return { ok: true }
}

/** 批次数量校验：existingCount + incomingCount 不得超过 MAX_ITEMS。 */
export function validateBatchCapacity(existingCount: number, incomingCount: number): CheckResult {
  if (existingCount + incomingCount > MAX_ITEMS) return { ok: false, reason: 'too-many-files' }
  return { ok: true }
}
