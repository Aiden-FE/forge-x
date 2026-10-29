import { describe, expect, it } from 'vitest'
import {
  computeBytesHashes,
  computeFileHashes,
  computeTextHashes,
  HMAC_ALGORITHM_IDS,
  HmacUnsupportedAlgorithmError,
  readBlobChunks,
  type HashAlgorithmId,
} from './hashing'

const ALL_ALGORITHMS: HashAlgorithmId[] = [
  'sha1',
  'sha256',
  'sha384',
  'sha512',
  'md5',
  'crc32',
]

const EMPTY_VECTORS = {
  sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
  sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  sha384: '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
  sha512: 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
  md5: 'd41d8cd98f00b204e9800998ecf8427e',
  crc32: '00000000',
} satisfies Record<HashAlgorithmId, string>

const ABC_VECTORS = {
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  sha384: 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
  sha512: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  md5: '900150983cd24fb0d6963f7d28e17f72',
  crc32: '352441c2',
} satisfies Record<HashAlgorithmId, string>

const CHECK_VECTORS = {
  sha256: '15e2b0d3c33891ebb0f1ef609ec419420c20e320ce94c65fbc8c3312448eb225',
  md5: '25f9e794323b453885f5181f1b624d0b',
  crc32: 'cbf43926',
} as const

const QUICK_BROWN_FOX_MD5 = '9e107d9d372bb6826bd81d3542a419d6'

describe('computeTextHashes 标准测试向量', () => {
  it('计算空字符串的六种算法', async () => {
    await expect(computeTextHashes('', ALL_ALGORITHMS)).resolves.toEqual(EMPTY_VECTORS)
  })

  it('计算 "abc" 的六种算法', async () => {
    await expect(computeTextHashes('abc', ALL_ALGORITHMS)).resolves.toEqual(ABC_VECTORS)
  })

  it('按 UTF-8 字节处理多字节文本', async () => {
    const text = 'The quick brown fox jumps over the lazy dog'
    const result = await computeTextHashes(text, ['md5', 'crc32'])
    expect(result.md5).toBe(QUICK_BROWN_FOX_MD5)
    expect(result.crc32).toBe('414fa339')
  })

  it('拒绝空算法列表和未知算法', async () => {
    await expect(computeTextHashes('abc', [])).rejects.toThrow(RangeError)
    await expect(computeTextHashes('abc', ['sha999' as HashAlgorithmId])).rejects.toThrow(RangeError)
  })
})

describe('computeBytesHashes 二进制输入', () => {
  it('对同一字节序列得到与文本向量一致的哈希', async () => {
    const bytes = new TextEncoder().encode('123456789')
    await expect(computeBytesHashes(bytes, ['sha256', 'md5', 'crc32']))
      .resolves.toEqual(CHECK_VECTORS)
  })
})

