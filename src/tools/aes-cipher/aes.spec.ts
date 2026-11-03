import { describe, expect, it } from 'vitest'
import {
  GCM_IV_BYTES,
  MAX_INPUT_BYTES,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decryptWithKeyBytes,
  deriveAesKeyBytes,
  encryptEnvelopeBytes,
  encryptWithPassphrase,
  encryptWithRawKey,
  exceedsInputLimit,
  parseEnvelope,
  parseRawKey,
} from './aes'
import type { AesMode, KeyBits } from './aes'

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)))

/**
 * NIST SP 800-38D GCM 测试用例（AES-128、12 字节 IV、无 AAD）。
 * 密文与 tag 为官方发布值；验证方式：WebCrypto 对官方 C||T 认证解密成功
 * （tag 校验通过），并以明文逐字节反验加密方向（2026-11-03，node 22 WebCrypto）。
 */
const NIST_KEY_128 = 'feffe9928665731c6d6a8f9467308308'
const NIST_IV = 'cafebabefacedbaddecaf888'
const NIST_PT = 'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255'
const NIST_CT = '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091473f5985'
const NIST_TAG = '4d5c2af327cd64a62cf35abd2ba6fab4'

const KEY_BY_BITS = {
  128: hex('000102030405060708090a0b0c0d0e0f'),
  192: hex('000102030405060708090a0b0c0d0e0f1011121314151617'),
  256: hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
} satisfies Record<KeyBits, Uint8Array>

const SALT = hex('00112233445566778899aabbccddeeff')

describe('NIST GCM 标准测试向量（验收 1）', () => {
  it('crypto 层注入固定 key/IV：信封密文段与官方密文+tag 逐字节一致', async () => {
    const envelope = await encryptEnvelopeBytes({
      mode: 'GCM',
      keyBytes: hex(NIST_KEY_128),
      salt: SALT,
      iv: hex(NIST_IV),
      plaintextBytes: hex(NIST_PT),
    })
    const parsed = parseEnvelope(bytesToBase64(envelope))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.view.magicHex).toBe('46 47 58 31') // "FGX1"
    expect(parsed.view.versionHex).toBe('01')
    expect(parsed.view.mode).toBe('GCM')
    expect(parsed.view.ivHex.replace(/ /g, '')).toBe(NIST_IV)
    expect(parsed.view.ciphertextHex.replace(/ /g, '')).toBe(NIST_CT + NIST_TAG) // GCM 密文含 16B 认证 tag
    expect(parsed.view.ciphertextBytes).toBe(NIST_CT.length / 2 + 16)
  })

  it('同信封以 raw key 解密成功（认证通过）', async () => {
    const envelope = bytesToBase64(
      await encryptEnvelopeBytes({
        mode: 'GCM',
        keyBytes: hex(NIST_KEY_128),
        salt: SALT,
        iv: hex(NIST_IV),
        plaintextBytes: hex(NIST_PT),
      }),
    )
    const outcome = await decryptWithKeyBytes(envelope, hex(NIST_KEY_128))
    expect(outcome.ok).toBe(true)
  })
})

describe('往返字节级一致：GCM/CBC × 128/192/256 六组合（验收 2）', () => {
  const plaintext = '往返测试 plaintext — 中文与 emoji 🔐 一致性'
  const modes: AesMode[] = ['GCM', 'CBC']
  const bitsList: KeyBits[] = [128, 192, 256]

  for (const mode of modes) {
    for (const bits of bitsList) {
      it(`${mode}-AES-${bits} 往返一致`, async () => {
        const iv = crypto.getRandomValues(new Uint8Array(mode === 'GCM' ? GCM_IV_BYTES : 16))
        const encrypted = await encryptWithRawKey({
          mode,
          keyText: bytesToBase64(KEY_BY_BITS[bits]),
          plaintext,
          iv,
        })
        expect(encrypted.ok).toBe(true)
        if (!encrypted.ok) return
        expect(encrypted.bits).toBe(bits)
        const outcome = await decryptWithKeyBytes(encrypted.envelope, KEY_BY_BITS[bits])
        expect(outcome).toEqual({ ok: true, plaintext })
      })
    }
  }
})

