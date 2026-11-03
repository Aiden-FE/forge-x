import { describe, expect, it } from 'vitest'
import {
  BCRYPT_HASH_RE,
  DEFAULT_COST,
  HASH_LENGTH,
  MAX_COST,
  MIN_COST,
  SLOW_COST_THRESHOLD,
  clampCost,
  exceedsTruncationLimit,
  handleBcryptRequest,
  hashPassword,
  isBcryptFormat,
  parseBcryptHash,
  truncateTo72Bytes,
  utf8ByteLength,
  verifyPassword,
} from './bcrypt'

/**
 * 硬编码向量的验证方式（2026-11-03，bcryptjs 3.0.3 / node 22）：
 * 1. 'U*U' 与 'U*U*'：OpenBSD crypt_blowfish 经典测试向量，bcryptjs.compare 逐一验证为真；
 * 2. 73 字节截断向量（RFC/crypt_blowfish 截断用例）：同上验证为真；
 * 3. 'password' @ $2b$10$：本会话用 bcryptjs.hash('password', 10) 生成并 compare 回验为真；
 * 4. $2y$ 前缀样本：上一条的 $2b$ → $2y$ 前缀置换（PHP password_hash 口径，$2y$ 与 $2b$
 *    计算等价），bcryptjs.compare 验证为真。
 */
const VECTOR_U_STAR_U = '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW'
const VECTOR_U_STAR_U_STAR = '$2a$05$CCCCCCCCCCCCCCCCCCCCC.VGOzA784oUp/Z0DY336zx7pLYAy0lwK'
const VECTOR_TRUNCATED_72 = '$2a$05$abcdefghijklmnopqrstuu5s2v8.iXieOjg/.AySBTTZIIVFJeBui'
const VECTOR_PASSWORD_2B = '$2b$10$Iv9Co4r3Qb60ic8ISW0IIebRywG0srRgQq3y2cMT3AwPu2HirRkxu'
const VECTOR_PASSWORD_2Y = '$2y$10$Iv9Co4r3Qb60ic8ISW0IIebRywG0srRgQq3y2cMT3AwPu2HirRkxu'

describe('格式正则与四段拆解（验收 2）', () => {
  it('60 字符合法哈希三前缀全部通过', () => {
    expect(isBcryptFormat(VECTOR_PASSWORD_2B)).toBe(true)
    expect(isBcryptFormat(VECTOR_PASSWORD_2Y)).toBe(true)
    expect(isBcryptFormat(VECTOR_U_STAR_U)).toBe(true)
    expect(VECTOR_U_STAR_U).toHaveLength(HASH_LENGTH)
  })

  it('四段拆解：前缀 / 工作因子 / salt(22) / 摘要(31)', () => {
    const segments = parseBcryptHash(VECTOR_PASSWORD_2B)
    expect(segments).toEqual({
      prefix: '$2b$',
      cost: '10',
      salt: 'Iv9Co4r3Qb60ic8ISW0IIe',
      digest: 'bRywG0srRgQq3y2cMT3AwPu2HirRkxu',
    })
    expect(segments!.salt).toHaveLength(22)
    expect(segments!.digest).toHaveLength(31)
  })

  it('非法串：短 / 长 / 错字符集 / 错前缀 / 空', () => {
    expect(parseBcryptHash('$2b$10$Iv9Co4r3Qb60ic8ISW0IIe')).toBeNull() // 过短
    expect(parseBcryptHash(`${VECTOR_PASSWORD_2B}X`)).toBeNull() // 过长
    expect(parseBcryptHash('$2b$10$Iv9Co4r3Qb60ic8ISW0II!bRywG0srRgQq3y2cMT3AwPu2HirRkx')).toBeNull() // 错字符集
    expect(parseBcryptHash('$2c$10$Iv9Co4r3Qb60ic8ISW0IIebRywG0srRgQq3y2cMT3AwPu2HirRkxu')).toBeNull() // 错前缀
    expect(parseBcryptHash('')).toBeNull()
    expect(isBcryptFormat('plaintext')).toBe(false)
  })

  it('格式正则限定 2 位工作因子与 [./A-Za-z0-9] 字符集', () => {
    expect(BCRYPT_HASH_RE.test('$2b$10$Iv9Co4r3Qb60ic8ISW0IIebRywG0srRgQq3y2cMT3AwPu2HirRkxu')).toBe(true)
    expect(BCRYPT_HASH_RE.test('$2b$1$Iv9Co4r3Qb60ic8ISW0IIebRywG0srRgQq3y2cMT3AwPu2HirRkxu')).toBe(false)
    expect(BCRYPT_HASH_RE.test('$2b$10$Iv9Co4r3Qb60ic8ISW0IIebRywG0srRgQq3y2cMT3AwPu2HirRk')).toBe(false) // 30 位摘要
  })
})

