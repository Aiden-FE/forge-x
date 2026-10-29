/**
 * 结构化错误：reason 取自统一失败原因词汇（validate.ts FailureReason），
 * 由 UI 映射为用户可读文案（与 image-resize/errors.ts 同构；
 * 独立成模块避免 strip ↔ inspect ↔ pipeline 循环依赖）。
 */
import type { FailureReason } from './validate'

export type ExifErrorReason = Extract<
  FailureReason,
  'view-failed' | 'strip-failed' | 'corrupt-file' | 'format-not-strippable' | 'residual-not-clean'
>

export class ExifError extends Error {
  public readonly reason: ExifErrorReason

  constructor(reason: ExifErrorReason) {
    super(reason)
    this.reason = reason
    this.name = 'ExifError'
  }
}
