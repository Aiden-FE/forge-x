/**
 * OpenSSL 兼容解密（单向）——`openssl enc` 产出的 `Salted__` 密文。
 *
 * 口径（票据 09 / CONTEXT.md）：
 * - **解密单向**：加密方向出界——不产出 MD5-KDF 弱密文；
 * - `Salted__` 信封不记录 cipher/KDF ⇒ 用户显式选择：cipher 档位 AES-128/192/256-CBC
 *   （默认 256）+ KDF 档位 legacy MD5 EVP_BytesToKey（默认）/ PBKDF2-SHA256
 *   （iteration 手填默认 10000）。同 magic 不可自动区分——失败提示换组合；
 * - 弱 KDF 常驻警示（legacy MD5 EVP_BytesToKey，OpenSSL 3.x 自身已 deprecated 警告）；
 * - 输入 base64 主、hex 自动识别（纯 hex 偶长字符串按 hex 解读，其余走 base64——
 *   base64 编码的 Salted__ 密文首 9 字符 "U2FsdGVkX" 必含非 hex 字符，二者无实用歧义）；
 * - EVP_BytesToKey（MD5, 1 轮）自实现，MD5 复用共享模块 @/lib/md5；CBC 走 WebCrypto 原生。0 新依赖。
 *
 * 信封格式（openssl enc 传统格式）：
 *   "Salted__"(8B) | salt(8B) | AES-CBC 密文（含 PKCS#7 填充）
 */

import { Md5Digest } from '@/lib/md5'
import { base64ToBytes, hexToBytes, isUnsupportedKeyLengthError } from './aes'

export type OpenSslCipher = 'aes-128-cbc' | 'aes-192-cbc' | 'aes-256-cbc'
export type OpenSslKdf = 'md5' | 'pbkdf2'

export const DEFAULT_OPENSSL_CIPHER: OpenSslCipher = 'aes-256-cbc'
export const DEFAULT_OPENSSL_KDF: OpenSslKdf = 'md5'
export const DEFAULT_PBKDF2_ITERATIONS = 10000

/**
 * PBKDF2 迭代数上限（钳制闸）：手输巨值（如 1e12）会让 WebCrypto deriveBits
 * 长占数分钟级、负数/小数直接抛错落入误导性的 decrypt-failed——统一在
 * 逻辑层收敛为 [1, 10_000_000] 的整数（1000 万轮 ≈ 数秒上限，UI 可承受）。
 */
export const MAX_PBKDF2_ITERATIONS = 10_000_000

/** 迭代数归一：非有限值（NaN/±∞/空串经 v-model.number 而来）回默认；截断取整并钳到 [1, MAX]。 */
export function normalizeOpenSslIterations(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_PBKDF2_ITERATIONS
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_PBKDF2_ITERATIONS)
}

const SALTED_MAGIC = [0x53, 0x61, 0x6c, 0x74, 0x65, 0x64, 0x5f, 0x5f] as const // "Salted__"
const SALTED_SALT_BYTES = 8
const CBC_IV_BYTES = 16

export type OpenSslInputError = 'bad-encoding' | 'not-salted'
export type OpenSslDecryptError = OpenSslInputError | 'decrypt-failed' | 'unsupported-192'

export type OpenSslDecryptOutcome =
  | { ok: true; plaintext: string }
  | { ok: false; reason: OpenSslDecryptError }

function cipherKeyBytes(cipher: OpenSslCipher): number {
  return cipher === 'aes-128-cbc' ? 16 : cipher === 'aes-192-cbc' ? 24 : 32
}

// ---- 输入识别与信封解析 ----

/** base64 主、hex 自动识别：解码为原始字节；无法解码返回 null。 */
export function decodeCipherInput(input: string): Uint8Array | null {
  const clean = input.replace(/\s+/g, '')
  if (clean.length === 0) return null
  const looksHex = /^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0
  return looksHex ? hexToBytes(clean) : base64ToBytes(clean)
}

/** `Salted__` 信封拆解：salt(8B) + 密文；非 Salted__ 或结构过短返回 null。 */
export function parseSaltedInput(input: string): { salt: Uint8Array; ciphertext: Uint8Array } | null {
  const bytes = decodeCipherInput(input)
  if (!bytes) return null
  if (bytes.length < SALTED_MAGIC.length + SALTED_SALT_BYTES) return null
  for (let i = 0; i < SALTED_MAGIC.length; i++) {
    if (bytes[i] !== SALTED_MAGIC[i]) return null
  }
  return {
    salt: bytes.slice(SALTED_MAGIC.length, SALTED_MAGIC.length + SALTED_SALT_BYTES),
    ciphertext: bytes.slice(SALTED_MAGIC.length + SALTED_SALT_BYTES),
  }
}

