/**
 * 共享 MD5 增量摘要（自实现，0 第三方依赖）。
 *
 * 提取自 hash-checksum（v0.5.0 附录 §6「共享密码代码：不复制加密代码」）：
 * hash-checksum 的 MD5 哈希与 aes-cipher 的 OpenSSL legacy EVP_BytesToKey（MD5 KDF）
 * 复用同一实现。MD5 不具备抗碰撞性——此处仅服务于两处既定用途
 * （校验和兼容口径 / 解密第三方历史密文），不用于任何新造安全用途。
 */

export const MD5_DIGEST_BYTES = 16

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

/**
 * MD5 增量摘要：update 任意次后 digest 终结。
 * digest()/digestHex()/digestBytes() 共享同一终结语义（padding + 位长），只能终结一次。
 */
export class Md5Digest {
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

  /** 终结并返回 16 字节原始摘要。 */
  digestBytes(): Uint8Array {
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

    const out = new Uint8Array(MD5_DIGEST_BYTES)
    let offset = 0
    for (const word of this.state) {
      for (let index = 0; index < 4; index += 1) {
        out[offset++] = (word >>> (index * 8)) & 0xff
      }
    }
    return out
  }

  /** 终结并返回小写 hex 摘要。 */
  digestHex(): string {
    let result = ''
    for (const byte of this.digestBytes()) {
      result += byte.toString(16).padStart(2, '0')
    }
    return result
  }

  /** Promise hex 形态（hash-checksum IncrementalDigest 接口兼容）。 */
  digest(): Promise<string> {
    return Promise.resolve(this.digestHex())
  }
}