describe('截断语义（验收 3）', () => {
  it('UTF-8 字节口径：73+ 字节触发警示', () => {
    expect(utf8ByteLength('a'.repeat(72))).toBe(72)
    expect(exceedsTruncationLimit('a'.repeat(72))).toBe(false)
    expect(exceedsTruncationLimit('a'.repeat(73))).toBe(true)
  })

  it('24 个汉字恰好 72 字节（达上限不警示），第 25 个汉字触发', () => {
    expect(utf8ByteLength('汉'.repeat(24))).toBe(72)
    expect(exceedsTruncationLimit('汉'.repeat(24))).toBe(false)
    expect(exceedsTruncationLimit('汉'.repeat(25))).toBe(true)
  })

  it('truncateTo72Bytes 按 UTF-8 截断且不拆散多字节字符', () => {
    expect(truncateTo72Bytes(`${'a'.repeat(72)}XYZ`)).toBe('a'.repeat(72))
    expect(truncateTo72Bytes('汉'.repeat(25))).toBe('汉'.repeat(24))
    expect(truncateTo72Bytes('abc')).toBe('abc')
  })

  it('截断后哈希与「手动截断到 72 字节」结果一致（ASCII）', async () => {
    const full = `${'a'.repeat(72)}garbage`
    const hash = await hashPassword(full, 4)
    await expect(verifyPassword('a'.repeat(72), hash)).resolves.toBe('match')
    // 第 73 字节起不参与运算：换掉尾部任意内容仍匹配（与真实服务端静默截断一致）
    await expect(verifyPassword(`${'a'.repeat(72)}different-tail`, hash)).resolves.toBe('match')
    // 前 72 字节不同则不匹配
    await expect(verifyPassword(`${'b'.repeat(72)}`, hash)).resolves.toBe('mismatch')
  })

  it('截断语义对 CJK 同样成立（24 汉字达上限）', async () => {
    const hash = await hashPassword('汉'.repeat(25), 4)
    await expect(verifyPassword('汉'.repeat(24), hash)).resolves.toBe('match')
  })
})

describe('校验三态与前缀 fixtures（验收 1）', () => {
  it('$2a$ 经典向量验签为真，错密码为不匹配', async () => {
    await expect(verifyPassword('U*U', VECTOR_U_STAR_U)).resolves.toBe('match')
    await expect(verifyPassword('U*u', VECTOR_U_STAR_U)).resolves.toBe('mismatch')
  })

  it('$2a$ 第二向量（U*U*）验签为真', async () => {
    await expect(verifyPassword('U*U*', VECTOR_U_STAR_U_STAR)).resolves.toBe('match')
    await expect(verifyPassword('U*U', VECTOR_U_STAR_U_STAR)).resolves.toBe('mismatch')
  })

  it('$2b$ 向量（本会话生成并回验）真/假均正确', async () => {
    await expect(verifyPassword('password', VECTOR_PASSWORD_2B)).resolves.toBe('match')
    await expect(verifyPassword('Password', VECTOR_PASSWORD_2B)).resolves.toBe('mismatch')
  })

  it('PHP $2y$ 样本（前缀置换自 $2b$）验签为真', async () => {
    await expect(verifyPassword('password', VECTOR_PASSWORD_2Y)).resolves.toBe('match')
    await expect(verifyPassword('passwordx', VECTOR_PASSWORD_2Y)).resolves.toBe('mismatch')
  })

  it('73 字节截断经典向量：全文与前 72 字节均匹配', async () => {
    const full72 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    await expect(verifyPassword(`${full72}chars after 72 are ignored`, VECTOR_TRUNCATED_72)).resolves.toBe('match')
    await expect(verifyPassword(full72, VECTOR_TRUNCATED_72)).resolves.toBe('match')
  })

  it('格式非法直接三态之 invalid-format（不进库比对）', async () => {
    await expect(verifyPassword('password', 'not-a-bcrypt-hash')).resolves.toBe('invalid-format')
    await expect(verifyPassword('password', '')).resolves.toBe('invalid-format')
  })
})

