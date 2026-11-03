/**
 * AES 加解密纯逻辑层（WebCrypto 0 依赖）。
 *
 * 口径与术语见 CONTEXT.md：
 * - AES 加解密：GCM 默认推荐（认证加密），CBC 可选带警示；密钥来自口令派生或直接粘贴；
 * - 信封格式（Envelope Format）：自有自描述封装 "FGX1" + 版本 + 模式位 + salt + IV + 密文，
 *   整体 base64；salt 与 IV 由工具生成并嵌入，不设手动入口；解密只认此格式，
 *   不承诺解密 OpenSSL（Salted__）等第三方工具的密文；
 * - 认证失败单态（Unified Auth Failure）：GCM 解密失败时「密钥不匹配」与「密文已损坏」
 *   呈现为同一状态——认证加密在密码学上不可区分二者；CBC 可如实分层提示填充错误。
 *
 * PBKDF2-SHA256 600,000 次迭代固定不可调（OWASP 现行口径），每次加密新生成随机 16 字节 salt。
 */

export const MAX_INPUT_BYTES = 1024 * 1024 // 1 MiB 惯例
export const PBKDF2_ITERATIONS = 600000
export const SALT_BYTES = 16
export const GCM_IV_BYTES = 12
export const CBC_IV_BYTES = 16
export const GCM_TAG_BYTES = 16

export type AesMode = 'GCM' | 'CBC'
export type KeyBits = 128 | 192 | 256

const MAGIC_BYTES = [0x46, 0x47, 0x58, 0x31] as const // "FGX1"
const ENVELOPE_VERSION = 0x01
const MODE_TO_BYTE: Record<AesMode, number> = { GCM: 0x01, CBC: 0x02 }
const MODE_FROM_BYTE: Record<number, AesMode> = { 0x01: 'GCM', 0x02: 'CBC' }

// ---- 编码助手 ----

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

export function base64ToBytes(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/\s+/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

export function bytesToHex(bytes: Uint8Array, groupSize = 0): string {
  let hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  if (groupSize > 0) {
    const parts: string[] = []
    for (let i = 0; i < hex.length; i += groupSize * 2) parts.push(hex.slice(i, i + groupSize * 2))
    hex = parts.join(' ')
  }
  return hex
}

export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/\s+/g, '')
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function exceedsInputLimit(text: string): boolean {
  return utf8ByteLength(text) > MAX_INPUT_BYTES
}

// ---- raw key（hex 或 base64 粘贴，16/24/32 字节自动识别） ----

export type RawKeyError = 'invalid-encoding' | 'invalid-length'

export type RawKeyParse =
  | { ok: true; bytes: Uint8Array; bits: KeyBits }
  | { ok: false; reason: RawKeyError; byteLength?: number }

export function parseRawKey(text: string): RawKeyParse {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'invalid-encoding' }
  const compact = trimmed.replace(/\s+/g, '')
  // 判定优先级：恰好 32/48/64 个 hex 字符 → hex（合法 key 长度全覆盖）；
  // 其余纯 hex 偶长字符串仍按 hex 解读（错长度时按用户心智报实际字节数）；
  // 其余走 base64。纯 hex 字符集与 base64 字符集有交集，此歧义不可消除，取 hex 优先。
  const looksHex = /^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0
  let bytes: Uint8Array | null = null
  if (looksHex) {
    bytes = hexToBytes(compact)
  } else {
    bytes = base64ToBytes(trimmed)
  }
  if (!bytes) return { ok: false, reason: 'invalid-encoding' }
  if (bytes.length !== 16 && bytes.length !== 24 && bytes.length !== 32) {
    return { ok: false, reason: 'invalid-length', byteLength: bytes.length }
  }
  return { ok: true, bytes, bits: (bytes.length * 8) as KeyBits }
}

// ---- WebCrypto 原语 ----

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

function importAesKey(keyBytes: Uint8Array, mode: AesMode, usages: KeyUsage[]): Promise<CryptoKey> {
  const name = mode === 'GCM' ? 'AES-GCM' : 'AES-CBC'
  return crypto.subtle.importKey('raw', keyBytes as BufferSource, { name }, false, usages)
}

/** passphrase 路径：PBKDF2-SHA256 600,000 次迭代 → 256 位密钥字节（固定不可调）。 */
export async function deriveAesKeyBytes(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    base,
    256,
  )
  return new Uint8Array(bits)
}