describe('信封解析面板各段拆解（验收 3）', () => {
  it('GCM 信封：magic/版本/模式/salt(16B)/IV(12B)/密文长度各段正确', async () => {
    const encrypted = await encryptWithRawKey({
      mode: 'GCM',
      keyText: bytesToBase64(KEY_BY_BITS[256]),
      plaintext: 'segments',
    })
    if (!encrypted.ok) throw new Error('encrypt failed')
    const parsed = parseEnvelope(encrypted.envelope)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.view.saltHex.replace(/ /g, '')).toHaveLength(SALT_BYTES * 2)
    expect(parsed.view.ivHex.replace(/ /g, '')).toHaveLength(GCM_IV_BYTES * 2)
    expect(parsed.view.totalBytes).toBe(base64ToBytes(encrypted.envelope)!.length)
  })

  it('CBC 信封 IV 段为 16 字节', async () => {
    const encrypted = await encryptWithRawKey({
      mode: 'CBC',
      keyText: bytesToBase64(KEY_BY_BITS[128]),
      plaintext: 'segments',
    })
    if (!encrypted.ok) throw new Error('encrypt failed')
    const parsed = parseEnvelope(encrypted.envelope)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.view.mode).toBe('CBC')
    expect(parsed.view.ivHex.replace(/ /g, '')).toHaveLength(32)
  })

  it('非 FGX1 开头 → 明确「非本工具密文格式」', () => {
    const notOurs = bytesToBase64(new TextEncoder().encode('Salted__AAAAAAAAAAAAAAAA'))
    expect(parseEnvelope(notOurs)).toEqual({ ok: false, reason: 'non-fgx1' })
  })

  it('坏 base64 与过短输入分别报错', () => {
    expect(parseEnvelope('!!!not-base64!!!').ok).toBe(false)
    const short = bytesToBase64(new Uint8Array([0x46, 0x47, 0x58, 0x31, 0x01]))
    expect(parseEnvelope(short)).toEqual({ ok: false, reason: 'too-short' })
  })
})

describe('失败呈现：GCM 单态与 CBC 分层（验收 4）', () => {
  const plaintext = 'attack at dawn'
  const key = KEY_BY_BITS[256]

  async function encryptedGcm(): Promise<string> {
    const encrypted = await encryptWithRawKey({ mode: 'GCM', keyText: bytesToBase64(key), plaintext })
    if (!encrypted.ok) throw new Error('encrypt failed')
    return encrypted.envelope
  }

  async function encryptedCbc(): Promise<string> {
    const encrypted = await encryptWithRawKey({ mode: 'CBC', keyText: bytesToBase64(key), plaintext })
    if (!encrypted.ok) throw new Error('encrypt failed')
    return encrypted.envelope
  }

  it('GCM 错误密钥 → 认证失败单态 gcm-auth', async () => {
    const envelope = await encryptedGcm()
    const wrongKey = KEY_BY_BITS[128]
    await expect(decryptWithKeyBytes(envelope, wrongKey)).resolves.toEqual({ ok: false, reason: 'gcm-auth' })
  })

  it('GCM 篡改密文 → 同一失败单态（错钥与篡改不可区分）', async () => {
    const envelope = await encryptedGcm()
    const bytes = base64ToBytes(envelope)!
    const last = bytes.length - 1
    bytes[last] = bytes[last]! ^ 0x01 // 翻转密文末位一比特
    const tampered = bytesToBase64(bytes)
    const outcome = await decryptWithKeyBytes(tampered, key)
    // 与错误密钥同一 reason：认证加密在密码学上不可区分二者
    expect(outcome).toEqual({ ok: false, reason: 'gcm-auth' })
  })

  it('CBC 错误密钥 → 填充错误提示（如实分层）', async () => {
    const envelope = await encryptedCbc()
    const wrongKey = KEY_BY_BITS[128]
    // 固定输入下 WebCrypto CBC 错钥解密确定性抛 OperationError（本会话已验证）
    await expect(decryptWithKeyBytes(envelope, wrongKey)).resolves.toEqual({ ok: false, reason: 'cbc-padding' })
  })
})

describe('raw key 16/24/32 字节自动识别（验收 5）', () => {
  it('hex 64/48/32 字符识别为 256/192/128', () => {
    expect(parseRawKey('00'.repeat(32))).toMatchObject({ ok: true, bits: 256 })
    expect(parseRawKey('00'.repeat(24))).toMatchObject({ ok: true, bits: 192 })
    expect(parseRawKey('00'.repeat(16))).toMatchObject({ ok: true, bits: 128 })
  })

  it('base64 粘贴自动识别（大小写与空白容错）', () => {
    const key24 = KEY_BY_BITS[192]
    const text = bytesToBase64(key24)
    expect(parseRawKey(`  ${text}  `)).toMatchObject({ ok: true, bits: 192, bytes: key24 })
  })

  it('错长度只错该框：15 字节报 invalid-length 并带实际长度', () => {
    const result = parseRawKey('00'.repeat(15))
    expect(result).toEqual({ ok: false, reason: 'invalid-length', byteLength: 15 })
    const b64 = bytesToBase64(new Uint8Array(20))
    expect(parseRawKey(b64)).toEqual({ ok: false, reason: 'invalid-length', byteLength: 20 })
  })

  it('错编码只错该框：非 hex/base64 报 invalid-encoding', () => {
    expect(parseRawKey('xyz!').ok).toBe(false)
    expect(parseRawKey('z9z9z9z9z9z9z9z9z9z9z9z9z9z9z9z9z').ok).toBe(false) // 含非法 base64 字符
    expect(parseRawKey('').ok).toBe(false)
  })
})

