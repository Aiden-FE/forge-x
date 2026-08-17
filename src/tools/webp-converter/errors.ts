/**
 * 结构化转换错误：reason 取自统一失败原因词汇（validate.ts FailureReason），
 * 由 UI 映射为用户可读文案。独立成模块避免 encode ↔ decode 循环依赖。
 */
import type { FailureReason } from './validate'

export type ConversionErrorReason = Extract<
  FailureReason,
  'image-too-large' | 'svg-no-size' | 'decode-failed' | 'encode-failed'
>

export class ConversionError extends Error {
  public readonly reason: ConversionErrorReason

  constructor(reason: ConversionErrorReason) {
    super(reason)
    this.reason = reason
    this.name = 'ConversionError'
  }
}
