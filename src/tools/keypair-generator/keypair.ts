/**
 * RSA / EC 密钥对生成逻辑（票据 08）。
 *
 * 生成与导出全部走浏览器原生 WebCrypto：generateKey 产出 CryptoKeyPair，
 * exportKey('pkcs8' | 'spki') 原生产出 DER——PEM 只是 base64 + 头尾包装
 * （RFC 7468，64 字符换行），ASN.1 自实现取消，0 新增依赖。
 *
 * 密钥文本形态唯一口径 = CONTEXT.md「密钥文本形态」：私钥 PKCS#8
 * （`BEGIN PRIVATE KEY`）+ 公钥 SPKI（`BEGIN PUBLIC KEY`）唯二形态；
 * PKCS#1（`RSA PRIVATE KEY`）、SEC1、加密 PEM、OpenSSH 一律不生成，
 * 与 jwt-verifier 的导入端对称互认。
 *
 * 持久化纪律：本模块与组件均不写任何存储——密钥仅存在于调用方内存。
 */

export type KeypairFamily = 'rsa' | 'ec'

/** RSA 模数档位（自由 bits 不做：低档不安全，it-tools 式自由位数出界）。 */
export type RsaBitsTier = '2048' | '3072' | '4096'

/** EC 曲线档位。 */
export type EcCurveTier = 'p256' | 'p384' | 'p521'

export type KeypairProfileId =
  | 'rsa-2048'
  | 'rsa-3072'
  | 'rsa-4096'
  | 'ec-p256'
  | 'ec-p384'
  | 'ec-p521'

/** 每档标注的 JWT alg 名：RSA 全档 RS256；EC 按曲线 ES256 / ES384 / ES512。 */
export type KeypairJwtAlg = 'RS256' | 'ES256' | 'ES384' | 'ES512'

export interface KeypairProfile {
  id: KeypairProfileId
  family: KeypairFamily
  jwtAlg: KeypairJwtAlg
  /** generateKey / importKey 共用的算法参数（RSA 内含 SHA-256）。 */
  algorithm: RsaHashedKeyGenParams | EcKeyGenParams
}

export const RSA_BITS_TIERS: readonly RsaBitsTier[] = ['2048', '3072', '4096']
export const EC_CURVE_TIERS: readonly EcCurveTier[] = ['p256', 'p384', 'p521']

/** 曲线档位 → 展示名（控件标签用）。 */
export const EC_CURVE_NAMES: Record<EcCurveTier, 'P-256' | 'P-384' | 'P-521'> = {
  p256: 'P-256',
  p384: 'P-384',
  p521: 'P-521',
}

const RSA_PROFILE_BY_BITS: Record<RsaBitsTier, KeypairProfile> = {
  '2048': {
    id: 'rsa-2048',
    family: 'rsa',
    jwtAlg: 'RS256',
    algorithm: {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // e = 65537
      hash: 'SHA-256',
    },
  },
  '3072': {
    id: 'rsa-3072',
    family: 'rsa',
    jwtAlg: 'RS256',
    algorithm: {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
  },
  '4096': {
    id: 'rsa-4096',
    family: 'rsa',
    jwtAlg: 'RS256',
    algorithm: {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
  },
}

const EC_JWT_ALG_BY_TIER: Record<EcCurveTier, KeypairJwtAlg> = {
  p256: 'ES256',
  p384: 'ES384',
  p521: 'ES512',
}

const EC_PROFILE_BY_CURVE: Record<EcCurveTier, KeypairProfile> = {
  p256: ecProfile('ec-p256', 'p256'),
  p384: ecProfile('ec-p384', 'p384'),
  p521: ecProfile('ec-p521', 'p521'),
}

function ecProfile(id: 'ec-p256' | 'ec-p384' | 'ec-p521', tier: EcCurveTier): KeypairProfile {
  return {
    id,
    family: 'ec',
    jwtAlg: EC_JWT_ALG_BY_TIER[tier],
    algorithm: { name: 'ECDSA', namedCurve: EC_CURVE_NAMES[tier] },
  }
}

/** 全六档档案（只读索引；档位固定，无自由 bits / Ed25519）。 */
export const KEYPAIR_PROFILES: Readonly<Record<KeypairProfileId, KeypairProfile>> = {
  'rsa-2048': RSA_PROFILE_BY_BITS['2048'],
  'rsa-3072': RSA_PROFILE_BY_BITS['3072'],
  'rsa-4096': RSA_PROFILE_BY_BITS['4096'],
  'ec-p256': EC_PROFILE_BY_CURVE.p256,
  'ec-p384': EC_PROFILE_BY_CURVE.p384,
  'ec-p521': EC_PROFILE_BY_CURVE.p521,
}

/** 控件选择（算法族 + 档位）→ 档位档案。生成类非实时：只影响下一次生成。 */
export function resolveProfile(
  family: KeypairFamily,
  tier: RsaBitsTier | EcCurveTier,
): KeypairProfile {
  const profile =
    family === 'rsa'
      ? RSA_PROFILE_BY_BITS[tier as RsaBitsTier]
      : EC_PROFILE_BY_CURVE[tier as EcCurveTier]
  if (!profile) throw new Error(`unknown keypair tier: ${family}/${String(tier)}`)
  return profile
}

export interface GeneratedKeypair {
  profileId: KeypairProfileId
  jwtAlg: KeypairJwtAlg
  /** PKCS#8 PEM（`BEGIN PRIVATE KEY`）——敏感信息，仅内存级。 */
  privateKeyPem: string
  /** SPKI PEM（`BEGIN PUBLIC KEY`）。 */
  publicKeyPem: string
}

/**
 * 生成密钥对并导出双 PEM。WebCrypto 原生异步——RSA 4096 可达数十秒但不
 * 冻结 UI（无需 Worker）；调用方负责 performance.now 计时与 pending 态。
 */
export async function generateKeypair(profileId: KeypairProfileId): Promise<GeneratedKeypair> {
  const profile = KEYPAIR_PROFILES[profileId]
  const pair = await crypto.subtle.generateKey(profile.algorithm, true, ['sign', 'verify'])

  const privateKeyPem = derToPem(
    new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    'PRIVATE KEY',
  )
  const publicKeyPem = derToPem(
    new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)),
    'PUBLIC KEY',
  )

  return { profileId, jwtAlg: profile.jwtAlg, privateKeyPem, publicKeyPem }
}

export type PemLabel = 'PRIVATE KEY' | 'PUBLIC KEY'

/** RFC 7468 文本封装：base64 体按 64 字符换行，夹在 BEGIN/END 标签行之间。 */
export function derToPem(der: Uint8Array, label: PemLabel): string {
  const lines = bytesToBase64(der).match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** 耗时显示：performance.now 差值 → 文本（<1s 毫秒；<1min 秒；以上分秒）。 */
export function formatElapsedMs(elapsedMs: number): string {
  const clamped = Math.max(0, elapsedMs)
  if (clamped < 1000) return `${Math.round(clamped)} ms`
  if (clamped < 60_000) return `${(clamped / 1000).toFixed(2)} s`
  const minutes = Math.floor(clamped / 60_000)
  return `${minutes} min ${((clamped - minutes * 60_000) / 1000).toFixed(1)} s`
}

/** 下载命名（平台附录「输出命名」：private.pem / public.pem）。 */
export const PRIVATE_KEY_FILENAME = 'private.pem'
export const PUBLIC_KEY_FILENAME = 'public.pem'
