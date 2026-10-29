/**
 * UUID/ULID generation logic (pure, dependency-free).
 *
 * - UUID v4: pure random (RFC 4122 / RFC 9562 random variant).
 * - UUID v7: 48-bit Unix millisecond timestamp prefix + random bits (RFC 9562).
 * - ULID:    10-char Crockford base32 timestamp + 16-char random (26 chars total).
 *
 * The random source and clock are injectable via GeneratorOptions so tests can
 * pin randomness and time; production defaults to the global Web Crypto API
 * and Date.now. Formatting (uppercase / braces / hyphen removal) is a pure
 * presentation transform that never changes the identifier itself.
 */

export const ID_KINDS = ['v4', 'v7', 'ulid'] as const
export type IdKind = (typeof ID_KINDS)[number]

export const DEFAULT_ID_KIND: IdKind = 'v4'

export const MIN_COUNT = 1
export const MAX_COUNT = 1000
export const DEFAULT_COUNT = 1
export const COUNT_PRESETS = [1, 10, 50, 100, 1000] as const

/** Crockford base32 alphabet (excludes I, L, O, U). Case-insensitive when decoding. */
export const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export interface GeneratorOptions {
  /** Source of cryptographically strong bytes; defaults to globalThis.crypto. */
  random?: (length: number) => Uint8Array
  /** Millisecond clock; defaults to Date.now. */
  now?: () => number
}

export interface FormatOptions {
  uppercase: boolean
  braces: boolean
  /** 去连字符：only meaningful for hyphenated forms (v4/v7), ignored for ULID. */
  hyphenless: boolean
}

export const DEFAULT_FORMAT: Readonly<FormatOptions> = Object.freeze({
  uppercase: false,
  braces: false,
  hyphenless: false,
})

export function isIdKind(value: unknown): value is IdKind {
  return ID_KINDS.includes(value as IdKind)
}

function globalCrypto(): Crypto {
  const c = globalThis.crypto
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is unavailable in this environment')
  }
  return c
}

/** Default random source backed by the global Web Crypto API. */
export function defaultRandomBytes(length: number): Uint8Array {
  return globalCrypto().getRandomValues(new Uint8Array(length))
}

function randomBytesOf(opts: GeneratorOptions, length: number): Uint8Array {
  return opts.random ? opts.random(length) : defaultRandomBytes(length)
}

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0')
}

export function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new RangeError('UUID requires exactly 16 bytes')
  let hex = ''
  for (let i = 0; i < 16; i++) hex += byteToHex(bytes[i]!)
  return (
    hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' + hex.slice(20)
  )
}

/** Build a UUID from 16 bytes, setting only the version/variant bit fields. */
export function uuidV4FromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new RangeError('UUID v4 requires exactly 16 bytes')
  const b = Uint8Array.from(bytes)
  b[6] = (b[6]! & 0x0f) | 0x40 // version 4
  b[8] = (b[8]! & 0x3f) | 0x80 // variant 10xx (RFC 4122)
  return bytesToUuid(b)
}

const MAX_TIMESTAMP_MS = 2 ** 48 // 48-bit millisecond timestamp ceiling

function assertTimestampMs(ts: number): void {
  if (!Number.isInteger(ts) || ts < 0 || ts >= MAX_TIMESTAMP_MS) {
    throw new RangeError(`timestamp must be an integer in [0, 2^48), got ${ts}`)
  }
}

/** Write a 48-bit big-endian millisecond timestamp into bytes[0..5]. */
function writeTimestamp48(bytes: Uint8Array, ts: number): void {
  let rest = ts
  // Use %/÷ instead of bitwise ops: millisecond epochs exceed the 32-bit range.
  for (let i = 5; i >= 0; i--) {
    bytes[i] = rest % 256
    rest = Math.floor(rest / 256)
  }
}

/** Build a UUID v7 from a millisecond timestamp + 10 random bytes (RFC 9562). */
export function uuidV7FromBytes(timestampMs: number, randomBytes: Uint8Array): string {
  assertTimestampMs(timestampMs)
  if (randomBytes.length !== 10) throw new RangeError('UUID v7 requires exactly 10 random bytes')
  const b = new Uint8Array(16)
  writeTimestamp48(b, timestampMs)
  b.set(randomBytes, 6)
  b[6] = (b[6]! & 0x0f) | 0x70 // version 7
  b[8] = (b[8]! & 0x3f) | 0x80 // variant 10xx (RFC 9562)
  return bytesToUuid(b)
}

