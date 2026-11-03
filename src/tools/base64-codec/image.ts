/**
 * 图片↔Base64 纯逻辑（13 票扩展，UI-free、0 依赖：FileReader/ArrayBuffer 原生）。
 *
 * 约定（.scratch/hot-tools-v0.4.0/issues/13-extensions-format-spec.md §2 + 平台
 * 附录 §3 输入边界 / §5 输出命名）：
 * - 正向：单文件 ≤ 20 MiB、批量 ≤ 20 文件；超限明确报错、不入批，不动已有结果。
 * - 逐文件产出三种复制形态：data URI / `<img src>` 片段 / CSS `url()` 片段。
 * - 反向：粘贴 data URI → mime 前缀自动识别（大小写不敏感；缺失 `;base64`
 *   参数容错）；非 `data:image` 前缀报错。
 * - 输出命名：basename + 输出扩展名，批内冲突追加 `_1/_2`。
 */

/** 单文件上限：20 MiB（图片类惯例）。 */
export const IMAGE_MAX_FILE_BYTES = 20 * 1024 * 1024

/** 批量上限：≤ 20 文件。 */
export const IMAGE_MAX_BATCH_FILES = 20

/* ------------------------------------------------------------------ *
 * MIME 识别（魔数嗅探 + 声明值兜底）
 * ------------------------------------------------------------------ */

/** 按魔数嗅探常见图片 MIME；无法识别返回 null。 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte)

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return 'image/gif'
  }
  if (bytes.length >= 12 && startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'
  }
  if (startsWith([0x42, 0x4d])) return 'image/bmp'
  if (startsWith([0x00, 0x00, 0x01, 0x00])) return 'image/x-icon'
  return null
}

export function isImageMime(mime: string): boolean {
  return /^image\//i.test(mime)
}

/* ------------------------------------------------------------------ *
 * 正向：文件 → 三种复制形态
 * ------------------------------------------------------------------ */

export interface ImageEncodeItem {
  /** 原文件名（basename）。 */
  name: string
  /** 嗅探优先、声明值兜底后的图片 MIME。 */
  mime: string
  /** 原始字节数。 */
  byteLength: number
  /** base64（无 data: 前缀，标准字母表，含 padding）。 */
  base64: string
  dataUri: string
  imgFragment: string
  cssFragment: string
}

/** bytes → base64：分块拼接避免 String.fromCharCode 爆栈。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return btoa(binary)
}

/** HTML 属性安全的最小转义（用于 alt 等）。 */
function escapeHtmlAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildImageFragments(name: string, mime: string, base64: string): {
  dataUri: string
  imgFragment: string
  cssFragment: string
} {
  const dataUri = `data:${mime};base64,${base64}`
  return {
    dataUri,
    imgFragment: `<img src="${dataUri}" alt="${escapeHtmlAttribute(name)}">`,
    cssFragment: `url("${dataUri}")`,
  }
}

export type ImageFileOutcome =
  | { ok: true; item: ImageEncodeItem }
  | { ok: false; reason: 'tooLarge' | 'notImage' }

/**
 * 单文件编码：超限先拒（tooLarge）；MIME 由魔数嗅探，嗅探不出而声明值是
 * image/*（如 svg）时用声明值，否则 notImage。字节与文件名由调用方（UI 层
 * FileReader）读入，本函数保持纯逻辑可测。
 */
export function encodeImageFile(file: {
  name: string
  type: string
  bytes: Uint8Array
}): ImageFileOutcome {
  if (file.bytes.length > IMAGE_MAX_FILE_BYTES) return { ok: false, reason: 'tooLarge' }

  const sniffed = sniffImageMime(file.bytes)
  const mime = sniffed ?? (isImageMime(file.type) ? file.type.toLowerCase() : null)
  if (!mime) return { ok: false, reason: 'notImage' }

  const base64 = bytesToBase64(file.bytes)
  return { ok: true, item: { name: file.name, mime, byteLength: file.bytes.length, base64, ...buildImageFragments(file.name, mime, base64) } }
}

