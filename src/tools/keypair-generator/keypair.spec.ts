/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// 跨工具导入仅允许出现在测试文件（闭环锚）：生成的 PEM 必须能被
// jwt-verifier 的 importKey/签发/验签直接消费（票据 08 验收口径）。
import { generateJwt, parsePemPrivateKey, verifyJwt } from '../jwt-verifier/jwt'
import {
  EC_CURVE_TIERS,
  KEYPAIR_PROFILES,
  RSA_BITS_TIERS,
  derToPem,
  formatElapsedMs,
  generateKeypair,
  resolveProfile,
} from './keypair'

const textEncoder = new TextEncoder()

/** 真生成的档位：RSA 4096 可达数十秒——仅测配置映射，不真生成。 */
const GENERATED_PROFILES = ['rsa-2048', 'rsa-3072', 'ec-p256', 'ec-p384', 'ec-p521'] as const

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

/** 剥掉 PEM 头尾行取出 DER（独立于被测实现解码，避免同义反复）。 */
function pemBodyToBytes(pem: string): Uint8Array {
  const body = pem
    .split(/\r?\n/)
    .filter(line => !line.startsWith('-----'))
    .join('')
  const binary = atob(body)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function encodeBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Node webcrypto 的 hash 是 { name } 对象、浏览器是字符串——归一后断言。 */
function hashName(algorithm: RsaHashedKeyAlgorithm): string {
  const hash = algorithm.hash as string | { name: string } | undefined
  return typeof hash === 'string' ? hash : (hash?.name ?? '')
}

/* ------------------------------------------------------------------ *
 * 档位 → 算法参数映射
 * ------------------------------------------------------------------ */

describe('档位 → 算法参数 / JWT alg 映射', () => {
  it('RSA 三档均为 RSASSA-PKCS1-v1_5 + SHA-256（e=65537）并标 RS256', () => {
    for (const tier of RSA_BITS_TIERS) {
      const profile = resolveProfile('rsa', tier)
      expect(profile.jwtAlg).toBe('RS256')
      const algorithm = profile.algorithm as RsaHashedKeyGenParams
      expect(algorithm.name).toBe('RSASSA-PKCS1-v1_5')
      expect(algorithm.hash).toBe('SHA-256')
      expect(algorithm.modulusLength).toBe(Number(tier))
      expect([...algorithm.publicExponent]).toEqual([1, 0, 1])
    }
  })

  it('EC 三档曲线名正确并分别标 ES256 / ES384 / ES512', () => {
    expect(resolveProfile('ec', 'p256')).toMatchObject({
      jwtAlg: 'ES256',
      algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
    })
    expect(resolveProfile('ec', 'p384')).toMatchObject({
      jwtAlg: 'ES384',
      algorithm: { name: 'ECDSA', namedCurve: 'P-384' },
    })
    expect(resolveProfile('ec', 'p521')).toMatchObject({
      jwtAlg: 'ES512',
      algorithm: { name: 'ECDSA', namedCurve: 'P-521' },
    })
    expect(EC_CURVE_TIERS).toEqual(['p256', 'p384', 'p521'])
  })

  it('档位全集固定六档：无自由 bits、无 Ed25519（出界档位不得混入）', () => {
    expect(Object.keys(KEYPAIR_PROFILES).sort()).toEqual([
      'ec-p256',
      'ec-p384',
      'ec-p521',
      'rsa-2048',
      'rsa-3072',
      'rsa-4096',
    ])
  })
})

/* ------------------------------------------------------------------ *
 * PEM 包装（RFC 7468）：已知向量 + 生成输出的形状
 * ------------------------------------------------------------------ */

describe('derToPem（RFC 7468 已知向量）', () => {
  it('短 DER：base64 体单行 + 头尾包装', () => {
    const der = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05])
    expect(derToPem(der, 'PRIVATE KEY')).toBe(
      '-----BEGIN PRIVATE KEY-----\nMAMCAQU=\n-----END PRIVATE KEY-----',
    )
    expect(derToPem(der, 'PUBLIC KEY')).toBe(
      '-----BEGIN PUBLIC KEY-----\nMAMCAQU=\n-----END PUBLIC KEY-----',
    )
  })

  it('长 DER：base64 体按 64 字符换行', () => {
    // 60 字节 0x41 → base64 恰为 80 字符 'QUFB'×20 → 64 + 16 两行。
    const der = new Uint8Array(60).fill(0x41)
    const expected = ['QUFB'.repeat(16), 'QUFB'.repeat(4)].join('\n')
    expect(derToPem(der, 'PRIVATE KEY')).toBe(
      `-----BEGIN PRIVATE KEY-----\n${expected}\n-----END PRIVATE KEY-----`,
    )
  })
})