/** Decode the first 48 bits of a UUID string as a Unix millisecond timestamp. */
export function decodeV7Timestamp(raw: string): number {
  const hex = raw.replace(/-/g, '').slice(0, 12)
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) throw new Error(`not a UUID: ${raw}`)
  return Number.parseInt(hex, 16)
}

function generateV7(opts: GeneratorOptions): string {
  const ts = opts.now ? opts.now() : Date.now()
  return uuidV7FromBytes(ts, randomBytesOf(opts, 10))
}

/**
 * Encode timestamp (48-bit ms) + exactly 10 random bytes (80 bits) as a 26-char
 * Crockford base32 string. Returns the alphabet's canonical (uppercase) form;
 * the tool's raw presentation lowercases it so the 「大写」 switch stays effective.
 */
export function ulidFromParts(timestampMs: number, randomBytes: Uint8Array): string {
  assertTimestampMs(timestampMs)
  if (randomBytes.length !== 10) throw new RangeError('ULID requires exactly 10 random bytes')
  let random = 0n
  for (let i = 0; i < 10; i++) random = (random << 8n) | BigInt(randomBytes[i]!)
  const value = (BigInt(timestampMs) << 80n) | random
  let rest = value
  let out = ''
  for (let i = 0; i < 26; i++) {
    out = ULID_ALPHABET[Number(rest & 0x1fn)]! + out
    rest >>= 5n
  }
  return out
}

/** Decode the first 10 chars of a ULID as a Unix millisecond timestamp. */
export function decodeUlidTimestamp(raw: string): number {
  const head = raw.slice(0, 10).toUpperCase()
  if (!/^[0-9A-HJ-NP-TV-Z]{10}$/.test(head)) throw new Error(`not a ULID: ${raw}`)
  let ts = 0
  for (const ch of head) {
    ts = ts * 32 + ULID_ALPHABET.indexOf(ch)
  }
  return ts
}

function generateUlid(opts: GeneratorOptions): string {
  const ts = opts.now ? opts.now() : Date.now()
  return ulidFromParts(ts, randomBytesOf(opts, 10)).toLowerCase()
}

/**
 * Synchronously generate `count` identifiers (1–1000). Rows each sample the
 * clock independently; cross-row monotonicity is NOT guaranteed — uniqueness
 * within a batch comes from the random bits.
 */
export function generateBatch(kind: IdKind, count: number, opts: GeneratorOptions = {}): string[] {
  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    throw new RangeError(`count must be an integer in [${MIN_COUNT}, ${MAX_COUNT}], got ${count}`)
  }
  const out: string[] = new Array(count)
  for (let i = 0; i < count; i++) out[i] = generateId(kind, opts)
  return out
}

/**
 * Validate a user-entered count. Accepts digit-only strings (trimmed) or
 * integers in [1, 1000]; anything else — out-of-range, fractional, empty,
 * non-numeric — returns null (the UI shows the error state).
 */
export function parseCount(raw: unknown): number | null {
  let n: number
  if (typeof raw === 'number') {
    n = raw
  } else if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    n = Number(raw.trim())
  } else {
    return null
  }
  if (!Number.isInteger(n) || n < MIN_COUNT || n > MAX_COUNT) return null
  return n
}

/**
 * Pure presentation transform — never changes the identifier itself.
 * - ULID: only the uppercase switch applies (no hyphens/braces semantics);
 *   braces/hyphenless are ignored even if set (the UI hides them).
 * - v4/v7: strip hyphens → uppercase → wrap in braces (braces wrap the final
 *   string, matching the conventional `{GUID}` rendering).
 */
export function formatId(raw: string, kind: IdKind, format: FormatOptions = { ...DEFAULT_FORMAT }): string {
  if (kind === 'ulid') {
    return format.uppercase ? raw.toUpperCase() : raw
  }
  let out = raw
  if (format.hyphenless) out = out.replace(/-/g, '')
  if (format.uppercase) out = out.toUpperCase()
  if (format.braces) out = `{${out}}`
  return out
}

/** Generate a single identifier in its canonical (raw) form. */
export function generateId(kind: IdKind, opts: GeneratorOptions = {}): string {
  switch (kind) {
    case 'v4': {
      // Prefer the platform primitive when no custom random source is injected.
      if (!opts.random) {
        const c = globalCrypto()
        if (typeof c.randomUUID === 'function') return c.randomUUID()
        return uuidV4FromBytes(c.getRandomValues(new Uint8Array(16)))
      }
      return uuidV4FromBytes(opts.random(16))
    }
    case 'v7':
      return generateV7(opts)
    case 'ulid':
      return generateUlid(opts)
  }
}