// ---- 信封组装/拆解 ----

/** 信封段视图（结构解析面板口径，hex 查看）。 */
export interface EnvelopeView {
  magicHex: string // 46 47 58 31
  versionHex: string // 01
  mode: AesMode
  saltHex: string
  ivHex: string
  ciphertextHex: string
  ciphertextBytes: number
  totalBytes: number
}

export type EnvelopeParseError = 'bad-base64' | 'non-fgx1' | 'too-short'

export type EnvelopeParse =
  | { ok: true; view: EnvelopeView }
  | { ok: false; reason: EnvelopeParseError }

/**
 * 纯切片拆解信封（零密钥参与）：base64 → 段 hex 视图。
 * 头部完整即可拆 magic/版本/模式；salt/IV/密文段按各自长度就位，不足则留空。
 */
export function parseEnvelope(base64: string): EnvelopeParse {
  const bytes = base64ToBytes(base64)
  if (!bytes) return { ok: false, reason: 'bad-base64' }
  if (bytes.length < 6) return { ok: false, reason: 'too-short' }
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC_BYTES[i]) return { ok: false, reason: 'non-fgx1' }
  }
  const version = bytes[4]!
  const mode = MODE_FROM_BYTE[bytes[5]!]
  if (version !== ENVELOPE_VERSION || !mode) return { ok: false, reason: 'too-short' }

  const headerEnd = 6
  const saltEnd = headerEnd + SALT_BYTES
  const ivEnd = saltEnd + (mode === 'GCM' ? GCM_IV_BYTES : CBC_IV_BYTES)
  const salt = bytes.slice(headerEnd, saltEnd)
  const iv = bytes.slice(saltEnd, ivEnd)
  const ciphertext = bytes.slice(ivEnd)
  return {
    ok: true,
    view: {
      magicHex: bytesToHex(bytes.slice(0, 4), 1),
      versionHex: bytesToHex(bytes.slice(4, 5)),
      mode,
      saltHex: salt.length === SALT_BYTES ? bytesToHex(salt, 4) : bytesToHex(salt),
      ivHex: bytesToHex(iv, 4),
      ciphertextHex: bytesToHex(ciphertext, 8),
      ciphertextBytes: ciphertext.length,
      totalBytes: bytes.length,
    },
  }
}

/** 低层加密核心：固定 salt/IV（测试注入点），明文字节 → 信封字节。 */
export async function encryptEnvelopeBytes(args: {
  mode: AesMode
  keyBytes: Uint8Array
  salt: Uint8Array
  iv: Uint8Array
  plaintextBytes: Uint8Array
}): Promise<Uint8Array> {
  const { mode, keyBytes, salt, iv, plaintextBytes } = args
  const key = await importAesKey(keyBytes, mode, ['encrypt'])
  const params: AesGcmParams | AesCbcParams =
    mode === 'GCM'
      ? { name: 'AES-GCM', iv: iv as BufferSource, tagLength: GCM_TAG_BYTES * 8 }
      : { name: 'AES-CBC', iv: iv as BufferSource }
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(params, key, plaintextBytes as BufferSource))

  const ivLen = mode === 'GCM' ? GCM_IV_BYTES : CBC_IV_BYTES
  const envelope = new Uint8Array(4 + 1 + 1 + SALT_BYTES + ivLen + ciphertext.length)
  let offset = 0
  envelope.set(MAGIC_BYTES, offset)
  offset += 4
  envelope[offset++] = ENVELOPE_VERSION
  envelope[offset++] = MODE_TO_BYTE[mode]
  envelope.set(salt, offset)
  offset += salt.length
  envelope.set(iv, offset)
  offset += ivLen
  envelope.set(ciphertext, offset)
  return envelope
}

// ---- 解密 ----

export type DecryptFailureReason =
  | 'invalid-key' // raw key 非法（UI 只错该输入框）
  | 'bad-base64'
  | 'non-fgx1'
  | 'bad-envelope' // 版本/模式不认或段长不足
  | 'gcm-auth' // 认证失败单态：密钥不匹配或密文已损坏
  | 'cbc-padding' // CBC 填充错误（密钥错误或密文损坏的可能）

export type DecryptOutcome =
  | { ok: true; plaintext: string }
  | { ok: false; reason: DecryptFailureReason }