describe.each(GENERATED_PROFILES)('生成输出 PEM 形状（%s）', profileId => {
  it('PKCS#8 / SPKI 双 PEM：头尾行正确、base64 体每行 ≤64 字符且非末行恰 64、DER 以 SEQUENCE 开头', async () => {
    const pair = await generateKeypair(profileId)
    const cases = [
      [pair.privateKeyPem, 'PRIVATE KEY'],
      [pair.publicKeyPem, 'PUBLIC KEY'],
    ] as const

    for (const [pem, label] of cases) {
      const lines = pem.split('\n')
      expect(lines[0]).toBe(`-----BEGIN ${label}-----`)
      expect(lines.at(-1)).toBe(`-----END ${label}-----`)

      const body = lines.slice(1, -1)
      expect(body.length).toBeGreaterThan(0)
      for (const [index, line] of body.entries()) {
        expect(line).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
        expect(line.length).toBeLessThanOrEqual(64)
        if (index < body.length - 1) expect(line).toHaveLength(64)
      }

      const der = pemBodyToBytes(pem)
      expect(der.length).toBeGreaterThan(0)
      expect(der[0]).toBe(0x30)
    }
  })
})

/* ------------------------------------------------------------------ *
 * 生成 → importKey roundtrip 自验证（含 ES384/ES512：verifier 未支持，如实标注）
 * ------------------------------------------------------------------ */

describe.each(GENERATED_PROFILES)('生成 → importKey roundtrip（%s）', profileId => {
  it('私钥 PKCS#8 可重导入（extractable + sign）且算法参数还原', async () => {
    const pair = await generateKeypair(profileId)
    const profile = KEYPAIR_PROFILES[profileId]
    const key = await crypto.subtle.importKey(
      'pkcs8',
      toArrayBuffer(pemBodyToBytes(pair.privateKeyPem)),
      profile.algorithm,
      true,
      ['sign'],
    )

    expect(key.type).toBe('private')
    expect(key.extractable).toBe(true)
    expect(key.usages).toContain('sign')

    const algorithm = key.algorithm
    expect(algorithm.name).toBe(profile.algorithm.name)
    if (profile.family === 'rsa') {
      expect((algorithm as RsaHashedKeyAlgorithm).modulusLength).toBe(
        (profile.algorithm as RsaHashedKeyGenParams).modulusLength,
      )
      expect(hashName(algorithm as RsaHashedKeyAlgorithm)).toBe('SHA-256')
    } else {
      expect((algorithm as EcKeyAlgorithm).namedCurve).toBe(
        (profile.algorithm as EcKeyGenParams).namedCurve,
      )
    }
  })

  it('公钥 SPKI 可重导入（verify）且算法参数还原', async () => {
    const pair = await generateKeypair(profileId)
    const profile = KEYPAIR_PROFILES[profileId]
    const key = await crypto.subtle.importKey(
      'spki',
      toArrayBuffer(pemBodyToBytes(pair.publicKeyPem)),
      profile.algorithm,
      false,
      ['verify'],
    )

    expect(key.type).toBe('public')
    expect(key.usages).toContain('verify')

    const algorithm = key.algorithm
    expect(algorithm.name).toBe(profile.algorithm.name)
    if (profile.family === 'rsa') {
      expect((algorithm as RsaHashedKeyAlgorithm).modulusLength).toBe(
        (profile.algorithm as RsaHashedKeyGenParams).modulusLength,
      )
    } else {
      expect((algorithm as EcKeyAlgorithm).namedCurve).toBe(
        (profile.algorithm as EcKeyGenParams).namedCurve,
      )
    }
  })
})

/* ------------------------------------------------------------------ *
 * 闭环向量：生成 → jwt-verifier 签发 → 验签（RS256 / ES256）
 * ------------------------------------------------------------------ */

