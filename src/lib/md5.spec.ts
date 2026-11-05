import { describe, expect, it } from 'vitest'
import { Md5Digest } from './md5'

const enc = new TextEncoder()

/**
 * 独立事实来源：RFC 1321 §A.5 官方测试向量 + 通行标准向量。
 * （提取自 hash-checksum 的既有口径——共享化后此处即为共享模块的护栏。）
 */
const RFC1321_VECTORS: Array<{ input: string; hex: string }> = [
  { input: '', hex: 'd41d8cd98f00b204e9800998ecf8427e' },
  { input: 'a', hex: '0cc175b9c0f1b6a831c399e269772661' },
  { input: 'abc', hex: '900150983cd24fb0d6963f7d28e17f72' },
  { input: 'message digest', hex: 'f96b697d7cb7938d525a2f31aaf161d0' },
  { input: 'abcdefghijklmnopqrstuvwxyz', hex: 'c3fcd3d76192e4007dfb496cca67e13b' },
  { input: '123456789', hex: '25f9e794323b453885f5181f1b624d0b' },
]

const QUICK_FOX_MD5 = '9e107d9d372bb6826bd81d3542a419d6'
const MILLION_A_MD5 = '7707d6ae4e027c70eea2a935c2296f21' // RFC 1321 A.5

describe('Md5Digest 标准向量', () => {
  for (const v of RFC1321_VECTORS) {
    it(`"${v.input || '空串'}" → ${v.hex}`, () => {
      const d = new Md5Digest()
      d.update(enc.encode(v.input))
      expect(d.digestHex()).toBe(v.hex)
    })
  }

  it('一百万个 "a"（多块跨界，RFC 1321 A.5）', () => {
    const d = new Md5Digest()
    const chunk = enc.encode('a'.repeat(1000))
    for (let i = 0; i < 1000; i++) d.update(chunk)
    expect(d.digestHex()).toBe(MILLION_A_MD5)
  })
})

describe('增量摘要语义（EVP_BytesToKey 依赖的拼接等价）', () => {
  it('update(secret) 后 update(salt) ≡ update(secret‖salt)', () => {
    const secret = enc.encode('ForgeX-Vector-Pass')
    const salt = Uint8Array.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77])
    const split = new Md5Digest()
    split.update(secret)
    split.update(salt)
    const joined = new Md5Digest()
    joined.update(enc.encode('ForgeX-Vector-Pass'))
    joined.update(salt)
    expect(split.digestHex()).toBe(joined.digestHex())
  })

  it('任意切分点（含 55/56/63/64 字节块边界）与整段一致', () => {
    const data = enc.encode('x'.repeat(200) + '边界测试')
    const whole = new Md5Digest()
    whole.update(data)
    const expected = whole.digestHex()
    for (const cut of [1, 55, 56, 63, 64, 65, 128, 199, data.length - 1]) {
      const d = new Md5Digest()
      d.update(data.subarray(0, cut))
      d.update(data.subarray(cut))
      expect(d.digestHex()).toBe(expected)
    }
  })

  it('digestBytes 返回 16 字节原始摘要，与 hex 形态一致', () => {
    const d = new Md5Digest()
    d.update(enc.encode('abc'))
    const bytes = d.digestBytes()
    expect(bytes).toHaveLength(16)
    expect(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')).toBe(
      '900150983cd24fb0d6963f7d28e17f72',
    )
  })

  it('digest() Promise 形态返回同值（hash-checksum IncrementalDigest 接口兼容）', async () => {
    const d = new Md5Digest()
    d.update(enc.encode('The quick brown fox jumps over the lazy dog'))
    await expect(d.digest()).resolves.toBe(QUICK_FOX_MD5)
  })
})
