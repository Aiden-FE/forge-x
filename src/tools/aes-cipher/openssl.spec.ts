import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPENSSL_CIPHER,
  DEFAULT_OPENSSL_KDF,
  DEFAULT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  decryptOpenSsl,
  evpBytesToKeyMd5,
  normalizeOpenSslIterations,
  parseSaltedInput,
  pbkdf2KeyAndIv,
} from './openssl'
import { bytesToBase64, bytesToHex, hexToBytes } from './aes'

const enc = new TextEncoder()

/**
 * 独立事实来源：本机 openssl 实测向量（OpenSSL 3.5.9，Git for Windows 自带）。
 *
 * 生成命令（2026-11-04，密文向量用随机 salt——3.5 中显式 -S 会抑制 Salted__ 头输出，
 * 而 salt 本就自描述于信封内，互通验证无需确定性）：
 *   openssl enc -e -aes-128-cbc -md md5    -k <PASS> -a -in pt.txt   （55B 明文，无尾换行）
 *   openssl enc -e -aes-256-cbc -md md5    -k <PASS> -a -in pt.txt
 *   openssl enc -e -aes-128-cbc -pbkdf2 -iter 10000 -k <PASS> -a -in pt.txt
 *   openssl enc -e -aes-256-cbc -pbkdf2 -iter 10000 -k <PASS> -a -in pt.txt
 * 每条向量均先经 openssl enc -d 自验证回原文后才录入。
 * EVP 密钥基准（确定性，salt 固定）：openssl enc … -S 0011223344556677 -P 打印 key/iv
 * （-P 只做 KDF 不写头，不受 3.5 的 -S 头抑制影响）。
 */
const PASS = 'ForgeX-Vector-Pass'
const PLAINTEXT = 'ForgeX vector plaintext 09 - OpenSSL compatible decrypt'
const SALT = hexToBytes('0011223344556677')! // 仅 KDF 基准用

// 互通向量（随机 salt 内嵌信封；openssl -a 单行输出）
const CT_BASE64 = {
  'aes-128-cbc': {
    md5: 'U2FsdGVkX19aa2tVwRjEJyCfVa+gBXCV9Tq11hvB6ZeAq+OfIzEfWlzkjvyfq9aXxVWlmVpF0FbGgQM8ci53IozF89O4jhsF4glxuqS1dVU=',
    pbkdf2: 'U2FsdGVkX19RLOFEmGSA6m9OMOTCkstB5gbw6hlqrqP47dIIla+myJm2WyDSwJEuhXqVLxlPMIroDIUnaQM784wxPoD6XrwBfd1X5Cuq5AQ=',
  },
  'aes-256-cbc': {
    md5: 'U2FsdGVkX1/47tCFWq/3MoaqKVZVMTUhnKvFU4G9wdgBGjb0YhrsciLQ+G7H8WScMaoVBwkdNyHz24YZQ0kxVAvD3zEkV0q3G1q909LU/Ms=',
    pbkdf2: 'U2FsdGVkX19pX8KNN5mDA6wTiPspfhvWpOFfM/iiSlMRS+bYJ5j/MKB4AXiALszQdUbxNSU1F/gRlR9CpO8uPrmX6ICR0bcMXLDijDRNI60=',
  },
} as const

// 同一密文的 hex 书写（hex 自动识别用；前 16 hex 字符 = "Salted__" + salt 前 8 字符）
const CT_HEX = {
  'aes-128-cbc': {
    md5: '53616c7465645f5f5a6b6b55c118c427209f55afa0057095f53ab5d61bc1e99780abe39f23311f5a5ce48efc9fabd697c555a5995a45d056c681033c722e77228cc5f3d3b88e1b05e20971baa4b57555',
    pbkdf2: '53616c7465645f5f512ce144986480ea6f4e30e4c292cb41e606f0ea196aaea3f8edd20895afa6c899b65b20d2c0912e857a952f194f308ae80c852769033bf38c313e80fa5ebc017ddd57e42baae404',
  },
  'aes-256-cbc': {
    md5: '53616c7465645f5ff8eed0855aaff73286aa2956553135219cabc55381bdc1d8011a36f4621aec7222d0f86ec7f1649c31aa1507091d3721f3db8619434931540bc3df3124574ab71b5abdd3d2d4fccb',
    pbkdf2: '53616c7465645f5f695fc28d37998303ac1388fb297e1bd6a4e15f33f8a24a53114be6d82798ff30a0780178802eccd07546f135253517f811951f42a4ef2e3eb997e88091d1b70c5cb0e28c344d23ad',
  },
} as const

// openssl enc -P 实测派生基准（key/iv）
const EVP_MD5_KEY256 = '1f9ddca1b069b7fe032db1a4b47ca51f3c1f03b6654f76b4dba901faddc9aa16'
const EVP_MD5_IV256 = '1750ca4746ba2a55279c913808faef6c'
const EVP_MD5_KEY128 = '1f9ddca1b069b7fe032db1a4b47ca51f'
const EVP_MD5_IV128 = '3c1f03b6654f76b4dba901faddc9aa16'
const PBKDF2_KEY128 = '8d7e59ebfa16354b562a97f099e9a0fb'
const PBKDF2_IV128 = 'd4161a1e113d16de8235d0b1490f25d4'
const PBKDF2_KEY256 = '8d7e59ebfa16354b562a97f099e9a0fbd4161a1e113d16de8235d0b1490f25d4'
const PBKDF2_IV256 = 'c8d122e14705ef390f202e01f583bc98'

