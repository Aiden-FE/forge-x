/**
 * BIP39 助记词纯逻辑层（生成/校验/派生分离，组件只做交互）。
 *
 * 术语与口径见 CONTEXT.md「助记词 (Mnemonic)」：
 * - 12–24 英文词短语 = 熵 + 校验和的编码形态，词表单语英文（官方劝阻非英文词表）；
 * - 校验和失败只能整体报错——数学上无法定位是哪个词错；词表外词才可定位词位；
 * - passphrase 是 seed 的加盐口令，不是助记词本身（_Avoid_ 硬边界）；
 * - seed（64 字节 PBKDF2-HMAC-SHA512 × 2048，可带 passphrase）是本工具链终点，
 *   BIP32/BIP44 钱包派生出界。
 *
 * 规格见 .scratch/hot-tools-v0.5.0/issues/07-bip39-spec.md：
 * - @scure/bip39@2.4.0 锁定（审计件）；库与英文词表同块首用 dynamic import
 *   （附录 §1），绝不静态 import——首屏第三方增量 0；
 * - 生成类非实时：档位只影响下一次生成，显式按钮触发；熵源走库内
 *   WebCrypto CSPRNG（@noble/hashes randomBytes → crypto.getRandomValues）；
 * - 校验实时防抖 300ms（附录 §2），结构化错误清单镜像 id-card-validator 精神；
 * - seed 派生按钮触发（2048 轮 KDF 有成本，bcrypt 先例）；
 *   原生 WebCrypto 实现（mnemonicToSeedWebcrypto）；
 * - 不持久化、无 opt-in 记忆（严于 TOTP 先例）——本模块零 localStorage 触点。
 *
 * 注意：@scure/bip39 内部 normalize 只按单空格切分且不改大小写；
 * 本层自带粘贴容错规范化（NFKD + 小写 + 任意空白折叠），校验/派生
 * 一律先过该规范化，保证与库的 NFKD 口径一致。
 */

/** 词数档位（用户语言呈现；strength 128–256 step 32）。 */
export const WORD_COUNT_OPTIONS = [12, 15, 18, 21, 24] as const
export type WordCount = (typeof WORD_COUNT_OPTIONS)[number]
export const DEFAULT_WORD_COUNT: WordCount = 12

/** 校验区实时防抖间隔（校验类实时防抖 300ms，附录 §2）。 */
export const DEBOUNCE_MS = 300

/** seed 长度（字节 / hex 字符），BIP39 规范固定。 */
export const SEED_BYTES = 64
export const SEED_HEX_LENGTH = 128

/** 官方 passphrase 测试向量口径（python-mnemonic vectors.json 全集用 TREZOR）。 */
export const OFFICIAL_TEST_PASSPHRASE = 'TREZOR'

/** 词数档位 → 熵强度：总位 = 词数 × 11，其中熵占 32/33（12→128 … 24→256）。 */
export function strengthForWordCount(count: WordCount): number {
  return (count * 32) / 3
}

// ---- 库加载（库 + 英文词表同块首用加载，引用缓存共享单实例） ----

interface Bip39Module {
  api: typeof import('@scure/bip39')
  wordlist: string[]
}

let cachedModule: Bip39Module | null = null
let cachedWordSet: Set<string> | null = null

async function loadBip39(): Promise<Bip39Module> {
  if (!cachedModule) {
    const [api, { wordlist }] = await Promise.all([
      import('@scure/bip39'),
      import('@scure/bip39/wordlists/english.js'),
    ])
    cachedModule = { api, wordlist }
  }
  return cachedModule
}

async function loadWordSet(): Promise<Set<string>> {
  if (!cachedWordSet) {
    const { wordlist } = await loadBip39()
    cachedWordSet = new Set(wordlist)
  }
  return cachedWordSet
}

// ---- 字节 ↔ hex（展示与测试共用） ----

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('invalid hex string')
  }
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

// ---- 生成（非实时：一次调用 = 一次显式生成） ----

export interface GeneratedMnemonic {
  mnemonic: string
  /** 熵 hex（只读展示，不提供编辑——不跟 it-tools 的可编辑双向）。 */
  entropyHex: string
  /** 熵位数（128–256）。 */
  entropyBits: number
  /** 词数。 */
  wordCount: WordCount
}

/**
 * 按词数档位生成助记词。熵源为库内 WebCrypto CSPRNG；
 * 返回的 entropyHex 由生成结果反解（mnemonicToEntropy）而来。
 */
export async function generateMnemonicByWordCount(
  count: WordCount,
): Promise<GeneratedMnemonic> {
  const { api, wordlist } = await loadBip39()
  const strength = strengthForWordCount(count)
  const mnemonic = api.generateMnemonic(wordlist, strength)
  const entropy = api.mnemonicToEntropy(mnemonic, wordlist)
  return {
    mnemonic,
    entropyHex: toHex(entropy),
    entropyBits: entropy.length * 8,
    wordCount: count,
  }
}

