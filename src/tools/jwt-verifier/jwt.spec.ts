import { beforeAll, describe, expect, it } from 'vitest'
import {
  decodeJwt,
  ecdsaJwtSignatureToWebCrypto,
  ecdsaWebCryptoSignatureToJwt,
  verifyJwt,
} from './jwt'

const textEncoder = new TextEncoder()

function encodeBase64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function createJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signature: Uint8Array,
): string {
  const encodeJson = (value: Record<string, unknown>) => encodeBase64Url(JSON.stringify(value))
  return `${encodeJson(header)}.${encodeJson(payload)}.${encodeBase64Url(signature)}`
}

async function importSigningKey(algorithm: 'RS256' | 'ES256', jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    algorithm === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

async function signJwt(
  algorithm: 'HS256' | 'RS256' | 'ES256',
  signingInput: string,
  key: CryptoKey,
): Promise<Uint8Array> {
  const message = textEncoder.encode(signingInput)
  const signature = await crypto.subtle.sign(
    algorithm === 'HS256'
      ? { name: 'HMAC', hash: 'SHA-256' }
      : algorithm === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
        : { name: 'ECDSA', hash: 'SHA-256' },
    key,
    message,
  )
  return algorithm === 'ES256' ? ecdsaWebCryptoSignatureToJwt(signature) : new Uint8Array(signature)
}

const header = { alg: 'HS256', typ: 'JWT' }
const payload = { sub: 'user-1', exp: 4102444800 }

describe('decodeJwt', () => {
  it('解码合法 JWT 的 header 与 payload', () => {
    const result = decodeJwt(createJwt(header, payload, new Uint8Array(32)))

    expect(result).toMatchObject({
      ok: true,
      header,
      payload,
    })
  })

  it('空输入提示为 empty', () => {
    expect(decodeJwt('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('非三段输入提示为 segment-count', () => {
    expect(decodeJwt('a.b')).toEqual({ ok: false, reason: 'segment-count' })
    expect(decodeJwt('a.b.c.d')).toEqual({ ok: false, reason: 'segment-count' })
  })

  it('空段输入提示为 empty-segment', () => {
    expect(decodeJwt('a..c')).toEqual({ ok: false, reason: 'empty-segment' })
  })

  it('非法 Base64URL 提示为 base64url', () => {
    expect(decodeJwt('a+b.c.d')).toEqual({ ok: false, reason: 'base64url' })
    expect(decodeJwt('e30=.e30.c2ln')).toEqual({ ok: false, reason: 'base64url' })
  })

  it('JSON 解析失败提示为 json', () => {
    const badHeader = encodeBase64Url('{not-json')
    expect(decodeJwt(`${badHeader}.${encodeBase64Url(JSON.stringify(payload))}.c2ln`))
      .toEqual({ ok: false, reason: 'json' })
  })

  it('JSON 数组提示为 not-object', () => {
    const arrayHeader = encodeBase64Url('[]')
    expect(decodeJwt(`${arrayHeader}.${encodeBase64Url(JSON.stringify(payload))}.c2ln`))
      .toEqual({ ok: false, reason: 'not-object' })
  })
})

describe('verifyJwt', () => {
  let hsKey: CryptoKey
  let rsaPrivateJwk: JsonWebKey
  let rsaPublicJwk: JsonWebKey
  let rsaWrongPublicJwk: JsonWebKey
  let ecPrivateJwk: JsonWebKey
  let ecPublicJwk: JsonWebKey
  let ecWrongPublicJwk: JsonWebKey

  beforeAll(async () => {
    hsKey = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode('correct-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const rsa = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )
    rsaPrivateJwk = await crypto.subtle.exportKey('jwk', rsa.privateKey)
    rsaPublicJwk = await crypto.subtle.exportKey('jwk', rsa.publicKey)
    const wrongRsa = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )
    rsaWrongPublicJwk = await crypto.subtle.exportKey('jwk', wrongRsa.publicKey)

    const ec = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    ecPrivateJwk = await crypto.subtle.exportKey('jwk', ec.privateKey)
    ecPublicJwk = await crypto.subtle.exportKey('jwk', ec.publicKey)
    const wrongEc = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    ecWrongPublicJwk = await crypto.subtle.exportKey('jwk', wrongEc.publicKey)
  })

  it('HS256 正确密钥通过，错误密钥失败', async () => {
    const encodedHeader = encodeBase64Url(JSON.stringify(header))
    const encodedPayload = encodeBase64Url(JSON.stringify(payload))
    const token = createJwt(header, payload, await signJwt('HS256', `${encodedHeader}.${encodedPayload}`, hsKey))

    await expect(verifyJwt(token, 'correct-secret')).resolves.toEqual({ ok: true, valid: true })
    await expect(verifyJwt(token, 'wrong-secret')).resolves.toEqual({ ok: true, valid: false })
  })

  it('RS256 正确公钥通过，错误公钥失败', async () => {
    const signingKey = await importSigningKey('RS256', rsaPrivateJwk)
    const encodedHeader = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const encodedPayload = encodeBase64Url(JSON.stringify(payload))
    const token = createJwt(
      { alg: 'RS256', typ: 'JWT' },
      payload,
      await signJwt('RS256', `${encodedHeader}.${encodedPayload}`, signingKey),
    )

    await expect(verifyJwt(token, JSON.stringify(rsaPublicJwk))).resolves.toEqual({ ok: true, valid: true })
    await expect(verifyJwt(token, JSON.stringify(rsaWrongPublicJwk))).resolves.toEqual({ ok: true, valid: false })
  })

  it('ES256 正确公钥通过，错误公钥失败', async () => {
    const signingKey = await importSigningKey('ES256', ecPrivateJwk)
    const encodedHeader = encodeBase64Url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
    const encodedPayload = encodeBase64Url(JSON.stringify(payload))
    const token = createJwt(
      { alg: 'ES256', typ: 'JWT' },
      payload,
      await signJwt('ES256', `${encodedHeader}.${encodedPayload}`, signingKey),
    )

    await expect(verifyJwt(token, JSON.stringify(ecPublicJwk))).resolves.toEqual({ ok: true, valid: true })
    await expect(verifyJwt(token, JSON.stringify(ecWrongPublicJwk))).resolves.toEqual({ ok: true, valid: false })
  })

  it('ES256 签名在 JWT DER 与 Web Crypto raw 格式之间正确转换', async () => {
    const rawSignature = new Uint8Array(64).map((_, index) => (index * 37 + 11) % 256)
    const derSignature = ecdsaWebCryptoSignatureToJwt(rawSignature.buffer)

    expect([...ecdsaJwtSignatureToWebCrypto(derSignature)!]).toEqual([...rawSignature])
  })

  it('畸形 ES256 DER 签名返回验签失败而不是误当 raw 使用', async () => {
    const signingKey = await importSigningKey('ES256', ecPrivateJwk)
    const encodedHeader = encodeBase64Url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
    const encodedPayload = encodeBase64Url(JSON.stringify(payload))
    const validDer = await signJwt('ES256', `${encodedHeader}.${encodedPayload}`, signingKey)
    const malformed = new Uint8Array(validDer)
    malformed[2] = 0x03
    const token = createJwt(
      { alg: 'ES256', typ: 'JWT' },
      payload,
      malformed,
    )

    await expect(verifyJwt(token, JSON.stringify(ecPublicJwk))).resolves.toEqual({
      ok: true,
      valid: false,
    })
  })

  it('不支持的算法返回 unsupported-alg', async () => {
    const token = createJwt({ alg: 'HS512' }, payload, new Uint8Array(64))
    await expect(verifyJwt(token, 'secret')).resolves.toEqual({ ok: false, reason: 'unsupported-alg' })
  })
})
