/**
 * 纯统计与格式化模块（不依赖 Vue / DOM）。
 *
 * 压缩率语义（见根 CONTEXT.md）：（原始大小 − 转换后大小）/ 原始大小。
 * 正值表示文件变小，负值表示文件变大。
 */

/** 压缩率 =（原始大小 − 转换后大小）/ 原始大小。调用方保证 originalSize > 0。 */
export function compressionRatio(originalSize: number, convertedSize: number): number {
  return (originalSize - convertedSize) / originalSize
}

/** 压缩率展示为百分比（1 位小数）。 */
export function formatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/** 字节数格式化：B / KB / MB（1 位小数）。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 尺寸展示：W×H。 */
export function formatDimensions(width: number, height: number): string {
  return `${width}×${height}`
}

/** zip 打包文件名：webp-converted-YYYYMMDD-HHmmss.zip（本地时间）。 */
export function zipFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `webp-converted-${date}-${time}.zip`
}