describe.each([
  { profileId: 'rsa-2048', algorithm: 'RS256' },
  { profileId: 'ec-p256', algorithm: 'ES256' },
] as const)('闭环向量（%s → jwt-verifier %s）', ({ profileId, algorithm }) => {
  const headerText = '{"typ":"JWT"}'
  const payloadText = '{"sub":"keypair-closure","exp":4102444800}'

  async function signWithGeneratedPair() {
    const pair = await generateKeypair(profileId)
    const signed = await generateJwt({
      headerText,
      payloadText,
      algorithm,
      secret: '',
      privateKeyPem: pair.privateKeyPem,
    })
    if (!signed.ok) throw new Error(`expected ok, got ${signed.reason}`)
    return { pair, token: signed.token }
  }

  it('PKCS#8 私钥经 generateJwt 签发，SPKI 公钥经 verifyJwt 验签通过', async () => {
    const { pair, token } = await signWithGeneratedPair()
    await expect(verifyJwt(token, pair.publicKeyPem)).resolves.toEqual({ ok: true, valid: true })
  })

  it('私钥 PEM 可被 jwt-verifier 的 PKCS#8 口径解析器接受', async () => {
    const pair = await generateKeypair(profileId)
    const parsed = parsePemPrivateKey(pair.privateKeyPem)
    expect(parsed.ok).toBe(true)
  })

  it('篡改 payload 后验签失败（闭环真实有效）', async () => {
    const { pair, token } = await signWithGeneratedPair()
    const [headerSegment, , signatureSegment] = token.split('.')
    const tampered = `${headerSegment}.${encodeBase64Url('{"sub":"attacker"}')}.${signatureSegment}`
    await expect(verifyJwt(tampered, pair.publicKeyPem)).resolves.toEqual({
      ok: true,
      valid: false,
    })
  })
})

/* ------------------------------------------------------------------ *
 * ES384 / ES512：jwt-verifier 未支持（import 参数硬编码 P-256），仅原生自洽
 * ------------------------------------------------------------------ */

describe.each([
  { profileId: 'ec-p384', hash: 'SHA-384' },
  { profileId: 'ec-p521', hash: 'SHA-512' },
] as const)('ES384/ES512 档位（verifier 未支持，仅原生 sign/verify 自洽）（%s）', ({ profileId, hash }) => {
  it('私钥按标注 alg 原生 sign、公钥原生 verify 自洽（import 参数复刻 verifier 形态）', async () => {
    const pair = await generateKeypair(profileId)
    const params = KEYPAIR_PROFILES[profileId].algorithm as EcKeyGenParams

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      toArrayBuffer(pemBodyToBytes(pair.privateKeyPem)),
      params,
      false,
      ['sign'],
    )
    const publicKey = await crypto.subtle.importKey(
      'spki',
      toArrayBuffer(pemBodyToBytes(pair.publicKeyPem)),
      params,
      false,
      ['verify'],
    )

    const message = textEncoder.encode(`${pair.jwtAlg} self-consistency`)
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash }, privateKey, message)
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash }, publicKey, signature, message)
    expect(valid).toBe(true)
  })
})

/* ------------------------------------------------------------------ *
 * 耗时显示
 * ------------------------------------------------------------------ */

describe('耗时显示（formatElapsedMs）', () => {
  it('毫秒 / 秒 / 分秒三段格式，负值钳制为 0', () => {
    expect(formatElapsedMs(0)).toBe('0 ms')
    expect(formatElapsedMs(-5)).toBe('0 ms')
    expect(formatElapsedMs(812.4)).toBe('812 ms')
    expect(formatElapsedMs(1834)).toBe('1.83 s')
    expect(formatElapsedMs(72_500)).toBe('1 min 12.5 s')
  })
})

/* ------------------------------------------------------------------ *
 * 持久化纪律（防回归）：私钥仅内存级，不落任何持久化存储
 * ------------------------------------------------------------------ */

describe('持久化纪律（防回归）', () => {
  it('工具源码不引用任何持久化存储 API（localStorage/sessionStorage/indexedDB/cookie）', () => {
    // 静态层面守卫（代码审查口径）：逻辑层本就无写存储函数，此测试防未来回归。
    const sourceFiles = ['index.ts', 'keypair.ts', 'KeypairGenerator.vue'].map(name =>
      fileURLToPath(new URL(name, import.meta.url)),
    )

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8')
      for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
        expect(source.includes(api), `${file} 不应引用持久化 API：${api}`).toBe(false)
      }
    }
  })
})
