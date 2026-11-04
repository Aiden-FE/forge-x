// @vitest-environment happy-dom
// mnemonicToSeedWebcrypto 依赖 globalThis.crypto.subtle（Node webcrypto 在
// happy-dom 环境下可用，沿 totp.spec.ts 的 WebCrypto 先例）；
// 官方 passphrase seed 向量全程真算 PBKDF2-HMAC-SHA512 × 2048 轮。
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORD_COUNT,
  DEBOUNCE_MS,
  OFFICIAL_TEST_PASSPHRASE,
  SEED_HEX_LENGTH,
  WORD_COUNT_OPTIONS,
  derivationSignature,
  deriveSeedHex,
  generateMnemonicByWordCount,
  hexToBytes,
  normalizeMnemonicInput,
  strengthForWordCount,
  toHex,
  validateMnemonicPhrase,
} from './bip39'

/**
 * BIP39 官方测试向量（en 词表，passphrase 固定 "TREZOR"）：
 * trezor/python-mnemonic vectors.json @ master（GitHub API 取 sha d362a5d4，
 * 与 trustwallet/wallet-core tests/common/HDWallet/bip39_vectors.json 逐条一致）。
 * 官方全集共 24 条，覆盖 12/18/24 词三档——160/224 位档官方集不含，
 * 由本文件「160/224 档交叉验证」describe 以独立参考实现锚定（见其注释）。
 */