/* ------------------------------------------------------------------ *
 * 批量选择：≤ 20 文件 / 单文件 ≤ 20 MiB；超限报错、不入批
 * ------------------------------------------------------------------ */

export type BatchRejectReason = 'tooMany' | 'tooLarge'

export interface BatchSelection<T> {
  accepted: T[]
  rejected: Array<{ file: T; reason: BatchRejectReason }>
}

/**
 * 按加入顺序校验批量：前 20 个可入批；超大小者记 tooLarge 且不占用名额。
 * 「不动已有结果」由调用方保证——本函数只做筛选，不触碰既有列表。
 */
export function selectImageBatch<T extends { size: number }>(files: T[]): BatchSelection<T> {
  const accepted: T[] = []
  const rejected: Array<{ file: T; reason: BatchRejectReason }> = []
  for (const file of files) {
    if (accepted.length >= IMAGE_MAX_BATCH_FILES) {
      rejected.push({ file, reason: 'tooMany' })
      continue
    }
    if (file.size > IMAGE_MAX_FILE_BYTES) {
      rejected.push({ file, reason: 'tooLarge' })
      continue
    }
    accepted.push(file)
  }
  return { accepted, rejected }
}

/* ------------------------------------------------------------------ *
 * 反向：data URI → 图片字节
 * ------------------------------------------------------------------ */

export type DataUriParseResult =
  | { ok: true; mime: string; dataUri: string; bytes: Uint8Array }
  | { ok: false; reason: 'empty' | 'format' | 'not-image' | 'base64' }

function decodeBase64Strict(payload: string): Uint8Array | null {
  try {
    const normalized = payload.replace(/\s+/g, '')
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

/**
 * 解析粘贴内容为图片：
 * - `data:image/...` 前缀（大小写不敏感）→ mime 自动识别；缺失 `;base64`
 *   参数容错（按 base64 处理）；非 image mime → not-image。
 * - 无 data: 前缀 → 视为裸 base64，按魔数嗅探；嗅探不出 → not-image。
 */
export function parseImageDataUri(text: string): DataUriParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }

  if (/^data:/i.test(trimmed)) {
    const commaIndex = trimmed.indexOf(',')
    if (commaIndex < 0) return { ok: false, reason: 'format' }

    // data:[mime][;params]——只取 mime 段，参数（含缺失的 ;base64）一律容错。
    const header = trimmed.slice(5, commaIndex)
    const mime = header.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!isImageMime(mime)) return { ok: false, reason: 'not-image' }

    const bytes = decodeBase64Strict(trimmed.slice(commaIndex + 1))
    if (!bytes) return { ok: false, reason: 'base64' }
    return { ok: true, mime, dataUri: `data:${mime};base64,${bytesToBase64(bytes)}`, bytes }
  }

  // 裸 base64：mime 前缀自动识别退化为魔数嗅探。
  const bytes = decodeBase64Strict(trimmed)
  if (!bytes) return { ok: false, reason: 'base64' }
  const mime = sniffImageMime(bytes)
  if (!mime) return { ok: false, reason: 'not-image' }
  return { ok: true, mime, dataUri: `data:${mime};base64,${bytesToBase64(bytes)}`, bytes }
}

/* ------------------------------------------------------------------ *
 * 输出命名：basename + 扩展名，冲突追加 _1/_2（平台附录 §5）
 * ------------------------------------------------------------------ */

/** 常见图片 MIME 的输出扩展名。 */
export function imageMimeExtension(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/gif': return 'gif'
    case 'image/webp': return 'webp'
    case 'image/bmp': return 'bmp'
    case 'image/svg+xml': return 'svg'
    case 'image/x-icon': return 'ico'
    default: return 'img'
  }
}

/**
 * 与批内已用名称冲突时追加 `_1`、`_2`…；名称一经分配即登记，后续下载沿用
 * 同一约定（WebP 转换器 输出命名 先例）。
 */
export function dedupeFileName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let serial = 1
  while (used.has(`${stem}_${serial}${ext}`)) serial += 1
  const unique = `${stem}_${serial}${ext}`
  used.add(unique)
  return unique
}
