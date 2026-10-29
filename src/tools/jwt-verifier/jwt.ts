export type JwtDecodeErrorCode =
  | 'empty'
  | 'segment-count'
  | 'empty-segment'
  | 'base64url'
  | 'json'
  | 'not-object'

export type JwtVerifyErrorCode =
  | 'unsupported-alg'
  | 'invalid-key'
  | 'verification-error'

export type JwtGenerateErrorCode =
  | 'empty-secret'
  | 'header-json'
  | 'header-not-object'
  | 'payload-json'
  | 'payload-not-object'

export type JwtGenerateResult =
  | {
      ok: true
      token: string
      header: Record<string, unknown>
      payload: Record<string, unknown>
    }
  | {
      ok: false
      reason: JwtGenerateErrorCode
    }

export type JwtGenerateInput = {
  headerText: string
  payloadText: string
  secret: string
}

/** exp/iat 时间快捷的预设（CONTEXT.md：时间值以 Unix 秒计）。 */
export type JwtTimePreset = 'now' | 'plus-1h' | 'plus-24h'

export type JwtTimeClaim = 'exp' | 'iat'

export type JwtDecodeResult =
  | {
      ok: true
      header: Record<string, unknown>
      payload: Record<string, unknown>
      signature: Uint8Array
      signingInput: string
    }
  | {
      ok: false
      reason: JwtDecodeErrorCode
    }

export type JwtVerifyResult =
  | { ok: true; valid: boolean }
  | { ok: false; reason: JwtVerifyErrorCode }

const BASE64URL_VALUES = new Map(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    .split('')
    .map((character, index) => [character, index]),
)

function decodeBase64Url(segment: string): Uint8Array | null {
  const remainder = segment.length % 4
  if (remainder === 1) return null

  let bitBuffer = 0
  let bitCount = 0
  const bytes: number[] = []

  for (let index = 0; index < segment.length; index += 1) {
    const value = BASE64URL_VALUES.get(segment[index])
    if (value === undefined) return null

    if (remainder === 2 && index === segment.length - 1 && (value & 0b1111) !== 0) {
      return null
    }
    if (remainder === 3 && index === segment.length - 1 && (value & 0b11) !== 0) {
      return null
    }

    bitBuffer = (bitBuffer << 6) | value
    bitCount += 6
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((bitBuffer >> bitCount) & 0xff)
    }
  }

  return new Uint8Array(bytes)
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type JwtJsonObjectParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: 'json' | 'not-object' }

/** 解析生成视图的 header/payload 文本：非法 JSON 与非 JSON 对象是两种结构化错误。 */
export function parseJwtJsonObject(text: string): JwtJsonObjectParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { ok: false, reason: 'json' }
  }
  if (!isJsonObject(parsed)) return { ok: false, reason: 'not-object' }
  return { ok: true, value: parsed }
}

export function decodeJwt(token: string): JwtDecodeResult {
  const normalizedToken = token.trim()
  if (!normalizedToken) return { ok: false, reason: 'empty' }

  const segments = normalizedToken.split('.')
  if (segments.length !== 3) return { ok: false, reason: 'segment-count' }
  if (segments.some(segment => segment.length === 0)) {
    return { ok: false, reason: 'empty-segment' }
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments.map(segment => decodeBase64Url(segment))
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    return { ok: false, reason: 'base64url' }
  }

  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    const header = JSON.parse(decoder.decode(headerSegment)) as unknown
    const payload = JSON.parse(decoder.decode(payloadSegment)) as unknown
    if (!isJsonObject(header) || !isJsonObject(payload)) {
      return { ok: false, reason: 'not-object' }
    }

    return {
      ok: true,
      header,
      payload,
      signature: signatureSegment,
      signingInput: `${segments[0]}.${segments[1]}`,
    }
  } catch {
    return { ok: false, reason: 'json' }
  }
}

function decodeStandardBase64(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/\s+/g, '')
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

