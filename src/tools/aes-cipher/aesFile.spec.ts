import { describe, expect, it } from 'vitest'
import {
  FILE_CHUNK_BYTES,
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  chunkCountFor,
  decryptFileEnvelope,
  encryptFileEnvelope,
  isFileTooLarge,
  parseFileEnvelopeHeader,
  sanitizeFileName,
} from './aesFile'
import type { BlobSource } from './aesFile'

/** 确定性伪随机字节（LCG）——大文件测试不需真随机，需可复现。 */
function pseudoRandomBytes(length: number, seed = 0x2a): Uint8Array {
  const out = new Uint8Array(length)
  let state = seed >>> 0
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    out[i] = (state >>> 24) & 0xff
  }
  return out
}

/** 真实 Blob 的最小源（内存数据小文件用）。 */
function fakeSource(data: Uint8Array): BlobSource {
  // 复制进全新 ArrayBuffer 视图，满足 TS 的 BlobPart（ArrayBufferView<ArrayBuffer>）。
  const backing = new Blob([new Uint8Array(data)])
  return { size: data.length, slice: (start: number, end: number) => backing.slice(start, end) }
}

/** 惰性陷阱源：slice 被调用即抛错（上限拒绝测试借此证明「未读一字节」）。 */
function sliceBomb(size: number): { source: BlobSource; sliced: () => boolean } {
  let sliced = false
  return {
    source: {
      size,
      slice: () => {
        sliced = true
        throw new Error('slice() must not be called on rejected input')
      },
    },
    sliced: () => sliced,
  }
}

const PASS = '文件加密口令-09'

describe('FGX1 v2 文件信封 round-trip（>1 MiB 跨块）', () => {
  it('2.5 MiB 文件（3 块）加密 → 解密逐字节一致且文件名还原', async () => {
    const data = pseudoRandomBytes(FILE_CHUNK_BYTES * 2 + 128 * 1024)
    const source = fakeSource(data)
    const encrypted = await encryptFileEnvelope({ source, fileName: '投影-资料.bin', passphrase: PASS })
    expect(encrypted.ok).toBe(true)
    if (!encrypted.ok) return

    const decrypted = await decryptFileEnvelope({ source: encrypted.blob, passphrase: PASS })
    expect(decrypted.ok).toBe(true)
    if (!decrypted.ok) return
    expect(decrypted.fileName).toBe('投影-资料.bin')
    const bytes = new Uint8Array(await decrypted.blob.arrayBuffer())
    expect(bytes.length).toBe(data.length)
    expect(bytes).toEqual(data)
  })

  it('空文件（0 块）round-trip', async () => {
    const encrypted = await encryptFileEnvelope({
      source: fakeSource(new Uint8Array(0)),
      fileName: 'empty.txt',
      passphrase: PASS,
    })
    expect(encrypted.ok).toBe(true)
    if (!encrypted.ok) return
    const decrypted = await decryptFileEnvelope({ source: encrypted.blob, passphrase: PASS })
    expect(decrypted.ok).toBe(true)
    if (!decrypted.ok) return
    expect(decrypted.fileName).toBe('empty.txt')
    expect(decrypted.blob.size).toBe(0)
  })

  it('恰 1 MiB（1 块）与 1 MiB+1（2 块）边界', async () => {
    for (const [size, chunks] of [
      [FILE_CHUNK_BYTES, 1],
      [FILE_CHUNK_BYTES + 1, 2],
    ] as const) {
      const data = pseudoRandomBytes(size, 7)
      const encrypted = await encryptFileEnvelope({ source: fakeSource(data), fileName: 'b.bin', passphrase: PASS })
      expect(encrypted.ok).toBe(true)
      if (!encrypted.ok) continue
      const header = parseFileEnvelopeHeader(new Uint8Array(await encrypted.blob.arrayBuffer()))
      expect(header.ok).toBe(true)
      if (header.ok) expect(header.view.chunkCount).toBe(chunks)
      const decrypted = await decryptFileEnvelope({ source: encrypted.blob, passphrase: PASS })
      expect(decrypted.ok).toBe(true)
    }
  })
})

