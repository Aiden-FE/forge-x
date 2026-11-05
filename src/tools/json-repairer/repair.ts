/**
 * JSON 修复纯逻辑（UI 无关）：输入文本 → 修复结果或错误。
 *
 * 术语见 CONTEXT.md「JSON 修复 (JSON Repair)」：
 * - 修复即规范化——产出为 jsonrepair 库产出的规范化 JSON（引号/空白在修复处
 *   统一），不是最小编辑补丁；排版需求导流 json-formatter。
 * - _Avoid_: 最小补丁、修复计数（规范化输出使字符级差异不可信）。
 *
 * 规格见 .scratch/hot-tools-v0.5.0/issues/03-llm-repairer-spec.md：
 * - jsonrepair@3.15.0 锁定（ISC、0 依赖）；首用 dynamic import，绝不静态
 *   import（首屏第三方增量 0）；regular 实现、无 Worker。
 * - 19 类可修全量收编、零选项开关（库即规格）。
 * - 粘贴/手输 1 MiB 上限（UTF-8 字节）；无文件导入。
 * - JSONRepairError 行内报错；输出保留旧值由组件层实现（只错该处）。
 */

/** 粘贴输入上限（UTF-8 字节）：1 MiB（平台文本上限惯例，共享单源 @/lib/pasteLimit）。 */
export { PASTE_MAX_BYTES, isPasteWithinLimit, utf8ByteLength } from '@/lib/pasteLimit'

/** 实时修复防抖间隔（转换类实时防抖 300ms，附录 §2，共享单源 @/lib/pasteLimit）。 */
export { CONVERT_DEBOUNCE_MS as DEBOUNCE_MS } from '@/lib/pasteLimit'

import { isPasteWithinLimit } from '@/lib/pasteLimit'

/** 下载文件名（附录 §5 输出命名：repaired.json）。 */
export const DOWNLOAD_FILENAME = 'repaired.json'

export type RepairErrorCode = 'empty' | 'pasteTooLarge' | 'repair'

export interface RepairError {
  code: RepairErrorCode
  /** 库错误消息（仅 repair 错误带）。 */
  message?: string
  /** JSONRepairError 的字符位置（UTF-16 码元索引，仅 repair 错误带）。 */
  position?: number
}

export type RepairOutcome =
  | { ok: true; value: string }
  | { ok: false; errors: RepairError[] }

/* ------------------------------------------------------------------ *
 * jsonrepair（首用 dynamic import，模块引用缓存共享单实例）
 * ------------------------------------------------------------------ */

let cachedJsonrepair: ((text: string) => string) | null = null

async function loadJsonrepair(): Promise<(text: string) => string> {
  if (cachedJsonrepair) return cachedJsonrepair
  const { jsonrepair } = await import('jsonrepair')
  cachedJsonrepair = jsonrepair
  return cachedJsonrepair
}

/**
 * 主修复纯函数：输入文本 → 修复结果或错误（不触 UI）。
 *
 * 前置守卫先于库调用：空白输入报 empty（平台惯例，而非让库抛
 * "Unexpected end of json string"）；超 1 MiB 报 pasteTooLarge，
 * 库不会被超限输入触达。
 */
export async function repairJson(text: string): Promise<RepairOutcome> {
  if (text.trim() === '') {
    return { ok: false, errors: [{ code: 'empty' }] }
  }
  if (!isPasteWithinLimit(text)) {
    return { ok: false, errors: [{ code: 'pasteTooLarge' }] }
  }
  const jsonrepairFn = await loadJsonrepair()
  try {
    return { ok: true, value: jsonrepairFn(text) }
  } catch (caught) {
    const error: RepairError = { code: 'repair' }
    if (caught instanceof Error) {
      error.message = caught.message
      // JSONRepairError 携带 position；按结构识别而非 instanceof
      // （ESM/CJS/打包 chunk 下实例来源可能不同，position 是稳定契约）。
      const position = (caught as Error & { position?: unknown }).position
      if (typeof position === 'number') error.position = position
    } else {
      error.message = String(caught)
    }
    return { ok: false, errors: [error] }
  }
}

/**
 * 字符位置 → 1 起始的行/列（错误行内定位展示用）。
 * position 越界时夹紧到文本长度；列按 UTF-16 码元计，仅作展示。
 */
export function positionToLineColumn(
  text: string,
  position: number,
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(position, text.length))
  const lines = text.slice(0, clamped).split('\n')
  const last = lines[lines.length - 1] ?? ''
  return { line: lines.length, column: last.replace(/\r$/, '').length + 1 }
}