/** passphrase 路径加密：每次新生成随机 salt 与 IV。 */
export async function encryptWithPassphrase(args: {
  mode: AesMode
  passphrase: string
  plaintext: string
  salt?: Uint8Array
  iv?: Uint8Array
}): Promise<{ envelope: string }> {
  const salt = args.salt ?? randomBytes(SALT_BYTES)
  const ivLen = args.mode === 'GCM' ? GCM_IV_BYTES : CBC_IV_BYTES
  const iv = args.iv ?? randomBytes(ivLen)
  const keyBytes = await deriveAesKeyBytes(args.passphrase, salt)
  const envelope = await encryptEnvelopeBytes({
    mode: args.mode,
    keyBytes,
    salt,
    iv,
    plaintextBytes: new TextEncoder().encode(args.plaintext),
  })
  return { envelope: bytesToBase64(envelope) }
}

/** raw key 路径加密：16/24/32 字节自动识别；非法只错该侧。 */
export async function encryptWithRawKey(args: {
  mode: AesMode
  keyText: string
  plaintext: string
  iv?: Uint8Array
}): Promise<{ ok: true; envelope: string; bits: KeyBits } | { ok: false; reason: RawKeyError; byteLength?: number }> {
  const keyParse = parseRawKey(args.keyText)
  if (!keyParse.ok) return keyParse
  const ivLen = args.mode === 'GCM' ? GCM_IV_BYTES : CBC_IV_BYTES
  const iv = args.iv ?? randomBytes(ivLen)
  const envelope = await encryptEnvelopeBytes({
    mode: args.mode,
    keyBytes: keyParse.bytes,
    salt: randomBytes(SALT_BYTES),
    iv,
    plaintextBytes: new TextEncoder().encode(args.plaintext),
  })
  return { ok: true, envelope: bytesToBase64(envelope), bits: keyParse.bits }
}

/**
 * 解密（keyBytes 已就位）：
 * - GCM 任何失败（错钥/篡改/截断）统一呈现 gcm-auth 单态；
 * - CBC 失败如实分层为 cbc-padding 填充错误提示。
 */
export async function decryptWithKeyBytes(envelopeBase64: string, keyBytes: Uint8Array): Promise<DecryptOutcome> {
  const parsed = parseEnvelope(envelopeBase64)
  if (!parsed.ok) {
    const reason = parsed.reason === 'non-fgx1' ? 'non-fgx1' : parsed.reason === 'bad-base64' ? 'bad-base64' : 'bad-envelope'
    return { ok: false, reason }
  }
  const { mode } = parsed.view
  const bytes = base64ToBytes(envelopeBase64)!
  const ivLen = mode === 'GCM' ? GCM_IV_BYTES : CBC_IV_BYTES
  const ivEnd = 6 + SALT_BYTES + ivLen
  if (bytes.length < ivEnd + (mode === 'GCM' ? GCM_TAG_BYTES : 16)) {
    return { ok: false, reason: 'bad-envelope' }
  }
  const iv = bytes.slice(6 + SALT_BYTES, ivEnd)
  const ciphertext = bytes.slice(ivEnd)

  let key: CryptoKey
  try {
    key = await importAesKey(keyBytes, mode, ['decrypt'])
  } catch {
    return { ok: false, reason: 'invalid-key' }
  }
  const params: AesGcmParams | AesCbcParams =
    mode === 'GCM'
      ? { name: 'AES-GCM', iv: iv as BufferSource, tagLength: GCM_TAG_BYTES * 8 }
      : { name: 'AES-CBC', iv: iv as BufferSource }
  try {
    const plaintext = await crypto.subtle.decrypt(params, key, ciphertext as BufferSource)
    return { ok: true, plaintext: new TextDecoder().decode(plaintext) }
  } catch {
    // 认证失败单态：GCM 在密码学上不可区分「密钥不匹配」与「密文已损坏」
    return { ok: false, reason: mode === 'GCM' ? 'gcm-auth' : 'cbc-padding' }
  }
}

/** 解密入口（key 来源侧校验在 UI：raw key 非法只错该输入框）。 */
export async function decryptEnvelope(args: {
  envelopeBase64: string
  keyBytes: Uint8Array
}): Promise<DecryptOutcome> {
  return decryptWithKeyBytes(args.envelopeBase64, args.keyBytes)
}