// ---- 校验（结构化错误清单） ----

export type Bip39ErrorCode =
  | 'wordCount' // 词数 ∉ {12,15,18,21,24}：无法分段，只报词数
  | 'unknownWord' // 词表外词：可定位（第 N 词，逐词并列报）
  | 'checksum' // 校验和失败：整体报错不定位——数学上无法定位词位
  | 'internal' // 兜底（不应出现）

export interface Bip39Error {
  code: Bip39ErrorCode
  /** unknownWord：1-based 词位。 */
  index?: number
  /** unknownWord：词原文（规范化后）。 */
  word?: string
  /** wordCount：实际词数（空输入为 0）。 */
  count?: number
  /** internal：底层错误消息。 */
  message?: string
}

export interface Bip39Validation {
  valid: boolean
  /** 容错规范化（NFKD + 小写 + 单空格）后的助记词；空输入为 ''。 */
  normalized: string
  /** 词数；空输入为 0。 */
  wordCount: number
  /** 仅通过校验时给出：词数 → 熵长度（位）。 */
  entropyBits: number | null
  /** 仅通过校验时给出：熵 hex。 */
  entropyHex: string | null
  /** 结构化错误清单：所有可判定的错误并列（镜像 id-card-validator）。 */
  errors: Bip39Error[]
}

/**
 * 粘贴容错规范化：NFKD（BIP39 口径）+ 小写（词表单语小写英文）
 * + 任意空白（含换行/制表/连续空格）折叠为单空格。
 */
export function normalizeMnemonicInput(raw: string): string {
  return raw
    .normalize('NFKD')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .join(' ')
}

/**
 * 校验助记词：词数 → 词表外词（逐词定位并列）→ 校验和（整体判定）。
 *
 * - 词数非法时仍并列报出词表外词（所有可判定的错误并列，沿 id-card 精神），
 *   但不做校验和判定（无法进行）；
 * - 全部词在表内且词数合法时，唯一剩余失败原因即校验和——
 *   该错误不带词位（信息论边界内如实呈现，附录 §4）。
 */
export async function validateMnemonicPhrase(raw: string): Promise<Bip39Validation> {
  const normalized = normalizeMnemonicInput(raw)
  const words = normalized === '' ? [] : normalized.split(' ')
  const errors: Bip39Error[] = []

  if (!(WORD_COUNT_OPTIONS as readonly number[]).includes(words.length)) {
    errors.push({ code: 'wordCount', count: words.length })
  }

  const set = await loadWordSet()
  for (let i = 0; i < words.length; i++) {
    if (!set.has(words[i]!)) {
      errors.push({ code: 'unknownWord', index: i + 1, word: words[i]! })
    }
  }

  if (errors.length > 0) {
    return { valid: false, normalized, wordCount: words.length, entropyBits: null, entropyHex: null, errors }
  }

  const { api, wordlist } = await loadBip39()
  if (!api.validateMnemonic(normalized, wordlist)) {
    return {
      valid: false,
      normalized,
      wordCount: words.length,
      entropyBits: null,
      entropyHex: null,
      errors: [{ code: 'checksum' }],
    }
  }
  const entropy = api.mnemonicToEntropy(normalized, wordlist)
  return {
    valid: true,
    normalized,
    wordCount: words.length,
    entropyBits: entropy.length * 8,
    entropyHex: toHex(entropy),
    errors: [],
  }
}

// ---- seed 派生（按钮触发；原生 WebCrypto PBKDF2-HMAC-SHA512 × 2048 轮） ----

/**
 * 由助记词 + 可选 passphrase 派生 seed（64 字节 → 128 hex 字符）。
 * passphrase 为空即 BIP39 标准 salt 口径（"mnemonic"）；
 * 非空即第 25 词式加盐（_Avoid_：它是 seed 的口令，不是助记词本身）。
 * 前置条件：mnemonic 形状合法（组件层仅在校验通过后开放按钮）；
 * 形状非法时由库抛错，调用方自行捕获。
 */
export async function deriveSeedHex(mnemonic: string, passphrase: string): Promise<string> {
  const { api } = await loadBip39()
  const normalized = normalizeMnemonicInput(mnemonic)
  const seed = await api.mnemonicToSeedWebcrypto(normalized, passphrase)
  return toHex(seed)
}

/**
 * 派生输入签名：规范化助记词 + 原样 passphrase（passphrase 是加盐口令，
 * 空白也是真实口令差异，不做任何修剪）共同构成。
 * 任一变更 → 签名变化 → 组件据此把旧 seed 标记失效。
 * 长度前缀使签名对 (mnemonic, passphrase) 二元组单射（纯分隔符可构造拼接歧义）。
 */
export function derivationSignature(mnemonic: string, passphrase: string): string {
  const normalized = normalizeMnemonicInput(mnemonic)
  return `${normalized.length}\u0000${normalized}\u0000${passphrase}`
}