describe('信封头结构与防重用', () => {
  it('头字段拆解：magic/版本 0x02/模式 0x03/salt/prefix/文件名/尺寸/块数', async () => {
    const encrypted = await encryptFileEnvelope({
      source: fakeSource(pseudoRandomBytes(10)),
      fileName: 'spec.doc',
      passphrase: PASS,
    })
    if (!encrypted.ok) throw new Error('encrypt failed')
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer())
    const header = parseFileEnvelopeHeader(bytes)
    expect(header.ok).toBe(true)
    if (!header.ok) return
    const v = header.view
    expect(v.magicHex).toBe('46 47 58 31')
    expect(v.version).toBe(0x02)
    expect(v.mode).toBe(0x03)
    expect(v.salt).toHaveLength(16)
    expect(v.noncePrefix).toHaveLength(4)
    expect(v.fileName).toBe('spec.doc')
    expect(v.fileSize).toBe(10)
    expect(v.chunkSize).toBe(FILE_CHUNK_BYTES)
    expect(v.chunkCount).toBe(1)
    expect(v.expectedTotal).toBe(bytes.length)
  })

  it('同文件同口令两次加密：salt 与 nonce 前缀均不同（防重用）', async () => {
    const data = pseudoRandomBytes(1000)
    const a = await encryptFileEnvelope({ source: fakeSource(data), fileName: 'x', passphrase: PASS })
    const b = await encryptFileEnvelope({ source: fakeSource(data), fileName: 'x', passphrase: PASS })
    if (!a.ok || !b.ok) throw new Error('encrypt failed')
    const ha = parseFileEnvelopeHeader(new Uint8Array(await a.blob.arrayBuffer()))
    const hb = parseFileEnvelopeHeader(new Uint8Array(await b.blob.arrayBuffer()))
    if (!ha.ok || !hb.ok) throw new Error('parse failed')
    expect(ha.view.salt.join()).not.toBe(hb.view.salt.join())
    expect(ha.view.noncePrefix.join()).not.toBe(hb.view.noncePrefix.join())
  })
})

describe('上限拒绝（512 MiB / 批量 20）与分块计数', () => {
  it('超上限文件在读入前即拒绝（slice 从未被调用）', async () => {
    const bomb = sliceBomb(MAX_FILE_BYTES + 1)
    const outcome = await encryptFileEnvelope({ source: bomb.source, fileName: 'huge.bin', passphrase: PASS })
    expect(outcome).toEqual({ ok: false, reason: 'file-too-large' })
    expect(bomb.sliced()).toBe(false)
  })

  it('边界常量：恰好 512 MiB 不超限、+1 超限；批量 ≤20', () => {
    expect(isFileTooLarge(MAX_FILE_BYTES)).toBe(false)
    expect(isFileTooLarge(MAX_FILE_BYTES + 1)).toBe(true)
    expect(MAX_BATCH_FILES).toBe(20)
    expect(FILE_CHUNK_BYTES).toBe(1024 * 1024)
  })

  it('chunkCountFor：0 → 0 块、1 → 1、1 MiB → 1、1 MiB+1 → 2、512 MiB → 512', () => {
    expect(chunkCountFor(0)).toBe(0)
    expect(chunkCountFor(1)).toBe(1)
    expect(chunkCountFor(FILE_CHUNK_BYTES)).toBe(1)
    expect(chunkCountFor(FILE_CHUNK_BYTES + 1)).toBe(2)
    expect(chunkCountFor(MAX_FILE_BYTES)).toBe(512)
  })
})

