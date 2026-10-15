import { describe, expect, it } from 'vitest'
import {
  computeBytesHashes,
  computeFileHashes,
  computeTextHashes,
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
