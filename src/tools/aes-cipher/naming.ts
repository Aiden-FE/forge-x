/**
 * FGX1 v2 文件输出命名（沿 WebP 转换器先例，见 CONTEXT.md「输出命名」）：
 * - 加密输出 = 原文件名 basename + `.fgx`（仅剥离最后一个扩展名）；
 * - 解密输出 = 信封内原始文件名（净化后）；
 * - 与批内已占用名称冲突时追加 `_1`、`_2`… 序号；名称在加入批次时确定。
 */

/** 剥离最后一个扩展名后追加 `.fgx`。 */
export function fgxOutputName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  return `${base}.fgx`
}

function splitExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: '' }
}

/**
 * 为期望输出名分配一个与 taken（批内已占用）不冲突的名字。
 * 纯函数：不修改 taken，由调用方在成功后登记。
 */
export function allocateConflictName(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired)) return desired
  const { base, ext } = splitExt(desired)
  let i = 1
  while (taken.has(`${base}_${i}${ext}`)) i++
  return `${base}_${i}${ext}`
}
