/**
 * 纯输出命名模块（不依赖 Vue / DOM）。
 *
 * 输出命名语义（见根 CONTEXT.md「输出命名」与规格 §4）：
 * - 输出名 = 原文件名 basename + `_cleaned` + 原扩展名（仅剥离最后一个扩展名）。
 * - 与批内已有名称冲突时追加 `_1`、`_2`… 序号。
 * - 名称在清除时确定；重新清除（幂等产物）不改变名称。
 */

/** 剥离最后一个扩展名后追加 `_cleaned` 与原扩展名。 */
export function cleanedOutputName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  return `${base}_cleaned${ext}`
}

/**
 * 在 taken（批内已占用名称）中为 fileName 分配一个不冲突的输出名。
 * 纯函数：不修改 taken，由调用方在成功后登记。
 */
export function allocateCleanedName(fileName: string, taken: ReadonlySet<string>): string {
  const base = cleanedOutputName(fileName)
  if (!taken.has(base)) return base
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let i = 1
  while (taken.has(`${stem}_${i}${ext}`)) i++
  return `${stem}_${i}${ext}`
}
