/// <reference types="node" />
import { createHmac } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  applyJwtTimePreset,
  decodeJwt,
  ecdsaJwtSignatureToWebCrypto,
  ecdsaWebCryptoSignatureToJwt,
  generateJwt,
  jwtPresetUnixSeconds,
  parseJwtJsonObject,
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

function decodeBase64UrlToJson(segment: string): unknown {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

describe('parseJwtJsonObject', () => {
  it('解析 JSON 对象', () => {
    expect(parseJwtJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('非法 JSON 返回 json', () => {
    expect(parseJwtJsonObject('{')).toEqual({ ok: false, reason: 'json' })
  })

  it('非对象返回 not-object', () => {
    expect(parseJwtJsonObject('[1,2]')).toEqual({ ok: false, reason: 'not-object' })
    expect(parseJwtJsonObject('"user"')).toEqual({ ok: false, reason: 'not-object' })
  })
})

describe('jwtPresetUnixSeconds / applyJwtTimePreset', () => {
  const nowMs = 1_700_000_000_500

  it('注入时钟后快捷值按 Unix 秒计算（截断到秒）', () => {
    expect(jwtPresetUnixSeconds('now', nowMs)).toBe(1_700_000_000)
    expect(jwtPresetUnixSeconds('plus-1h', nowMs)).toBe(1_700_000_000 + 3600)
    expect(jwtPresetUnixSeconds('plus-24h', nowMs)).toBe(1_700_000_000 + 86_400)
  })

  it('exp/iat 快捷写入 payload：纯函数、值来自注入时钟、claim 不存在时新增', () => {
    const base = { sub: 'user-1' }
    const withIat = applyJwtTimePreset(base, 'iat', 'now', nowMs)
    expect(withIat).toEqual({ sub: 'user-1', iat: 1_700_000_000 })
    const withExp = applyJwtTimePreset(withIat, 'exp', 'plus-24h', nowMs)
    expect(withExp).toEqual({ sub: 'user-1', iat: 1_700_000_000, exp: 1_700_000_000 + 86_400 })
    expect(base).toEqual({ sub: 'user-1' })
    expect(withIat).not.toBe(base)
  })
})

describe('generateJwt', () => {
  const headerText = '{"alg":"HS256","typ":"JWT"}'
  const payloadText = '{"sub":"user-1","exp":4102444800,"role":["admin"]}'
  const secret = 'generate-secret'

  async function generateOk(header: string, payload: string, secretInput: string) {
    const result = await generateJwt({ headerText: header, payloadText: payload, secret: secretInput })
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
    return result
  }

  it('HS256 签名与 node:crypto createHmac 独立真值一致', async () => {
    const result = await generateOk(headerText, payloadText, secret)
    const [headerSegment, payloadSegment, signatureSegment] = result.token.split('.')
    const signingInput = `${headerSegment}.${payloadSegment}`
    const expected = createHmac('sha256', secret)
      .update(signingInput)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(signatureSegment).toBe(expected)
  })

  it('生成 token 为三段式，header/payload 为无 padding 的 base64url 且编码正确', async () => {
    const result = await generateOk(headerText, payloadText, secret)
    const segments = result.token.split('.')
    expect(segments).toHaveLength(3)
    for (const segment of segments) {
      expect(segment).not.toMatch(/[=+/]/)
    }
    expect(decodeBase64UrlToJson(segments[0]!)).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(decodeBase64UrlToJson(segments[1]!)).toEqual(JSON.parse(payloadText))
    expect(result.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(result.payload).toEqual(JSON.parse(payloadText))
  })

  it('同 secret 可被 verifyJwt 闭环验签通过，错误 secret 验签失败', async () => {
    const result = await generateOk(headerText, payloadText, secret)
    await expect(verifyJwt(result.token, secret)).resolves.toEqual({ ok: true, valid: true })
    await expect(verifyJwt(result.token, 'wrong-secret')).resolves.toEqual({ ok: true, valid: false })
  })

  it('exp/iat 快捷产生的 claims 按输入序列化进 token', async () => {
    const nowMs = 1_700_000_000_000
    const payload = applyJwtTimePreset(
      applyJwtTimePreset({ sub: 'user-1' }, 'iat', 'now', nowMs),
      'exp',
      'plus-1h',
      nowMs,
    )
    const result = await generateOk(headerText, JSON.stringify(payload), secret)
    expect(decodeBase64UrlToJson(result.token.split('.')[1]!)).toEqual({
      sub: 'user-1',
      iat: 1_700_000_000,
      exp: 1_700_000_000 + 3600,
    })
  })

  it('非法 payload JSON 返回 payload-json 且不产出 token', async () => {
    const result = await generateJwt({ headerText, payloadText: '{"sub":', secret })
    expect(result).toEqual({ ok: false, reason: 'payload-json' })
  })

  it('payload 非 JSON 对象（数组/字符串）返回 payload-not-object', async () => {
    await expect(generateJwt({ headerText, payloadText: '[1,2]', secret }))
      .resolves.toEqual({ ok: false, reason: 'payload-not-object' })
    await expect(generateJwt({ headerText, payloadText: '"user"', secret }))
      .resolves.toEqual({ ok: false, reason: 'payload-not-object' })
  })

  it('非法 header JSON 返回 header-json，header 非对象返回 header-not-object', async () => {
    await expect(generateJwt({ headerText: '{', payloadText, secret }))
      .resolves.toEqual({ ok: false, reason: 'header-json' })
    await expect(generateJwt({ headerText: '[]', payloadText, secret }))
      .resolves.toEqual({ ok: false, reason: 'header-not-object' })
  })

  it('空 secret 返回 empty-secret', async () => {
    await expect(generateJwt({ headerText, payloadText, secret: '   ' }))
      .resolves.toEqual({ ok: false, reason: 'empty-secret' })
  })
})