describe('EVP_BytesToKey（MD5 1 轮）与 openssl enc -P 实测基准一致', () => {
  it('AES-256：key 32B + iv 16B', () => {
    const { key, iv } = evpBytesToKeyMd5(enc.encode(PASS), SALT, 32, 16)
    expect(bytesToHex(key)).toBe(EVP_MD5_KEY256)
    expect(bytesToHex(iv)).toBe(EVP_MD5_IV256)
  })

  it('AES-128：key 16B + iv 16B', () => {
    const { key, iv } = evpBytesToKeyMd5(enc.encode(PASS), SALT, 16, 16)
    expect(bytesToHex(key)).toBe(EVP_MD5_KEY128)
    expect(bytesToHex(iv)).toBe(EVP_MD5_IV128)
  })
})

describe('PBKDF2-SHA256 key/iv 派生与 openssl enc -pbkdf2 -P 基准一致', () => {
  it('AES-128：key 16B + iv 16B（10000 轮）', async () => {
    const { key, iv } = await pbkdf2KeyAndIv(PASS, SALT, 16, 16, 10000)
    expect(bytesToHex(key)).toBe(PBKDF2_KEY128)
    expect(bytesToHex(iv)).toBe(PBKDF2_IV128)
  })

  it('AES-256：key 32B + iv 16B（10000 轮）', async () => {
    const { key, iv } = await pbkdf2KeyAndIv(PASS, SALT, 32, 16, 10000)
    expect(bytesToHex(key)).toBe(PBKDF2_KEY256)
    expect(bytesToHex(iv)).toBe(PBKDF2_IV256)
  })
})

describe('openssl enc 实测向量矩阵（2 cipher × 2 KDF × base64/hex，互通验收）', () => {
  for (const cipher of ['aes-128-cbc', 'aes-256-cbc'] as const) {
    for (const kdf of ['md5', 'pbkdf2'] as const) {
      it(`${cipher} + ${kdf}：base64 输入解出明文`, async () => {
        const outcome = await decryptOpenSsl({
          input: CT_BASE64[cipher][kdf],
          passphrase: PASS,
          cipher,
          kdf,
        })
        expect(outcome).toEqual({ ok: true, plaintext: PLAINTEXT })
      })

      it(`${cipher} + ${kdf}：hex 输入自动识别并解出同一明文`, async () => {
        const outcome = await decryptOpenSsl({
          input: CT_HEX[cipher][kdf],
          passphrase: PASS,
          cipher,
          kdf,
        })
        expect(outcome).toEqual({ ok: true, plaintext: PLAINTEXT })
      })
    }
  }
})

describe('Salted__ 信封解析与输入识别', () => {
  it('拆出 8 字节 salt（= 信封第 8..15 字节）与密文段', () => {
    const parsed = parseSaltedInput(CT_BASE64['aes-256-cbc'].md5)
    expect(parsed).not.toBeNull()
    expect(parsed!.salt).toHaveLength(8)
    // hex 向量前 32 个 hex 字符 = "Salted__"(16) + salt(16)——两个独立书写形态互相印证
    expect(bytesToHex(parsed!.salt)).toBe(CT_HEX['aes-256-cbc'].md5.slice(16, 32))
    expect(parsed!.ciphertext.length).toBeGreaterThan(16)
  })

  it('非 Salted__ 开头 → not-salted（无 salt 的裸密文出界）', async () => {
    const raw = bytesToBase64(enc.encode('not an openssl envelope at all....'))
    await expect(
      decryptOpenSsl({ input: raw, passphrase: PASS, cipher: 'aes-256-cbc', kdf: 'md5' }),
    ).resolves.toEqual({ ok: false, reason: 'not-salted' })
  })

  it('坏编码 → bad-encoding', async () => {
    await expect(
      decryptOpenSsl({ input: '!!!not-base64!!!', passphrase: PASS, cipher: 'aes-256-cbc', kdf: 'md5' }),
    ).resolves.toEqual({ ok: false, reason: 'bad-encoding' })
  })
})