// ---- KDF ----

/**
 * EVP_BytesToKey（MD5 摘要、1 轮，`openssl enc -md md5` 传统口径）：
 *   D_1 = MD5(password ‖ salt)；D_i = MD5(D_{i-1} ‖ password ‖ salt)
 *   key ‖ iv = D_1 ‖ D_2 ‖ …（取够 keyLen + ivLen 字节）
 */
export function evpBytesToKeyMd5(
  password: Uint8Array,
  salt: Uint8Array,
  keyLen: number,
  ivLen: number,
): { key: Uint8Array; iv: Uint8Array } {
  const out = new Uint8Array(keyLen + ivLen)
  let derived: Uint8Array | null = null
  let offset = 0
  while (offset < out.length) {
    const d = new Md5Digest()
    if (derived) d.update(derived)
    d.update(password)
    d.update(salt)
    derived = d.digestBytes()
    const copy = Math.min(derived.length, out.length - offset)
    out.set(derived.subarray(0, copy), offset)
    offset += copy
  }
  return { key: out.slice(0, keyLen), iv: out.slice(keyLen, keyLen + ivLen) }
}

/** PBKDF2-SHA256 派生 key‖iv 连续流（`openssl enc -pbkdf2` 口径：一次派生 keyLen+16 字节再切分）。 */
export async function pbkdf2KeyAndIv(
  passphrase: string,
  salt: Uint8Array,
  keyLen: number,
  ivLen: number,
  iterations: number,
): Promise<{ key: Uint8Array; iv: Uint8Array }> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    (keyLen + ivLen) * 8,
  )
  const stream = new Uint8Array(bits)
  return { key: stream.slice(0, keyLen), iv: stream.slice(keyLen, keyLen + ivLen) }
}

// ---- 解密（单向） ----

/**
 * 解密 `openssl enc` 密文。失败语义：
 * - not-salted / bad-encoding：输入侧问题（非 OpenSSL Salted__ 信封 / 编码非法）；
 * - decrypt-failed：CBC 解密或去填充失败——密钥组合（cipher × KDF × iteration × 口令）不匹配
 *   或密文损坏，二者不可区分，UI 提示换组合；
 * - unsupported-192：运行环境不支持 AES-192（WKWebView/Safari）。
 */
export async function decryptOpenSsl(args: {
  input: string
  passphrase: string
  cipher: OpenSslCipher
  kdf: OpenSslKdf
  /** PBKDF2 档位手填迭代数（默认 10000）；legacy MD5 档位忽略。 */
  iterations?: number
}): Promise<OpenSslDecryptOutcome> {
  const parsed = parseSaltedInput(args.input)
  if (!parsed) {
    const bytes = decodeCipherInput(args.input)
    return { ok: false, reason: bytes ? 'not-salted' : 'bad-encoding' }
  }
  const keyLen = cipherKeyBytes(args.cipher)
  const { key, iv } =
    args.kdf === 'md5'
      ? evpBytesToKeyMd5(new TextEncoder().encode(args.passphrase), parsed.salt, keyLen, CBC_IV_BYTES)
      : await pbkdf2KeyAndIv(
          args.passphrase,
          parsed.salt,
          keyLen,
          CBC_IV_BYTES,
          // 钳制闸：手输巨值/负数/小数统一收敛（见 normalizeOpenSslIterations）
          normalizeOpenSslIterations(args.iterations ?? DEFAULT_PBKDF2_ITERATIONS),
        )

  let cryptoKey: CryptoKey
  try {
    cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-CBC', false, ['decrypt'])
  } catch (err) {
    if (key.length === 24 && isUnsupportedKeyLengthError(err)) {
      return { ok: false, reason: 'unsupported-192' }
    }
    return { ok: false, reason: 'decrypt-failed' }
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv as BufferSource },
      cryptoKey,
      parsed.ciphertext as BufferSource,
    )
    return { ok: true, plaintext: new TextDecoder().decode(plaintext) }
  } catch {
    return { ok: false, reason: 'decrypt-failed' }
  }
}