describe('块级认证失败 → 整体失败单态（不输出半截文件）', () => {
  async function threeChunkEnvelope(): Promise<Blob> {
    const data = pseudoRandomBytes(FILE_CHUNK_BYTES * 2 + 999)
    const encrypted = await encryptFileEnvelope({ source: fakeSource(data), fileName: 't.bin', passphrase: PASS })
    if (!encrypted.ok) throw new Error('encrypt failed')
    return encrypted.blob
  }

  it('第 2 块密文翻转一比特 → gcm-auth 单态', async () => {
    const blob = await threeChunkEnvelope()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const header = parseFileEnvelopeHeader(bytes)
    if (!header.ok) throw new Error('parse failed')
    const secondChunkStart = header.headerBytes + (FILE_CHUNK_BYTES + 16)
    bytes[secondChunkStart + 5000] = bytes[secondChunkStart + 5000]! ^ 0x01
    const outcome = await decryptFileEnvelope({ source: new Blob([bytes]), passphrase: PASS })
    expect(outcome).toEqual({ ok: false, reason: 'gcm-auth' })
  })

  it('头部文件名被篡改 → AAD 校验失败，同 gcm-auth 单态', async () => {
    const blob = await threeChunkEnvelope()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const header = parseFileEnvelopeHeader(bytes)
    if (!header.ok) throw new Error('parse failed')
    bytes[header.nameOffset] = bytes[header.nameOffset]! ^ 0x01 // 't' → 'u'
    const outcome = await decryptFileEnvelope({ source: new Blob([bytes]), passphrase: PASS })
    expect(outcome).toEqual({ ok: false, reason: 'gcm-auth' })
  })

  it('口令错误 → 同一 gcm-auth 单态（与篡改不可区分）', async () => {
    const blob = await threeChunkEnvelope()
    const outcome = await decryptFileEnvelope({ source: blob, passphrase: '错误口令' })
    expect(outcome).toEqual({ ok: false, reason: 'gcm-auth' })
  })
})

describe('坏信封识别（版本分派，不破坏 v1 文本信封）', () => {
  it('v1 文本信封（版本 0x01）按文件路径解 → bad-envelope', async () => {
    const v1 = new Uint8Array([0x46, 0x47, 0x58, 0x31, 0x01, 0x01, ...new Uint8Array(48)])
    const outcome = await decryptFileEnvelope({ source: new Blob([v1]), passphrase: PASS })
    expect(outcome).toEqual({ ok: false, reason: 'bad-envelope' })
  })

  it('模式位非 FILE-GCM → bad-envelope', async () => {
    const bad = new Uint8Array([0x46, 0x47, 0x58, 0x31, 0x02, 0x01, ...new Uint8Array(48)])
    const outcome = await decryptFileEnvelope({ source: new Blob([bad]), passphrase: PASS })
    expect(outcome).toEqual({ ok: false, reason: 'bad-envelope' })
  })

  it('截断信封（块段不足）→ bad-envelope', async () => {
    const data = pseudoRandomBytes(FILE_CHUNK_BYTES + 5)
    const encrypted = await encryptFileEnvelope({ source: fakeSource(data), fileName: 't.bin', passphrase: PASS })
    if (!encrypted.ok) throw new Error('encrypt failed')
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer())
    const truncated = bytes.subarray(0, bytes.length - 100)
    const outcome = await decryptFileEnvelope({ source: new Blob([truncated]), passphrase: PASS })
    expect(outcome).toEqual({ ok: false, reason: 'bad-envelope' })
  })

  it('信封声明尺寸与实际长度不符 → 失败（结构校验先于认证）', async () => {
    const data = pseudoRandomBytes(5000)
    const encrypted = await encryptFileEnvelope({ source: fakeSource(data), fileName: 't.bin', passphrase: PASS })
    if (!encrypted.ok) throw new Error('encrypt failed')
    const bytes = new Uint8Array(await encrypted.blob.arrayBuffer())
    const header = parseFileEnvelopeHeader(bytes)
    if (!header.ok) throw new Error('parse failed')
    const sizeOffset = header.nameOffset + header.nameByteLength
    new DataView(bytes.buffer).setUint32(sizeOffset, 0x7fffffff) // fileSize 高 32 位 ≠ 0
    const outcome = await decryptFileEnvelope({ source: new Blob([bytes]), passphrase: PASS })
    expect(outcome.ok).toBe(false)
  })
})

describe('解密输出文件名净化', () => {
  it('路径分隔符被剥为 basename（防信封内路径穿越）', () => {
    expect(sanitizeFileName('../../../evil.txt')).toBe('evil.txt')
    expect(sanitizeFileName('a/b\\c.txt')).toBe('c.txt')
    expect(sanitizeFileName('/abs/path')).toBe('path')
    expect(sanitizeFileName('正常名.txt')).toBe('正常名.txt')
    expect(sanitizeFileName('..')).toBe('..') // 无分隔符时原样（非路径，无穿越面）
  })
})
