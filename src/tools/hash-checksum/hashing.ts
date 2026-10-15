export type HashAlgorithmId = 'sha1' | 'sha256' | 'sha384' | 'sha512' | 'md5' | 'crc32'

export const HASH_ALGORITHM_IDS = [
  'sha1',
  'sha256',
  'sha384',
  'sha512',
  'md5',
  'crc32',
] as const satisfies readonly HashAlgorithmId[]

type IncrementalDigest = {
  update(data: Uint8Array): void
  digest(): Promise<string>
}

type SubtleCryptoLike = {
  digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer>
}

function toHex(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let result = ''
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0')
  }
  return result
}

function concatBytes(chunks: readonly Uint8Array[], totalLength: number): Uint8Array {
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

class WebCryptoDigest implements IncrementalDigest {
  private readonly chunks: Uint8Array[] = []
  private byteLength = 0
  private readonly algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
  private readonly subtle: SubtleCryptoLike

  constructor(
    algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512',
    subtle: SubtleCryptoLike,
  ) {
    this.algorithm = algorithm
    this.subtle = subtle
  }

  update(data: Uint8Array): void {
    if (data.length === 0) return
    this.chunks.push(data)
    this.byteLength += data.length
  }

  async digest(): Promise<string> {
    const bytes = concatBytes(this.chunks, this.byteLength)
    return toHex(await this.subtle.digest(this.algorithm, bytes as Uint8Array<ArrayBuffer>))
  }
}

class Crc32Digest implements IncrementalDigest {
  private crc = 0xffffffff

  update(data: Uint8Array): void {
    for (const byte of data) {
      this.crc = (this.crc >>> 8) ^ CRC32_TABLE[(this.crc ^ byte) & 0xff]
    }
  }

  digest(): Promise<string> {
    const value = (this.crc ^ 0xffffffff) >>> 0
    return Promise.resolve(toHex(Uint8Array.of(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    )))
  }
}

const CRC32_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  CRC32_TABLE[index] = value >>> 0
}

const MD5_SHIFTS = [
  7, 12, 17, 22,
  5, 9, 14, 20,
  4, 11, 16, 23,
  6, 10, 15, 21,
] as const

const MD5_CONSTANTS = new Uint32Array(64)
for (let index = 0; index < 64; index += 1) {
  MD5_CONSTANTS[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0
}

function rotateLeft(value: number, count: number): number {
  return ((value << count) | (value >>> (32 - count))) >>> 0
}

class Md5Digest implements IncrementalDigest {
  private readonly buffer = new Uint8Array(64)
  private bufferLength = 0
  private byteCountLow = 0
  private byteCountHigh = 0
  private readonly state = new Uint32Array([
    0x67452301,
    0xefcdab89,
    0x98badcfe,
    0x10325476,
  ])

  update(data: Uint8Array): void {
    const previousCount = this.byteCountLow
    this.byteCountLow = (previousCount + data.length) >>> 0
    if (this.byteCountLow < previousCount) this.byteCountHigh += 1

    let offset = 0
    if (this.bufferLength > 0) {
      const needed = 64 - this.bufferLength
      const copied = Math.min(needed, data.length)
      this.buffer.set(data.subarray(0, copied), this.bufferLength)
      this.bufferLength += copied
      offset = copied
      if (this.bufferLength === 64) {
        this.processBlock(this.buffer)
        this.bufferLength = 0
      }
    }

    while (offset + 64 <= data.length) {
      this.processBlock(data.subarray(offset, offset + 64))
      offset += 64
    }

    if (offset < data.length) {
      this.buffer.set(data.subarray(offset), 0)
      this.bufferLength = data.length - offset
    }
  }

  private processBlock(block: Uint8Array): void {
    const words = new Uint32Array(16)
    for (let index = 0; index < 16; index += 1) {
      const base = index * 4
      words[index] = (
        block[base] |
        (block[base + 1] << 8) |
        (block[base + 2] << 16) |
        (block[base + 3] << 24)
      ) >>> 0
    }

    let a = this.state[0]
    let b = this.state[1]
    let c = this.state[2]
    let d = this.state[3]

    for (let index = 0; index < 64; index += 1) {
      let f: number
      let wordIndex: number
      if (index < 16) {
        f = (b & c) | (~b & d)
        wordIndex = index
      } else if (index < 32) {
        f = (d & b) | (~d & c)
        wordIndex = (5 * index + 1) % 16
      } else if (index < 48) {
        f = b ^ c ^ d
        wordIndex = (3 * index + 5) % 16
      } else {
        f = c ^ (b | ~d)
        wordIndex = (7 * index) % 16
      }

      const temporary = d
      d = c
      c = b
      const sum = (a + f + MD5_CONSTANTS[index] + words[wordIndex]) >>> 0
      b = (b + rotateLeft(sum, MD5_SHIFTS[index % 4 + Math.floor(index / 16) * 4])) >>> 0
      a = temporary
    }

    this.state[0] = (this.state[0] + a) >>> 0
    this.state[1] = (this.state[1] + b) >>> 0
    this.state[2] = (this.state[2] + c) >>> 0
    this.state[3] = (this.state[3] + d) >>> 0
  }

  digest(): Promise<string> {
    const bitCountLow = ((this.byteCountLow << 3) | (this.byteCountHigh >>> 29)) >>> 0
    const bitCountHigh = (this.byteCountHigh << 3) >>> 0
    const paddingLength = this.bufferLength < 56 ? 56 - this.bufferLength : 120 - this.bufferLength
    const padding = new Uint8Array(paddingLength)
    padding[0] = 0x80
    const encodedBitCount = new Uint8Array(8)
    for (let index = 0; index < 4; index += 1) {
      encodedBitCount[index] = (bitCountLow >>> (index * 8)) & 0xff
      encodedBitCount[index + 4] = (bitCountHigh >>> (index * 8)) & 0xff
    }

    this.update(padding)
    this.update(encodedBitCount)

    let result = ''
    for (const word of this.state) {
      for (let index = 0; index < 4; index += 1) {
        result += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, '0')
      }
    }
    return Promise.resolve(result)
  }
}

