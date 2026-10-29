/**
 * 纯统计与格式化模块（不依赖 Vue / DOM）。
 * 字节格式化与 zip 命名沿用 WebP 转换器先例（zip 打包）。
 */

/** 字节数格式化：B / KB / MB（1 位小数）。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** zip 打包文件名：exif-cleaned-YYYYMMDD-HHmmss.zip（本地时间）。 */
export function zipFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `exif-cleaned-${date}-${time}.zip`
}