function pemToDer(pem: string): Uint8Array | null {
  const body = pem
    .split(/\r?\n/)
    .filter(line => !line.startsWith('-----'))
    .join('')
  return decodeStandardBase64(body)
}

async function importJwk(jwk: JsonWebKey, algorithm: 'RS256' | 'ES256'): Promise<CryptoKey> {
  if (algorithm === 'ES256' && jwk.kty !== 'EC') {
    throw new Error('EC key required')
  }
  if (algorithm === 'RS256' && jwk.kty !== 'RSA') {
    throw new Error('RSA key required')
  }

  const usages: KeyUsage[] = jwk.d ? ['sign', 'verify'] : ['verify']
  if (algorithm === 'RS256') {
    return crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      usages,
    )
  }
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    usages,
  )
}

async function importVerificationKey(
  algorithm: 'HS256' | 'RS256' | 'ES256',
  keyInput: string,
): Promise<CryptoKey> {
  const normalizedKey = keyInput.trim()
  if (!normalizedKey) throw new Error('empty key')

  if (algorithm === 'HS256') {
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normalizedKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  }

  if (normalizedKey.startsWith('{')) {
    const parsed = JSON.parse(normalizedKey) as unknown
    if (!isJsonObject(parsed)) throw new Error('invalid JWK')
    return importJwk(parsed as JsonWebKey, algorithm)
  }

  if (normalizedKey.startsWith('-----')) {
    const der = pemToDer(normalizedKey)
    if (!der) throw new Error('invalid PEM')
    const isPrivateKey = normalizedKey.includes('PRIVATE KEY')
    return crypto.subtle.importKey(
      isPrivateKey ? 'pkcs8' : 'spki',
      toArrayBuffer(der),
      algorithm === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
        : { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      isPrivateKey ? ['sign', 'verify'] : ['verify'],
    )
  }

  throw new Error('unsupported key format')
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

export async function verifyJwt(
  token: string,
  keyInput: string,
): Promise<JwtVerifyResult> {
  const decoded = decodeJwt(token)
  if (!decoded.ok) return { ok: false, reason: 'invalid-key' }

  const algorithm = decoded.header.alg
  if (algorithm !== 'HS256' && algorithm !== 'RS256' && algorithm !== 'ES256') {
    return { ok: false, reason: 'unsupported-alg' }
  }

  try {
    const key = await importVerificationKey(algorithm, keyInput)
    const message = new TextEncoder().encode(decoded.signingInput)

    if (algorithm === 'HS256') {
      const valid = await crypto.subtle.verify(
        { name: 'HMAC', hash: 'SHA-256' },
        key,
        toArrayBuffer(decoded.signature),
        message,
      )
      return { ok: true, valid }
    }

    const valid = await crypto.subtle.verify(
      algorithm === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
        : { name: 'ECDSA', hash: 'SHA-256' },
      key,
      toArrayBuffer(algorithm === 'ES256'
        ? ecdsaJwtSignatureToWebCrypto(decoded.signature) ?? decoded.signature
        : decoded.signature),
      message,
    )
    return { ok: true, valid }
  } catch {
    return { ok: false, reason: 'invalid-key' }
  }
}

function encodeDerLength(length: number): number[] {
  if (length < 0x80) return [length]
  const bytes: number[] = []
  let value = length
  while (value > 0) {
    bytes.unshift(value & 0xff)
    value >>>= 8
  }
  return [0x80 | bytes.length, ...bytes]
}

function encodeDerInteger(value: Uint8Array): number[] {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) start += 1
  let bytes = [...value.subarray(start)]
  if ((bytes[0] ?? 0) & 0x80) bytes = [0, ...bytes]
  return [0x02, ...encodeDerLength(bytes.length), ...bytes]
}

/** Web Crypto emits IEEE P1363 r||s, while a JWT stores ASN.1 DER r,s. */
export function ecdsaWebCryptoSignatureToJwt(rawSignature: ArrayBuffer): Uint8Array {
  const raw = new Uint8Array(rawSignature)
  if (raw.length !== 64) throw new Error('P-256 signature must contain 64 bytes')

  const r = encodeDerInteger(raw.subarray(0, 32))
  const s = encodeDerInteger(raw.subarray(32))
  const body = [...r, ...s]
  return new Uint8Array([0x30, ...encodeDerLength(body.length), ...body])
}

function readDerInteger(
  signature: Uint8Array,
  offset: number,
): { bytes: Uint8Array; next: number } | null {
  if (
    offset + 1 >= signature.length ||
    signature[offset] !== 0x02 ||
    signature[offset + 1]! >= 0x80
  ) {
    return null
  }

  const length = signature[offset + 1]!
  const start = offset + 2
  const end = start + length
  if (length === 0 || end > signature.length) return null

  let integerStart = start
  while (integerStart < end - 1 && signature[integerStart] === 0) integerStart += 1
  const bytes = signature.subarray(integerStart, end)
  if (bytes.length > 32) return null

  return { bytes, next: end }
}

export function ecdsaJwtSignatureToWebCrypto(derSignature: Uint8Array): Uint8Array | null {
  if (
    derSignature.length < 8 ||
    derSignature[0] !== 0x30 ||
    derSignature[1] !== derSignature.length - 2
  ) {
    return null
  }

  const r = readDerInteger(derSignature, 2)
  if (!r) return null

  const s = readDerInteger(derSignature, r.next)
  if (!s || s.next !== derSignature.length) return null

  const raw = new Uint8Array(64)
  raw.set(r.bytes, 32 - r.bytes.length)
  raw.set(s.bytes, 32 + (32 - s.bytes.length))
  return raw
}

const TIME_PRESET_OFFSET_SECONDS: Record<JwtTimePreset, number> = {
  now: 0,
  'plus-1h': 3600,
  'plus-24h': 86400,
}

/** 时间快捷换算：时钟由调用方注入（nowMs），返回 Unix 秒并截断到秒。 */
export function jwtPresetUnixSeconds(preset: JwtTimePreset, nowMs: number): number {
  return Math.floor(nowMs / 1000) + TIME_PRESET_OFFSET_SECONDS[preset]
}

/** 将 exp/iat 快捷值写入 payload claims：纯函数，claim 不存在时新增。 */
export function applyJwtTimePreset(
  payload: Record<string, unknown>,
  claim: JwtTimeClaim,
  preset: JwtTimePreset,
  nowMs: number,
): Record<string, unknown> {
  return { ...payload, [claim]: jwtPresetUnixSeconds(preset, nowMs) }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signJwtWithHs256(signingInput: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    { name: 'HMAC', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  )
  return new Uint8Array(signature)
}

/**
 * 生成视图的 HS256 本地签名（E2 扩展）：header / payload 均为 JSON 对象文本，
 * secret 为 UTF-8 文本，仅存于调用方内存。签名始终使用 HS256（WebCrypto
 * crypto.subtle），非对称算法不在范围内。
 */
export async function generateJwt(input: JwtGenerateInput): Promise<JwtGenerateResult> {
  const secret = input.secret.trim()
  if (!secret) return { ok: false, reason: 'empty-secret' }

  const header = parseJwtJsonObject(input.headerText)
  if (!header.ok) {
    return { ok: false, reason: header.reason === 'json' ? 'header-json' : 'header-not-object' }
  }

  const payload = parseJwtJsonObject(input.payloadText)
  if (!payload.ok) {
    return { ok: false, reason: payload.reason === 'json' ? 'payload-json' : 'payload-not-object' }
  }

  const headerSegment = encodeBase64Url(new TextEncoder().encode(JSON.stringify(header.value)))
  const payloadSegment = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload.value)))
  const signingInput = `${headerSegment}.${payloadSegment}`
  const signature = await signJwtWithHs256(signingInput, secret)

  return {
    ok: true,
    token: `${signingInput}.${encodeBase64Url(signature)}`,
    header: header.value,
    payload: payload.value,
  }
}
