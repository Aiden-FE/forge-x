/**
 * 文本粘贴上限与转换防抖——平台交互约定的共享单源（spec.md 附录 §2 §3）。
 *
 * - 粘贴/手输文本 ≤ 1 MiB（UTF-8 字节计；TextEncoder 按完整码点编码，
 *   多字节字符如实累计，无代理对切分问题）；
 * - 转换/校验类实时防抖 300ms；
 * - 使用方：json-repairer、xml-formatter、xml-json（1 MiB + 防抖）、
 *   bip39-generator（校验区防抖）。各工具模块 re-export 同名导出，
 *   保持既有公共面（spec 测试与组件直接从工具模块引入）。
 */

/** 粘贴输入上限（UTF-8 字节）：1 MiB（平台文本上限惯例）。 */
export const PASTE_MAX_BYTES = 1024 * 1024

/** 实时修复/转换/校验防抖间隔（转换类实时防抖 300ms，附录 §2）。 */
export const CONVERT_DEBOUNCE_MS = 300

const encoder = new TextEncoder()

/** UTF-8 字节数（码点安全：TextEncoder 按完整码点编码）。 */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).length
}

/**
 * 是否在粘贴上限内。快速路径：UTF-8 下每 UTF-16 码单元至多 3 字节
 * （代理对 2 unit → 4 字节 = 每 unit 2 字节），长度三倍不超限必然安全，
 * 避免对短输入做完整编码。
 */
export function isPasteWithinLimit(text: string): boolean {
  if (text.length * 3 <= PASTE_MAX_BYTES) return true
  return utf8ByteLength(text) <= PASTE_MAX_BYTES
}

/** `isPasteWithinLimit` 的反义（xml-formatter 侧沿用此命名）。 */
export function exceedsPasteLimit(text: string): boolean {
  return !isPasteWithinLimit(text)
}