describe('IV/salt 每次加密重新生成（验收 6）', () => {
  it('连续两次同明文加密，信封不同（IV 重用从交互上杜绝）', async () => {
    const args = { mode: 'GCM' as AesMode, keyText: bytesToBase64(KEY_BY_BITS[256]), plaintext: 'same' }
    const first = await encryptWithRawKey(args)
    const second = await encryptWithRawKey(args)
    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(first.envelope).not.toBe(second.envelope)
      // salt 与 IV 段均不同
      const a = parseEnvelope(first.envelope)
      const b = parseEnvelope(second.envelope)
      expect(a.ok && b.ok).toBe(true)
      if (a.ok && b.ok) {
        expect(a.view.saltHex).not.toBe(b.view.saltHex)
        expect(a.view.ivHex).not.toBe(b.view.ivHex)
      }
    }
  })

  it('passphrase 路径同样每次新生成 salt 与 IV', async () => {
    const args = { mode: 'CBC' as AesMode, passphrase: '口令-FFX', plaintext: 'same' }
    const first = await encryptWithPassphrase(args)
    const second = await encryptWithPassphrase(args)
    expect(first.envelope).not.toBe(second.envelope)
  })
})

describe('passphrase KDF（验收 7 的不可调口径）', () => {
  it('PBKDF2-SHA256 600,000 次迭代固定（导出常量，UI 无该入口）', () => {
    expect(PBKDF2_ITERATIONS).toBe(600000)
  })

  it('派生确定性：同口令同 salt 得同 256 位密钥，不同 salt 得不同密钥', async () => {
    const a1 = await deriveAesKeyBytes('passphrase', SALT)
    const a2 = await deriveAesKeyBytes('passphrase', SALT)
    const b = await deriveAesKeyBytes('passphrase', crypto.getRandomValues(new Uint8Array(16)))
    expect(a1).toEqual(a2)
    expect(a1).not.toEqual(b)
    expect(a1).toHaveLength(32) // passphrase 路径固定派生 256 位
  })

  it('passphrase 加解密往返（信封内嵌 salt 重新派生）', async () => {
    const plaintext = '口令派生往返'
    for (const mode of ['GCM', 'CBC'] as AesMode[]) {
      const { envelope } = await encryptWithPassphrase({ mode, passphrase: 'p@ss 测试', plaintext })
      const bytes = base64ToBytes(envelope)!
      const keyBytes = await deriveAesKeyBytes('p@ss 测试', bytes.slice(6, 6 + SALT_BYTES))
      await expect(decryptWithKeyBytes(envelope, keyBytes)).resolves.toEqual({ ok: true, plaintext })
    }
  })
})

describe('1 MiB 输入边界（验收 7）', () => {
  it('恰好 1 MiB 不超限，超一字节触发明确报错口径', () => {
    expect(MAX_INPUT_BYTES).toBe(1024 * 1024)
    expect(exceedsInputLimit('a'.repeat(MAX_INPUT_BYTES))).toBe(false)
    expect(exceedsInputLimit(`${'a'.repeat(MAX_INPUT_BYTES)}!`)).toBe(true)
    // 多字节字符按 UTF-8 字节计：每汉字 3 字节
    expect(exceedsInputLimit('汉'.repeat(Math.floor(MAX_INPUT_BYTES / 3)))).toBe(false) // 1048575 字节
    expect(exceedsInputLimit('汉'.repeat(Math.ceil(MAX_INPUT_BYTES / 3)))).toBe(true) // 1048578 字节
  })
})

describe('hex/base64 编码助手', () => {
  it('hex 分组视图与还原', () => {
    const bytes = new Uint8Array([0x46, 0x47, 0x58, 0x31])
    expect(bytesToHex(bytes)).toBe('46475831')
    expect(bytesToHex(bytes, 1)).toBe('46 47 58 31')
  })
})
