/**
 * FGX1 v2 文件/批量加密（aes-cipher「文件」页签纯逻辑层）。
 *
 * 信封格式（v2 二进制，与 v1 文本信封并存、互不破坏；解密侧按版本分派）：
 *
 *   偏移   长度   字段
 *   0      4      magic "FGX1"（46 47 58 31）
 *   4      1      version = 0x02
 *   5      1      mode = 0x03（FILE-GCM；v1 文本信封用 0x01 GCM / 0x02 CBC）
 *   6      16     salt（PBKDF2-SHA256 600k，与文本模式同口径，每文件随机）
 *   22     4      nonce 前缀（每文件随机）
 *   26     2      nameLen（uint16 BE，原始文件名 UTF-8 字节长）
 *   28     n      原始文件名（UTF-8）
 *   28+n   8      fileSize（uint64 BE）
 *   36+n   4      chunkSize（uint32 BE，固定 1 MiB）
 *   40+n   4      chunkCount（uint32 BE = ceil(fileSize / chunkSize)；0 尺寸 → 0 块）
 *   44+n   …      块段：每块 = AES-256-GCM 密文 ‖ 16B tag
 *                 nonce(i) = 前缀(4B) ‖ i 的 64 位大端计数(8B) —— 96 位 nonce 防重用
 *                 AAD = 头部全部字节 [0, 44+n)（文件名/尺寸/块数一并认证）
 *
 * 边界与语义（票据 09 / 附录 §3 §4）：
 * - 分块流式：`File.slice` 逐块读入，读侧内存有界——绝不全量读入；产出侧
 *   每 FOLD_PARTS_EVERY 块（32 MiB）折叠为中间 Blob（进入浏览器 blob 存储，
 *   原始块数组可回收），JS 堆峰值有界，512 MiB 上限文件不再整驻内存；
 * - 单文件 ≤512 MiB（超限在读入前拒绝）、批量 ≤20 文件（UI 层执行）；
 * - 文件名 UTF-8 字节 ≤ MAX_NAME_BYTES（与解密侧对称——超限即拒绝，
 *   不产出解密侧会拒收的自拒信封；亦杜绝 uint16 nameLen 截断）；
 * - 块级认证失败 → 整体失败**单态** gcm-auth（不输出半截文件，错口令与篡改不可区分）；
 * - 解密输出原始文件名（净化为 basename，防信封内路径穿越；信封内文件名
 *   非法 UTF-8 按 bad-envelope 拒绝——fatal 解码，不做 U+FFFD 替换容忍）。
 */

import { GCM_TAG_BYTES, SALT_BYTES, deriveAesKeyBytes } from './aes'

export const FILE_CHUNK_BYTES = 1024 * 1024 // 1 MiB
export const MAX_FILE_BYTES = 512 * 1024 * 1024 // 512 MiB（附录 §3）
export const MAX_BATCH_FILES = 20
export const FGX_FILE_VERSION = 0x02
export const FGX_FILE_MODE = 0x03

/**
 * 产出侧折叠批量：每 32 块（32 MiB）收拢为一个中间 Blob。
 * `new Blob(parts)` 会把数据快照进浏览器 blob 存储（大块可落盘），
 * 折叠后原始 Uint8Array/ArrayBuffer 即可被 GC 回收——加密与解密两条
 * 产出路径共用此口径，512 MiB 上限文件的 JS 堆峰值 ≈ 32 MiB × 少数几份，
 * 而非密文全额驻留（P1 修复：见审查报告）。
 */
export const FOLD_PARTS_EVERY = 32

/** 与 hash-checksum 同构的流式源：测试可注入假源（512 MiB 拒绝时证明零读入）。 */
export type BlobSource = Pick<Blob, 'size' | 'slice'>

export type FileEnvelopeError = 'file-too-large' | 'name-too-long' | 'bad-envelope' | 'gcm-auth'

export type EncryptFileOutcome =
  | { ok: true; blob: Blob }
  | { ok: false; reason: Extract<FileEnvelopeError, 'file-too-large' | 'name-too-long'> }

export type DecryptFileOutcome =
  | { ok: true; blob: Blob; fileName: string }
  | { ok: false; reason: FileEnvelopeError }

const MAGIC = [0x46, 0x47, 0x58, 0x31] as const // "FGX1"
/** 文件名 UTF-8 字节上限（加解密两侧对称的守卫值）。 */
export const MAX_NAME_BYTES = 4096

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

export function isFileTooLarge(size: number): boolean {
  return size > MAX_FILE_BYTES
}

export function chunkCountFor(size: number): number {
  return size === 0 ? 0 : Math.ceil(size / FILE_CHUNK_BYTES)
}

/** 块 i 的 96 位 nonce = 4B 随机前缀 ‖ 8B 大端块计数。 */
function chunkNonce(prefix: Uint8Array, index: number): Uint8Array {
  const nonce = new Uint8Array(12)
  nonce.set(prefix, 0)
  new DataView(nonce.buffer).setUint32(4, Math.floor(index / 2 ** 32))
  new DataView(nonce.buffer).setUint32(8, index >>> 0)
  return nonce
}