const OFFICIAL_VECTORS: ReadonlyArray<{
  bits: number
  entropy: string
  mnemonic: string
  seed: string
}> = [
  { bits: 128, entropy: '00000000000000000000000000000000', mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', seed: 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04' },
  { bits: 128, entropy: '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f', mnemonic: 'legal winner thank year wave sausage worth useful legal winner thank yellow', seed: '2e8905819b8723fe2c1d161860e5ee1830318dbf49a83bd451cfb8440c28bd6fa457fe1296106559a3c80937a1c1069be3a3a5bd381ee6260e8d9739fce1f607' },
  { bits: 128, entropy: '80808080808080808080808080808080', mnemonic: 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above', seed: 'd71de856f81a8acc65e6fc851a38d4d7ec216fd0796d0a6827a3ad6ed5511a30fa280f12eb2e47ed2ac03b5c462a0358d18d69fe4f985ec81778c1b370b652a8' },
  { bits: 128, entropy: 'ffffffffffffffffffffffffffffffff', mnemonic: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong', seed: 'ac27495480225222079d7be181583751e86f571027b0497b5b5d11218e0a8a13332572917f0f8e5a589620c6f15b11c61dee327651a14c34e18231052e48c069' },
  { bits: 128, entropy: '9e885d952ad362caeb4efe34a8e91bd2', mnemonic: 'ozone drill grab fiber curtain grace pudding thank cruise elder eight picnic', seed: '274ddc525802f7c828d8ef7ddbcdc5304e87ac3535913611fbbfa986d0c9e5476c91689f9c8a54fd55bd38606aa6a8595ad213d4c9c9f9aca3fb217069a41028' },
  { bits: 128, entropy: 'c0ba5a8e914111210f2bd131f3d5e08d', mnemonic: 'scheme spot photo card baby mountain device kick cradle pact join borrow', seed: 'ea725895aaae8d4c1cf682c1bfd2d358d52ed9f0f0591131b559e2724bb234fca05aa9c02c57407e04ee9dc3b454aa63fbff483a8b11de949624b9f1831a9612' },
  { bits: 128, entropy: '23db8160a31d3e0dca3688ed941adbf3', mnemonic: 'cat swing flag economy stadium alone churn speed unique patch report train', seed: 'deb5f45449e615feff5640f2e49f933ff51895de3b4381832b3139941c57b59205a42480c52175b6efcffaa58a2503887c1e8b363a707256bdd2b587b46541f5' },
  { bits: 128, entropy: 'f30f8c1da665478f49b001d94c5fc452', mnemonic: 'vessel ladder alter error federal sibling chat ability sun glass valve picture', seed: '2aaa9242daafcee6aa9d7269f17d4efe271e1b9a529178d7dc139cd18747090bf9d60295d0ce74309a78852a9caadf0af48aae1c6253839624076224374bc63f' },
  { bits: 192, entropy: '000000000000000000000000000000000000000000000000', mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon agent', seed: '035895f2f481b1b0f01fcf8c289c794660b289981a78f8106447707fdd9666ca06da5a9a565181599b79f53b844d8a71dd9f439c52a3d7b3e8a79c906ac845fa' },
  { bits: 192, entropy: '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f', mnemonic: 'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal will', seed: 'f2b94508732bcbacbcc020faefecfc89feafa6649a5491b8c952cede496c214a0c7b3c392d168748f2d4a612bada0753b52a1c7ac53c1e93abd5c6320b9e95dd' },
  { bits: 192, entropy: '808080808080808080808080808080808080808080808080', mnemonic: 'letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter always', seed: '107d7c02a5aa6f38c58083ff74f04c607c2d2c0ecc55501dadd72d025b751bc27fe913ffb796f841c49b1d33b610cf0e91d3aa239027f5e99fe4ce9e5088cd65' },
  { bits: 192, entropy: 'ffffffffffffffffffffffffffffffffffffffffffffffff', mnemonic: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo when', seed: '0cd6e5d827bb62eb8fc1e262254223817fd068a74b5b449cc2f667c3f1f985a76379b43348d952e2265b4cd129090758b3e3c2c49103b5051aac2eaeb890a528' },
  { bits: 192, entropy: '6610b25967cdcca9d59875f5cb50b0ea75433311869e930b', mnemonic: 'gravity machine north sort system female filter attitude volume fold club stay feature office ecology stable narrow fog', seed: '628c3827a8823298ee685db84f55caa34b5cc195a778e52d45f59bcf75aba68e4d7590e101dc414bc1bbd5737666fbbef35d1f1903953b66624f910feef245ac' },
  { bits: 192, entropy: '6d9be1ee6ebd27a258115aad99b7317b9c8d28b6d76431c3', mnemonic: 'horn tenant knee talent sponsor spell gate clip pulse soap slush warm silver nephew swap uncle crack brave', seed: 'fd579828af3da1d32544ce4db5c73d53fc8acc4ddb1e3b251a31179cdb71e853c56d2fcb11aed39898ce6c34b10b5382772db8796e52837b54468aeb312cfc3d' },
  { bits: 192, entropy: '8197a4a47f0425faeaa69deebc05ca29c0a5b5cc76ceacc0', mnemonic: 'light rule cinnamon wrap drastic word pride squirrel upgrade then income fatal apart sustain crack supply proud access', seed: '4cbdff1ca2db800fd61cae72a57475fdc6bab03e441fd63f96dabd1f183ef5b782925f00105f318309a7e9c3ea6967c7801e46c8a58082674c860a37b93eda02' },
  { bits: 192, entropy: 'c10ec20dc3cd9f652c7fac2f1230f7a3c828389a14392f05', mnemonic: 'scissors invite lock maple supreme raw rapid void congress muscle digital elegant little brisk hair mango congress clump', seed: '7b4a10be9d98e6cba265566db7f136718e1398c71cb581e1b2f464cac1ceedf4f3e274dc270003c670ad8d02c4558b2f8e39edea2775c9e232c7cb798b069e88' },
  { bits: 256, entropy: '0000000000000000000000000000000000000000000000000000000000000000', mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art', seed: 'bda85446c68413707090a52022edd26a1c9462295029f2e60cd7c4f2bbd3097170af7a4d73245cafa9c3cca8d561a7c3de6f5d4a10be8ed2a5e608d68f92fcc8' },
  { bits: 256, entropy: '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f', mnemonic: 'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title', seed: 'bc09fca1804f7e69da93c2f2028eb238c227f2e9dda30cd63699232578480a4021b146ad717fbb7e451ce9eb835f43620bf5c514db0f8add49f5d121449d3e87' },
  { bits: 256, entropy: '8080808080808080808080808080808080808080808080808080808080808080', mnemonic: 'letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless', seed: 'c0c519bd0e91a2ed54357d9d1ebef6f5af218a153624cf4f2da911a0ed8f7a09e2ef61af0aca007096df430022f7a2b6fb91661a9589097069720d015e4e982f' },
  { bits: 256, entropy: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', mnemonic: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote', seed: 'dd48c104698c30cfe2b6142103248622fb7bb0ff692eebb00089b32d22484e1613912f0a5b694407be899ffd31ed3992c456cdf60f5d4564b8ba3f05a69890ad' },
  { bits: 256, entropy: '68a79eaca2324873eacc50cb9c6eca8cc68ea5d936f98787c60c7ebc74e6ce7c', mnemonic: 'hamster diagram private dutch cause delay private meat slide toddler razor book happy fancy gospel tennis maple dilemma loan word shrug inflict delay length', seed: '64c87cde7e12ecf6704ab95bb1408bef047c22db4cc7491c4271d170a1b213d20b385bc1588d9c7b38f1b39d415665b8a9030c9ec653d75e65f847d8fc1fc440' },
  { bits: 256, entropy: '9f6a2878b2520799a44ef18bc7df394e7061a224d2c33cd015b157d746869863', mnemonic: 'panda eyebrow bullet gorilla call smoke muffin taste mesh discover soft ostrich alcohol speed nation flash devote level hobby quick inner drive ghost inside', seed: '72be8e052fc4919d2adf28d5306b5474b0069df35b02303de8c1729c9538dbb6fc2d731d5f832193cd9fb6aeecbc469594a70e3dd50811b5067f3b88b28c3e8d' },
  { bits: 256, entropy: '066dca1a2bb7e8a1db2832148ce9933eea0f3ac9548d793112d9a95c9407efad', mnemonic: 'all hour make first leader extend hole alien behind guard gospel lava path output census museum junior mass reopen famous sing advance salt reform', seed: '26e975ec644423f4a4c4f4215ef09b4bd7ef924e85d1d17c4cf3f136c2863cf6df0a475045652c57eb5fb41513ca2a2d67722b77e954b4b3fc11f7590449191d' },
  { bits: 256, entropy: 'f585c11aec520db57dd353c69554b21a89b20fb0650966fa0a9d6f74fd989d8f', mnemonic: 'void come effort suffer camp survey warrior heavy shoot primary clutch crush open amazing screen patrol group space point ten exist slush involve unfold', seed: '01f5bced59dec48e36f2f2c45b5de68b9fd6c92c6634f44d6d40aab69056506f0e35524a518034ddc1192e1dacd32c1ed3eaa3c3b131c88ed8e7e54c49a5d0998' },
]

/** 官方 12 词 / 24 词向量（seed 断言专用引用）。 */
const VECTOR_12 = OFFICIAL_VECTORS[0]!
const VECTOR_24 = OFFICIAL_VECTORS[16]!

/**
 * 独立参考实现：按 BIP39 规格公式手写熵 → 助记词
 * （WebCrypto SHA-256 校验和 + 11 位词索引打包），不经过 @scure/bip39。
 * 仅测试内使用：为 160/224 位档提供与库无关的交叉验证
 * （官方向量集只覆盖 128/192/256 位三档）。
 */
async function referenceMnemonic(entropyHex: string, wordlist: string[]): Promise<string> {
  const entropy = hexToBytes(entropyHex)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy as BufferSource))
  let bits = ''
  for (const byte of entropy) bits += byte.toString(2).padStart(8, '0')
  let checksumBits = ''
  for (const byte of digest) checksumBits += byte.toString(2).padStart(8, '0')
  bits += checksumBits.slice(0, entropy.length / 4)
  const words: string[] = []
  for (let i = 0; i < bits.length; i += 11) {
    words.push(wordlist[Number.parseInt(bits.slice(i, i + 11), 2)]!)
  }
  return words.join(' ')
}

async function loadWordlist(): Promise<string[]> {
  return (await import('@scure/bip39/wordlists/english.js')).wordlist
}

describe('BIP39 官方测试向量：熵 ↔ 助记词往返（验收 1）', () => {
  const byTier = new Map<number, typeof OFFICIAL_VECTORS[number][]>()
  for (const v of OFFICIAL_VECTORS) {
    if (!byTier.has(v.bits)) byTier.set(v.bits, [])
    byTier.get(v.bits)!.push(v)
  }

  // 官方集覆盖 12/18/24 词三档，逐条硬断言；每档 ≥1 由集本身保证
  for (const [bits, vectors] of byTier) {
    describe(`${bits} 位熵（${(bits * 3) / 32} 词档）`, () => {
      for (const v of vectors) {
        it(`熵 ${v.entropy.slice(0, 8)}… ↔ ${v.mnemonic.split(' ')[0]}…${v.mnemonic.split(' ').at(-1)}`, async () => {
          const { entropyToMnemonic, mnemonicToEntropy } = await import('@scure/bip39')
          const wordlist = await loadWordlist()

          // 熵 → 助记词：对官方向量熵断言助记词字符串
          expect(entropyToMnemonic(hexToBytes(v.entropy), wordlist)).toBe(v.mnemonic)
          // 助记词 → 熵：roundtrip 还原官方向量熵
          expect(toHex(mnemonicToEntropy(v.mnemonic, wordlist))).toBe(v.entropy)

          // 逻辑层校验同步给出官方向量熵（组件展示同源）
          const validation = await validateMnemonicPhrase(v.mnemonic)
          expect(validation.valid).toBe(true)
          expect(validation.wordCount).toBe((bits * 3) / 32)
          expect(validation.entropyBits).toBe(bits)
          expect(validation.entropyHex).toBe(v.entropy)
          expect(validation.errors).toEqual([])
        })
      }
    })
  }

  it('官方集三档齐全（128/192/256 各 8 条）', () => {
    expect(byTier.get(128)).toHaveLength(8)
    expect(byTier.get(192)).toHaveLength(8)
    expect(byTier.get(256)).toHaveLength(8)
  })
})

describe('160/224 位档交叉验证（官方集不含该两档，独立参考实现锚定）', () => {
  // 沿官方集自身的熵样式（全 0 / 全 1 / 0x7f / 0x80）构造 15/21 词档锚点
  const cases: Array<{ bits: number; entropy: string }> = [
    { bits: 160, entropy: '00'.repeat(20) },
    { bits: 160, entropy: '7f'.repeat(20) },
    { bits: 160, entropy: '80'.repeat(20) },
    { bits: 160, entropy: 'ff'.repeat(20) },
    { bits: 224, entropy: '00'.repeat(28) },
    { bits: 224, entropy: '7f'.repeat(28) },
    { bits: 224, entropy: '80'.repeat(28) },
    { bits: 224, entropy: 'ff'.repeat(28) },
  ]

  for (const { bits, entropy } of cases) {
    it(`${bits} 位熵 ${entropy.slice(0, 2)}…×${entropy.length / 2} → 库与参考实现一致且可往返`, async () => {
      const { entropyToMnemonic, mnemonicToEntropy } = await import('@scure/bip39')
      const wordlist = await loadWordlist()

      const viaLib = entropyToMnemonic(hexToBytes(entropy), wordlist)
      // 独立参考实现（WebCrypto SHA-256 + 规格公式）与库输出一致
      expect(viaLib).toBe(await referenceMnemonic(entropy, wordlist))
      expect(viaLib.split(' ')).toHaveLength((bits * 3) / 32)
      // 往返还原
      expect(toHex(mnemonicToEntropy(viaLib, wordlist))).toBe(entropy)
      // 逻辑层校验通过并给出同源熵
      const validation = await validateMnemonicPhrase(viaLib)
      expect(validation.valid).toBe(true)
      expect(validation.entropyBits).toBe(bits)
      expect(validation.entropyHex).toBe(entropy)
    })
  }
})

describe('词数档位 → 熵强度映射（验收 4）', () => {
  it('12→128、15→160、18→192、21→224、24→256（步长 32）', () => {
    expect([...WORD_COUNT_OPTIONS]).toEqual([12, 15, 18, 21, 24])
    for (const [count, bits] of [
      [12, 128],
      [15, 160],
      [18, 192],
      [21, 224],
      [24, 256],
    ] as const) {
      expect(strengthForWordCount(count)).toBe(bits)
    }
    const strengths = WORD_COUNT_OPTIONS.map((c) => strengthForWordCount(c))
    for (let i = 1; i < strengths.length; i++) {
      expect(strengths[i]! - strengths[i - 1]!).toBe(32)
    }
    expect(DEFAULT_WORD_COUNT).toBe(12)
  })

  it('校验区防抖间隔为 300ms（附录 §2 校验类实时防抖）', () => {
    expect(DEBOUNCE_MS).toBe(300)
  })
})

describe('生成：五档词数（验收 1）', () => {
  for (const count of WORD_COUNT_OPTIONS) {
    it(`${count} 词档：词数/熵长度/hex 长度/校验全通过`, async () => {
      const generated = await generateMnemonicByWordCount(count)
      const bits = strengthForWordCount(count)

      expect(generated.wordCount).toBe(count)
      expect(generated.mnemonic.split(' ')).toHaveLength(count)
      expect(generated.entropyBits).toBe(bits)
      expect(generated.entropyHex).toHaveLength(bits / 4)

      // 生成的助记词可完整往返：校验通过且熵与展示一致
      const validation = await validateMnemonicPhrase(generated.mnemonic)
      expect(validation.valid).toBe(true)
      expect(validation.entropyHex).toBe(generated.entropyHex)
    })
  }

  it('重新生成产生新熵（CSPRNG；128 位碰撞概率 2⁻¹²⁸，断言稳定）', async () => {
    const first = await generateMnemonicByWordCount(12)
    const second = await generateMnemonicByWordCount(12)
    expect(first.mnemonic).not.toBe(second.mnemonic)
    expect(first.entropyHex).not.toBe(second.entropyHex)
  })
})

describe('校验：结构化错误清单（验收 2 / 附录 §4）', () => {
  it('词数 13 → 词数非法，count=13', async () => {
    const phrase13 = `${VECTOR_12.mnemonic} zoo`
    const result = await validateMnemonicPhrase(phrase13)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([{ code: 'wordCount', count: 13 }])
    expect(result.entropyHex).toBeNull()
  })

  it('词数 16 → 词数非法，count=16', async () => {
    const words18 = OFFICIAL_VECTORS[8]!.mnemonic.split(' ')
    const phrase16 = words18.slice(0, 16).join(' ')
    const result = await validateMnemonicPhrase(phrase16)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([{ code: 'wordCount', count: 16 }])
  })

  it('空输入 → 词数非法，count=0（组件层按空态呈现）', async () => {
    const result = await validateMnemonicPhrase('   \n\t ')
    expect(result.valid).toBe(false)
    expect(result.normalized).toBe('')
    expect(result.wordCount).toBe(0)
    expect(result.errors).toEqual([{ code: 'wordCount', count: 0 }])
  })

  it('词表外词 → 定位第 N 词（单处）', async () => {
    const words = VECTOR_12.mnemonic.split(' ')
    words[2] = 'notaword'
    const result = await validateMnemonicPhrase(words.join(' '))
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([{ code: 'unknownWord', index: 3, word: 'notaword' }])
  })

  it('词表外词 → 逐词并列报出（多处，按词序）', async () => {
    const words = VECTOR_12.mnemonic.split(' ')
    words[0] = 'badword'
    words[5] = 'also-bad'
    words[11] = 'nope'
    const result = await validateMnemonicPhrase(words.join(' '))
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      { code: 'unknownWord', index: 1, word: 'badword' },
      { code: 'unknownWord', index: 6, word: 'also-bad' },
      { code: 'unknownWord', index: 12, word: 'nope' },
    ])
  })

  it('词数非法时词表外词仍并列报出（所有可判定错误并列）', async () => {
    const words = VECTOR_12.mnemonic.split(' ')
    words[1] = 'badword'
    const result = await validateMnemonicPhrase([...words, 'zoo', 'zoo'].join(' '))
    expect(result.errors).toEqual([
      { code: 'wordCount', count: 14 },
      { code: 'unknownWord', index: 2, word: 'badword' },
    ])
  })

  it('校验和坏样例：改末词（仍在词表内）→ 整体报错，不定位词位', async () => {
    const words = VECTOR_12.mnemonic.split(' ')
    expect(words[11]).toBe('about')
    words[11] = 'abandon' // 表内词，但校验和不再成立
    const result = await validateMnemonicPhrase(words.join(' '))
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([{ code: 'checksum' }])
    // 整体报错承诺：错误对象不携带任何词位字段（数学上无法定位）
    expect('index' in result.errors[0]!).toBe(false)
    expect('word' in result.errors[0]!).toBe(false)
  })

  it('24 词档校验和坏样例同样整体报错', async () => {
    const words = VECTOR_24.mnemonic.split(' ')
    words[23] = 'abandon'
    const result = await validateMnemonicPhrase(words.join(' '))
    expect(result.errors).toEqual([{ code: 'checksum' }])
  })

  it('粘贴容错：大写/换行/连续空格/NBSP 均按规范形校验通过', async () => {
    const tolerant = `  ${VECTOR_12.mnemonic.toUpperCase().replaceAll(' ', '  ')} \n\t`
    const result = await validateMnemonicPhrase(tolerant)
    expect(result.valid).toBe(true)
    expect(result.normalized).toBe(VECTOR_12.mnemonic)
    expect(result.entropyHex).toBe(VECTOR_12.entropy)

    expect(normalizeMnemonicInput(`${VECTOR_12.mnemonic.split(' ').join('\n')}`)).toBe(
      VECTOR_12.mnemonic,
    )
    expect(normalizeMnemonicInput(`a\u00A0b  c\td`)).toBe('a b c d')
  })
})

describe('seed 派生：官方 passphrase 向量真算（验收 3）', () => {
  it('12 词官方向量 + passphrase "TREZOR" → 官方 seed hex（PBKDF2 × 2048 真算）', async () => {
    const seed = await deriveSeedHex(VECTOR_12.mnemonic, OFFICIAL_TEST_PASSPHRASE)
    expect(seed).toBe(VECTOR_12.seed)
    expect(seed).toHaveLength(SEED_HEX_LENGTH)
  })

  it('24 词官方向量 + passphrase "TREZOR" → 官方 seed hex', async () => {
    const seed = await deriveSeedHex(VECTOR_24.mnemonic, OFFICIAL_TEST_PASSPHRASE)
    expect(seed).toBe(VECTOR_24.seed)
    expect(seed).toHaveLength(SEED_HEX_LENGTH)
  })

  it('18 词官方向量 + passphrase "TREZOR" → 官方 seed hex（第三档交叉）', async () => {
    const v18 = OFFICIAL_VECTORS[8]!
    const seed = await deriveSeedHex(v18.mnemonic, OFFICIAL_TEST_PASSPHRASE)
    expect(seed).toBe(v18.seed)
  })

  it('passphrase 变化 → seed 变化（加盐语义；空 passphrase = BIP39 标准口径）', async () => {
    const standard = await deriveSeedHex(VECTOR_12.mnemonic, '')
    const trezor = await deriveSeedHex(VECTOR_12.mnemonic, OFFICIAL_TEST_PASSPHRASE)
    expect(standard).not.toBe(trezor)
    expect(trezor).toBe(VECTOR_12.seed)
    // 规范化容错：大小写/空白变体派生同结果（进入 KDF 前先规范化）
    const tolerant = await deriveSeedHex(
      ` ${VECTOR_12.mnemonic.toUpperCase().split(' ').join('  ')} `,
      OFFICIAL_TEST_PASSPHRASE,
    )
    expect(tolerant).toBe(VECTOR_12.seed)
  })
})

describe('派生失效签名（助记词/passphrase 变更 → 旧 seed 失效）', () => {
  it('任一变更 → 签名变化；助记词等价变体 → 签名不变', () => {
    const base = derivationSignature(VECTOR_12.mnemonic, '')
    // 助记词粘贴容错等价（NFKD + 小写 + 空白折叠）不误报失效
    expect(derivationSignature(` ${VECTOR_12.mnemonic.toUpperCase().split(' ').join('  ')} `, '')).toBe(base)
    // passphrase 原样参与：空白也是真实口令差异，必须标记失效
    expect(derivationSignature(VECTOR_12.mnemonic, '  ')).not.toBe(base)
    expect(derivationSignature(VECTOR_12.mnemonic, 'TREZOR')).not.toBe(base)
    expect(derivationSignature(VECTOR_24.mnemonic, '')).not.toBe(base)
  })

  it('签名单射：mnemonic 与 passphrase 无法互换构造相同签名', () => {
    expect(derivationSignature('a', 'b\u0000c')).not.toBe(derivationSignature('a\u0000b', 'c'))
    expect(derivationSignature('ab', 'c')).not.toBe(derivationSignature('a', 'bc'))
  })
})

describe('hex 工具（展示与测试共用口径）', () => {
  it('toHex / hexToBytes 往返；非法 hex 抛错', () => {
    const bytes = new Uint8Array([0x00, 0x7f, 0x80, 0xff])
    expect(toHex(bytes)).toBe('007f80ff')
    expect(hexToBytes('007f80ff')).toEqual(bytes)
    expect(() => hexToBytes('0')).toThrow()
    expect(() => hexToBytes('zz')).toThrow()
  })
})