describe('同 magic 不可自动区分：错组合失败与篡改失败', () => {
  it('cipher 档位选错 → decrypt-failed（UI 提示换组合）', async () => {
    const outcome = await decryptOpenSsl({
      input: CT_BASE64['aes-128-cbc'].md5,
      passphrase: PASS,
      cipher: 'aes-256-cbc', // 128 密文按 256 解
      kdf: 'md5',
    })
    expect(outcome).toEqual({ ok: false, reason: 'decrypt-failed' })
  })

  it('KDF 档位选错 → decrypt-failed', async () => {
    const outcome = await decryptOpenSsl({
      input: CT_BASE64['aes-256-cbc'].md5,
      passphrase: PASS,
      cipher: 'aes-256-cbc',
      kdf: 'pbkdf2', // md5 密文按 pbkdf2 解
    })
    expect(outcome).toEqual({ ok: false, reason: 'decrypt-failed' })
  })

  it('口令错误 → decrypt-failed', async () => {
    const outcome = await decryptOpenSsl({
      input: CT_BASE64['aes-256-cbc'].md5,
      passphrase: 'wrong-passphrase',
      cipher: 'aes-256-cbc',
      kdf: 'md5',
    })
    expect(outcome).toEqual({ ok: false, reason: 'decrypt-failed' })
  })

  it('密文段篡改一比特 → decrypt-failed', async () => {
    const bytes = hexToBytes(CT_HEX['aes-256-cbc'].md5)!
    const last = bytes.length - 1
    bytes[last] = bytes[last]! ^ 0x01
    const outcome = await decryptOpenSsl({
      input: bytesToHex(bytes),
      passphrase: PASS,
      cipher: 'aes-256-cbc',
      kdf: 'md5',
    })
    expect(outcome).toEqual({ ok: false, reason: 'decrypt-failed' })
  })
})

describe('默认档位与非 ASCII 口令（辅助一致性）', () => {
  it('默认 256-CBC + legacy MD5（档位常量锚定）', () => {
    expect(DEFAULT_OPENSSL_CIPHER).toBe('aes-256-cbc')
    expect(DEFAULT_OPENSSL_KDF).toBe('md5')
    expect(DEFAULT_PBKDF2_ITERATIONS).toBe(10000)
  })

  it('中文口令往返：Salted__ 信封组装 → 解密（UTF-8 口令路径）', async () => {
    // 用与 openssl 相同的构造规则组装：EVP_BytesToKey(MD5) + AES-CBC + PKCS#7
    const passphrase = '口令-测试-🔐'
    const salt = enc.encode('SALT-09!') // 任意 8 字节
    const { key, iv } = evpBytesToKeyMd5(enc.encode(passphrase), salt, 32, 16)
    const keyObj = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-CBC', false, ['encrypt'])
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv as BufferSource }, keyObj, enc.encode(PLAINTEXT) as BufferSource),
    )
    const envelope = new Uint8Array(8 + 8 + ct.length)
    envelope.set(enc.encode('Salted__'), 0)
    envelope.set(salt, 8)
    envelope.set(ct, 16)
    await expect(
      decryptOpenSsl({ input: bytesToBase64(envelope), passphrase, cipher: 'aes-256-cbc', kdf: 'md5' }),
    ).resolves.toEqual({ ok: true, plaintext: PLAINTEXT })
  })
})

describe('PBKDF2 迭代数钳制（P2 修复：防巨值挂死 deriveBits / 负数小数误报）', () => {
  it('钳制常量锚定：上限 10,000,000', () => {
    expect(MAX_PBKDF2_ITERATIONS).toBe(10_000_000)
  })

  it('normalizeOpenSslIterations：非有限值回默认；截断取整；钳到 [1, MAX]', () => {
    // 非有限（NaN/±∞，v-model.number 空串/越界输入的自然产物）→ 默认 10000
    expect(normalizeOpenSslIterations(Number.NaN)).toBe(DEFAULT_PBKDF2_ITERATIONS)
    expect(normalizeOpenSslIterations(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PBKDF2_ITERATIONS)
    expect(normalizeOpenSslIterations(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_PBKDF2_ITERATIONS)
    // 正常值原样
    expect(normalizeOpenSslIterations(10000)).toBe(10000)
    expect(normalizeOpenSslIterations(600000)).toBe(600000)
    // 负数/零 → 下界 1；小数截断
    expect(normalizeOpenSslIterations(-5)).toBe(1)
    expect(normalizeOpenSslIterations(0)).toBe(1)
    expect(normalizeOpenSslIterations(1.9)).toBe(1)
    expect(normalizeOpenSslIterations(12345.7)).toBe(12345)
    // 巨值 → 上界（手输 1e12 不再长占挂死）
    expect(normalizeOpenSslIterations(1e12)).toBe(MAX_PBKDF2_ITERATIONS)
  })

  it('钳制经解密入口生效：iterations 传 -5 与 10000 结果一致（同一密文）', async () => {
    const vector = CT_BASE64['aes-128-cbc']!.pbkdf2
    const normal = await decryptOpenSsl({
      input: vector,
      passphrase: PASS,
      cipher: 'aes-128-cbc',
      kdf: 'pbkdf2',
      iterations: DEFAULT_PBKDF2_ITERATIONS,
    })
    const clamped = await decryptOpenSsl({
      input: vector,
      passphrase: PASS,
      cipher: 'aes-128-cbc',
      kdf: 'pbkdf2',
      iterations: -5, // 钳到 1 ≠ 10000，解密失败而非挂死/误报——证明钳制改写了入参
    })
    expect(normal.ok).toBe(true)
    expect(clamped).toEqual({ ok: false, reason: 'decrypt-failed' })
  })
})