/** 剥路径分隔符取 basename（`/` 与 `\` 都防；无分隔符原样）。 */
export function sanitizeFileName(name: string): string {
  const parts = name.split(/[/\\]/)
  return parts[parts.length - 1] ?? name
}

// ---- 信封头解析 ----

export interface FileEnvelopeView {
  magicHex: string
  version: number
  mode: number
  salt: Uint8Array
  noncePrefix: Uint8Array
  fileName: string
  fileSize: number
  chunkSize: number
  chunkCount: number
  /** 按头部字段推得的信封应有总字节数（magic 头 + 全部块段）。 */
  expectedTotal: number
}

export type FileHeaderParse =
  | { ok: true; view: FileEnvelopeView; headerBytes: number; nameOffset: number; nameByteLength: number }
  | { ok: false; reason: 'bad-envelope' }

/**
 * 纯切片拆头（零密钥参与）：magic/版本/模式/段长/块数自洽校验。
 * 只要求 bytes 覆盖头部（≥ headerBytes）；整体长度对不对由调用方对照源尺寸检查。
 */
export function parseFileEnvelopeHeader(bytes: Uint8Array): FileHeaderParse {
  if (bytes.length < 28) return { ok: false, reason: 'bad-envelope' }
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) return { ok: false, reason: 'bad-envelope' }
  }
  const version = bytes[4]!
  const mode = bytes[5]!
  if (version !== FGX_FILE_VERSION || mode !== FGX_FILE_MODE) return { ok: false, reason: 'bad-envelope' }

  const view0 = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const nameOffset = 28
  const nameLen = view0.getUint16(26)
  if (nameLen > MAX_NAME_BYTES || 28 + nameLen + 16 > bytes.length) return { ok: false, reason: 'bad-envelope' }
  const nameBytes = bytes.slice(nameOffset, nameOffset + nameLen)
  let fileName: string
  try {
    // fatal：非法 UTF-8 序列抛错 → bad-envelope（不做 U+FFFD 替换容忍）
    fileName = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes)
  } catch {
    return { ok: false, reason: 'bad-envelope' }
  }
  const sizeHigh = view0.getUint32(nameOffset + nameLen)
  const sizeLow = view0.getUint32(nameOffset + nameLen + 4)
  if (sizeHigh !== 0 || sizeLow > MAX_FILE_BYTES) return { ok: false, reason: 'bad-envelope' }
  const fileSize = sizeLow
  const chunkSize = view0.getUint32(nameOffset + nameLen + 8)
  const chunkCount = view0.getUint32(nameOffset + nameLen + 12)
  if (chunkSize !== FILE_CHUNK_BYTES) return { ok: false, reason: 'bad-envelope' }
  if (chunkCount !== chunkCountFor(fileSize)) return { ok: false, reason: 'bad-envelope' }

  const headerBytes = nameOffset + nameLen + 16
  // 块段总长自洽：非末块 = chunkSize + tag；末块 = 余量 + tag
  const lastSize = fileSize === 0 ? 0 : fileSize - (chunkCount - 1) * FILE_CHUNK_BYTES
  const expectedTotal =
    headerBytes +
    (chunkCount === 0 ? 0 : (chunkCount - 1) * (FILE_CHUNK_BYTES + GCM_TAG_BYTES) + lastSize + GCM_TAG_BYTES)

  return {
    ok: true,
    view: {
      magicHex: Array.from(bytes.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join(' '),
      version,
      mode,
      salt: bytes.slice(6, 22),
      noncePrefix: bytes.slice(22, 26),
      fileName,
      fileSize,
      chunkSize,
      chunkCount,
      expectedTotal,
    },
    headerBytes,
    nameOffset,
    nameByteLength: nameLen,
  }
}

// ---- 加密（分块流式） ----