describe('生成哈希（验收 4、5）', () => {
  it('输出完整 60 字符 modular crypt 格式，库默认前缀 $2b$，不提供前缀切换', async () => {
    const hash = await hashPassword('s3cret!', 4)
    expect(hash).toHaveLength(60)
    expect(isBcryptFormat(hash)).toBe(true)
    expect(hash.startsWith('$2b$')).toBe(true)
  })

  it('同一密码两次生成哈希不同（内嵌随机 salt），但均校验通过', async () => {
    const h1 = await hashPassword('same-password', 4)
    const h2 = await hashPassword('same-password', 4)
    expect(h1).not.toBe(h2)
    await expect(verifyPassword('same-password', h1)).resolves.toBe('match')
    await expect(verifyPassword('same-password', h2)).resolves.toBe('match')
  })

  it('Unicode/emoji 密码可生成与校验（UTF-8 编码口径）', async () => {
    const password = '密码🔒Pässwörd🚀'
    const hash = await hashPassword(password, 4)
    await expect(verifyPassword(password, hash)).resolves.toBe('match')
    await expect(verifyPassword('密码🔒Pässwörd', hash)).resolves.toBe('mismatch')
  })

  it('cost 边界：4 与 15 均可执行', async () => {
    const h4 = await hashPassword('x', 4)
    expect(parseBcryptHash(h4)!.cost).toBe('04')
    const h15 = await hashPassword('x', 15)
    expect(parseBcryptHash(h15)!.cost).toBe('15')
    await expect(verifyPassword('x', h15)).resolves.toBe('match')
  }, 30000)

  it('clampCost 夹取 4–15；>12 为秒级提示阈值', () => {
    expect(clampCost(4)).toBe(MIN_COST)
    expect(clampCost(15)).toBe(MAX_COST)
    expect(clampCost(0)).toBe(MIN_COST)
    expect(clampCost(31)).toBe(MAX_COST)
    expect(clampCost(10.4)).toBe(DEFAULT_COST)
    expect(SLOW_COST_THRESHOLD).toBe(12)
    expect(13 > SLOW_COST_THRESHOLD).toBe(true)
  })
})

describe('Worker 协议编排 handleBcryptRequest', () => {
  it('hash 请求返回 ok 与 60 字符哈希', async () => {
    const res = await handleBcryptRequest({ id: 1, kind: 'hash', password: 'abc', cost: 4 })
    expect(res.ok).toBe(true)
    expect(res.kind).toBe('hash')
    if (res.kind === 'hash' && res.ok) expect(res.hash).toHaveLength(60)
  })

  it('verify 请求三态透传', async () => {
    const match = await handleBcryptRequest({ id: 2, kind: 'verify', password: 'U*U', hash: VECTOR_U_STAR_U })
    expect(match).toMatchObject({ kind: 'verify', ok: true, status: 'match' })

    const mismatch = await handleBcryptRequest({ id: 3, kind: 'verify', password: 'nope', hash: VECTOR_U_STAR_U })
    expect(mismatch).toMatchObject({ kind: 'verify', ok: true, status: 'mismatch' })

    const invalid = await handleBcryptRequest({ id: 4, kind: 'verify', password: 'x', hash: 'garbage' })
    expect(invalid).toMatchObject({ kind: 'verify', ok: true, status: 'invalid-format' })
  })
})