function createDigest(
  id: HashAlgorithmId,
  subtle: SubtleCryptoLike = crypto.subtle,
): IncrementalDigest {
  switch (id) {
    case 'sha1':
      return new WebCryptoDigest('SHA-1', subtle)
    case 'sha256':
      return new WebCryptoDigest('SHA-256', subtle)
    case 'sha384':
      return new WebCryptoDigest('SHA-384', subtle)
    case 'sha512':
      return new WebCryptoDigest('SHA-512', subtle)
    case 'md5':
      return new Md5Digest()
    case 'crc32':
      return new Crc32Digest()
  }
}

function assertAlgorithms(algorithms: readonly HashAlgorithmId[]): HashAlgorithmId[] {
  const unique = [...new Set(algorithms)]
  if (unique.length === 0) throw new RangeError('At least one hash algorithm is required')
  const unknown = unique.find(id => !HASH_ALGORITHM_IDS.includes(id as HashAlgorithmId))
  if (unknown) throw new RangeError(`Unknown hash algorithm: ${unknown}`)
  return unique
}

async function digestStates(
  states: Map<HashAlgorithmId, IncrementalDigest>,
): Promise<Record<HashAlgorithmId, string>> {
  const entries = await Promise.all(
    [...states.entries()].map(async ([id, state]) => [id, await state.digest()] as const),
  )
  return Object.fromEntries(entries) as Record<HashAlgorithmId, string>
}

export async function computeTextHashes(
  text: string,
  algorithms: readonly HashAlgorithmId[],
): Promise<Record<HashAlgorithmId, string>> {
  const ids = assertAlgorithms(algorithms)
  const bytes = new TextEncoder().encode(text)
  return computeBytesHashes(bytes, ids)
}

export async function computeBytesHashes(
  bytes: Uint8Array,
  algorithms: readonly HashAlgorithmId[],
): Promise<Record<HashAlgorithmId, string>> {
  const ids = assertAlgorithms(algorithms)
  const states = new Map(ids.map(id => [id, createDigest(id)]))
  for (const state of states.values()) state.update(bytes)
  return digestStates(states)
}

export type BlobChunkSource = Pick<Blob, 'size' | 'slice'>

export async function* readBlobChunks(
  source: BlobChunkSource,
  chunkSize = 1024 * 1024,
  onProgress?: (loaded: number, total: number) => void | Promise<void>,
): AsyncGenerator<Uint8Array, void, void> {
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new RangeError('chunkSize must be a positive finite number')
  }

  const total = source.size
  if (total === 0) {
    await onProgress?.(0, 0)
    return
  }

  let loaded = 0
  while (loaded < total) {
    const end = Math.min(loaded + chunkSize, total)
    const buffer = await source.slice(loaded, end).arrayBuffer()
    const chunk = new Uint8Array(buffer)
    if (chunk.length !== end - loaded) {
      throw new RangeError(`Expected ${end - loaded} bytes but received ${chunk.length}`)
    }
    yield chunk
    loaded = end
    await onProgress?.(loaded, total)
  }
}

export type FileProgress = {
  loaded: number
  total: number
}

export async function computeFileHashes(
  source: BlobChunkSource,
  algorithms: readonly HashAlgorithmId[],
  options: {
    chunkSize?: number
    onProgress?: (progress: FileProgress) => void | Promise<void>
    signal?: AbortSignal
  } = {},
): Promise<Record<HashAlgorithmId, string>> {
  const ids = assertAlgorithms(algorithms)
  const states = new Map(ids.map(id => [id, createDigest(id)]))
  const total = source.size
  let loaded = 0

  for await (const chunk of readBlobChunks(source, options.chunkSize, (read) => {
    loaded = read
    return options.onProgress?.({ loaded, total })
  })) {
    if (options.signal?.aborted) throw new DOMException('Hash operation aborted', 'AbortError')
    for (const state of states.values()) state.update(chunk)
  }

  return digestStates(states)
}