export async function encryptFileEnvelope(args: {
  source: BlobSource
  fileName: string
  passphrase: string
  onProgress?: (loaded: number, total: number) => void
}): Promise<EncryptFileOutcome> {
  const total = args.source.size
  if (isFileTooLarge(total)) return { ok: false, reason: 'file-too-large' }

  const salt = randomBytes(SALT_BYTES)
  const prefix = randomBytes(4)
  const nameBytes = new TextEncoder().encode(args.fileName)
  // 与解密侧 MAX_NAME_BYTES 对称：超限前置拒绝（uint16 nameLen 也因此永不截断）
  if (nameBytes.length > MAX_NAME_BYTES) return { ok: false, reason: 'name-too-long' }
  const chunkCount = chunkCountFor(total)
  const header = new Uint8Array(44 + nameBytes.length)
  header.set(MAGIC, 0)
  header[4] = FGX_FILE_VERSION
  header[5] = FGX_FILE_MODE
  header.set(salt, 6)
  header.set(prefix, 22)
  new DataView(header.buffer).setUint16(26, nameBytes.length)
  header.set(nameBytes, 28)
  const metaOffset = 28 + nameBytes.length
  const hv = new DataView(header.buffer)
  hv.setUint32(metaOffset, 0) // fileSize 高 32 位（≤512 MiB 恒 0）
  hv.setUint32(metaOffset + 4, total)
  hv.setUint32(metaOffset + 8, FILE_CHUNK_BYTES)
  hv.setUint32(metaOffset + 12, chunkCount)

  const keyBytes = await deriveAesKeyBytes(args.passphrase, salt)
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['encrypt'])

  // 产出侧折叠：每 FOLD_PARTS_EVERY 块收拢为中间 Blob（见 FOLD_PARTS_EVERY 注释）
  const parts: BlobPart[] = []
  const group: BlobPart[] = [header]
  const fold = (): void => {
    if (group.length > 0) {
      parts.push(new Blob(group))
      group.length = 0
    }
  }
  let loaded = 0
  let index = 0
  while (loaded < total) {
    const end = Math.min(loaded + FILE_CHUNK_BYTES, total)
    const chunk = new Uint8Array(await args.source.slice(loaded, end).arrayBuffer())
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: chunkNonce(prefix, index) as BufferSource,
          additionalData: header as BufferSource,
          tagLength: GCM_TAG_BYTES * 8,
        },
        key,
        chunk as BufferSource,
      ),
    )
    group.push(sealed)
    if (group.length >= FOLD_PARTS_EVERY) fold()
    loaded = end
    index++
    args.onProgress?.(loaded, total)
  }
  fold()
  return { ok: true, blob: new Blob(parts) }
}

// ---- 解密（分块流式 + 单态失败） ----

export async function decryptFileEnvelope(args: {
  source: BlobSource
  passphrase: string
  onProgress?: (loaded: number, total: number) => void
}): Promise<DecryptFileOutcome> {
  // 两阶段有界读头：先 28B 定长前缀（读 nameLen），再补齐真实头长——绝不全量读入
  const prefixBuf = new Uint8Array(await args.source.slice(0, 28).arrayBuffer())
  if (prefixBuf.length < 28) return { ok: false, reason: 'bad-envelope' }
  for (let i = 0; i < 4; i++) {
    if (prefixBuf[i] !== MAGIC[i]) return { ok: false, reason: 'bad-envelope' }
  }
  if (prefixBuf[4] !== FGX_FILE_VERSION || prefixBuf[5] !== FGX_FILE_MODE) {
    return { ok: false, reason: 'bad-envelope' }
  }
  const nameLen = new DataView(prefixBuf.buffer, prefixBuf.byteOffset).getUint16(26)
  if (nameLen > MAX_NAME_BYTES) return { ok: false, reason: 'bad-envelope' }
  const headerLen = 28 + nameLen + 16
  const headBuf = new Uint8Array(await args.source.slice(0, headerLen).arrayBuffer())

  const parsed = parseFileEnvelopeHeader(headBuf)
  if (!parsed.ok) return { ok: false, reason: 'bad-envelope' }
  const { view, headerBytes } = parsed
  // 整体长度与头部声明不符（截断/拼接）→ 结构层拒绝，先于任何认证尝试
  if (args.source.size !== view.expectedTotal) return { ok: false, reason: 'bad-envelope' }

  const keyBytes = await deriveAesKeyBytes(args.passphrase, view.salt)
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['decrypt'])
  const header = headBuf.slice(0, headerBytes) // AAD = 真实头部字节

  // 产出侧折叠（与加密侧同口径）：明文块每 FOLD_PARTS_EVERY 块收拢为中间 Blob
  const parts: BlobPart[] = []
  const group: BlobPart[] = []
  const fold = (): void => {
    if (group.length > 0) {
      parts.push(new Blob(group))
      group.length = 0
    }
  }
  let loaded = 0
  for (let index = 0; index < view.chunkCount; index++) {
    const plainSize = Math.min(FILE_CHUNK_BYTES, view.fileSize - loaded)
    const segStart = headerBytes + index * (FILE_CHUNK_BYTES + GCM_TAG_BYTES)
    const seg = new Uint8Array(await args.source.slice(segStart, segStart + plainSize + GCM_TAG_BYTES).arrayBuffer())
    try {
      const plain = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: chunkNonce(view.noncePrefix, index) as BufferSource,
          additionalData: header as BufferSource,
          tagLength: GCM_TAG_BYTES * 8,
        },
        key,
        seg as BufferSource,
      )
      group.push(plain)
      if (group.length >= FOLD_PARTS_EVERY) fold()
    } catch {
      // 块级认证失败 → 整体失败单态：不输出半截文件，错口令与篡改不可区分
      return { ok: false, reason: 'gcm-auth' }
    }
    loaded += plainSize
    args.onProgress?.(loaded, view.fileSize)
  }
  fold()
  return { ok: true, blob: new Blob(parts), fileName: sanitizeFileName(view.fileName) }
}
