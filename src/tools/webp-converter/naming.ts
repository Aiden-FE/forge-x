/**
 * 纯输出命名模块（不依赖 Vue / DOM）。
 *
 * 输出命名语义（见根 CONTEXT.md）：
 * - 输出名 = 原文件名 basename + `.webp`（仅剥离最后一个扩展名）。
 * - 与批内已有名称冲突时追加 `_1`、`_2`… 序号。
 * - 名称在文件加入批次时确定；重新转换不重新分配（调用方保留已分配名称）。
 */

/** 剥离最后一个扩展名后追加 `.webp`。 */
export function baseOutputName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  return `${base}.webp`
}

/**
 * 在 taken（批内已占用名称）中为 fileName 分配一个不冲突的输出名。
 * 纯函数：不修改 taken，由调用方在成功后登记。
 */
export function allocateOutputName(fileName: string, taken: ReadonlySet<string>): string {
  const base = baseOutputName(fileName)
  if (!taken.has(base)) return base
  let i = 1
  while (taken.has(`${base.replace(/\.webp$/, '')}_${i}.webp`)) i++
  return `${base.replace(/\.webp$/, '')}_${i}.webp`
}