describe('readBlobChunks 分块读取', () => {
  async function collectChunks(source: Blob, chunkSize: number) {
    const chunks: Uint8Array[] = []
    for await (const chunk of readBlobChunks(source, chunkSize)) {
      chunks.push(chunk)
    }
    return chunks
  }

  it('按边界切分 Blob，并在最后一次保留剩余字节', async () => {
    const data = new Uint8Array(1500)
      .map((_, index) => index % 251)
    const chunks = await collectChunks(new Blob([data]), 512)

    expect(chunks.map(chunk => chunk.length)).toEqual([512, 512, 476])
    expect(chunks[0][0]).toBe(0)
    expect(chunks[1][0]).toBe(data[512])
    expect(chunks[2][0]).toBe(data[1024])

    const reconstructed = new Uint8Array(1500)
    let offset = 0
    for (const chunk of chunks) {
      reconstructed.set(chunk, offset)
      offset += chunk.length
    }
    expect([...reconstructed]).toEqual([...data])
  })

  it('每个分块只读取所属区间', async () => {
    const data = Uint8Array.from({ length: 1025 }, (_, index) => index % 17)
    const chunks = await collectChunks(new Blob([data]), 256)

    expect(chunks).toHaveLength(5)
    expect(chunks.at(-1)).toHaveLength(1)
    expect(chunks[4][0]).toBe(data[1024])
  })

  it('空 Blob 发出一次零进度并返回零个分块', async () => {
    const progress: Array<[number, number]> = []
    const chunks: Uint8Array[] = []
    for await (const chunk of readBlobChunks(new Blob([]), 1024, (loaded, total) => {
      progress.push([loaded, total])
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(0)
    expect(progress).toEqual([[0, 0]])
  })

  it('拒绝非正数分块大小', async () => {
    await expect(collectChunks(new Blob(['abc']), 0)).rejects.toThrow(RangeError)
  })
})

describe('computeFileHashes 分块流式计算', () => {
  it('跨多个分块得到与一次性计算相同的结果', async () => {
    const bytes = new Uint8Array(4096)
      .map((_, index) => (index * 37 + 11) % 256)
    const expected = await computeBytesHashes(bytes, ALL_ALGORITHMS)
    const progress: Array<[number, number]> = []

    const result = await computeFileHashes(
      new Blob([bytes]),
      ALL_ALGORITHMS,
      {
        chunkSize: 1023,
        onProgress(value) {
          progress.push([value.loaded, value.total])
        },
      },
    )

    expect(result).toEqual(expected)
    expect(progress.at(-1)).toEqual([4096, 4096])
    expect(progress.length).toBe(5)
  })

  it('跨块 MD5 与 CRC32 匹配标准校验值', async () => {
    const first = new TextEncoder().encode('12345678')
    const second = new TextEncoder().encode('9')
    const result = await computeFileHashes(
      new Blob([first, second]),
      ['sha256', 'md5', 'crc32'],
      { chunkSize: 3 },
    )

    expect(result).toEqual(CHECK_VECTORS)
  })
})

// RFC 4231 向量真值经 OpenSSL（node:crypto createHmac）独立交叉验证。
const RFC4231_TC1_KEY = '\u000b'.repeat(20) // U+000B 在 UTF-8 中编码为单字节 0x0b，等价于 0x0b × 20 的二进制密钥
const RFC4231_TC1_VECTORS = {
  sha1: 'b617318655057264e28bc0b6fb378c8ef146be00',
  sha256: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
  sha384: 'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6',
  sha512: '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
} satisfies Partial<Record<HashAlgorithmId, string>>

const RFC4231_TC2_KEY = 'Jefe'
const RFC4231_TC2_VECTORS = {
  sha1: 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79',
  sha256: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  sha384: 'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649',
  sha512: '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
} satisfies Partial<Record<HashAlgorithmId, string>>

describe('computeTextHashes HMAC（RFC 4231 测试向量）', () => {
  it('RFC 4231 Test Case 1（key = 0x0b×20）四算法向量', async () => {
    await expect(computeTextHashes('Hi There', HMAC_ALGORITHM_IDS, { hmacKey: RFC4231_TC1_KEY }))
      .resolves.toEqual(RFC4231_TC1_VECTORS)
  })

  it('RFC 4231 Test Case 2（key = Jefe）四算法向量', async () => {
    await expect(
      computeTextHashes('what do ya want for nothing?', HMAC_ALGORITHM_IDS, { hmacKey: RFC4231_TC2_KEY }),
    ).resolves.toEqual(RFC4231_TC2_VECTORS)
  })

  it('已知值：HMAC-SHA256(key, "The quick brown fox…")', async () => {
    const result = await computeTextHashes('The quick brown fox jumps over the lazy dog', ['sha256'], {
      hmacKey: 'key',
    })
    expect(result.sha256).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
  })

  it('多字节 UTF-8 密钥按 UTF-8 字节参与计算', async () => {
    const result = await computeTextHashes('abc', ['sha256'], { hmacKey: '密钥' })
    expect(result.sha256).toBe('03064ffd2da3671dc0e9d491a88fe31ab52ae0905e789b9b46475fce3e1011c6')
  })

  it('空密钥回落为普通哈希（回归锚）', async () => {
    await expect(computeTextHashes('abc', ALL_ALGORITHMS, { hmacKey: '' })).resolves.toEqual(ABC_VECTORS)
    await expect(computeTextHashes('abc', ALL_ALGORITHMS, { hmacKey: '' }))
      .resolves.toEqual(await computeTextHashes('abc', ALL_ALGORITHMS))
  })

  it('MD5 / CRC32 与密钥组合返回结构化不支持错误', async () => {
    const error: unknown = await computeTextHashes('abc', ['md5', 'crc32'], { hmacKey: 'k' }).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(HmacUnsupportedAlgorithmError)
    expect((error as HmacUnsupportedAlgorithmError).code).toBe('hmac-unsupported-algorithm')
    expect((error as HmacUnsupportedAlgorithmError).unsupported).toEqual(['md5', 'crc32'])
    await expect(computeTextHashes('abc', ['sha256', 'md5'], { hmacKey: 'k' }))
      .rejects.toThrow(HmacUnsupportedAlgorithmError)
  })

  it('computeBytesHashes 共享同一密钥语义', async () => {
    const bytes = new TextEncoder().encode('what do ya want for nothing?')
    await expect(computeBytesHashes(bytes, ['sha256'], { hmacKey: RFC4231_TC2_KEY }))
      .resolves.toEqual({ sha256: RFC4231_TC2_VECTORS.sha256 })
  })
})
