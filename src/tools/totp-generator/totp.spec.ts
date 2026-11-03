// @vitest-environment happy-dom
// persistence（记住条目 opt-in）依赖 localStorage，故用 happy-dom；
// WebCrypto HMAC 在该环境下仍走 node 原生实现，RFC 向量不受影响。
import { describe, expect, it } from 'vitest'
import {
  ALGORITHMS,
  DEFAULT_ALGORITHM,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  STORAGE_KEY,
  buildOtpauthUri,
  clearRememberedEntries,
  counterAt,
  decodeBase32,
  encodeBase32,
  entryLabel,
  generateTotp,
  hotp,
  loadRememberedEntries,
  newEntryId,
  parseOtpauthUri,
  remainingSeconds,
  saveRememberedEntries,
} from './totp'
import type { TotpAlgorithm, TotpEntry } from './totp'

const enc = new TextEncoder()

// RFC 6238 Appendix B 官方 secret（ASCII 形态）：
// SHA1 → 20 字节 '12345678901234567890'；SHA256 → 32 字节（同模式延至 '2'）；
// SHA512 → 64 字节（同模式延至 '4'）。
const RFC_SECRET_SHA1 = enc.encode('12345678901234567890')
const RFC_SECRET_SHA256 = enc.encode('12345678901234567890123456789012')
const RFC_SECRET_SHA512 = enc.encode('1234567890123456789012345678901234567890123456789012345678901234')

/**
 * RFC 6238 Appendix B 官方向量（T 为 Unix 秒，步长 30s）。
 */
const RFC_VECTORS: Array<{
  name: string
  secret: Uint8Array
  algorithm: TotpAlgorithm
  unixSeconds: number
  code8: string
}> = [
  { name: 'SHA1 T=59', secret: RFC_SECRET_SHA1, algorithm: 'SHA1', unixSeconds: 59, code8: '94287082' },
  { name: 'SHA1 T=1111111109', secret: RFC_SECRET_SHA1, algorithm: 'SHA1', unixSeconds: 1111111109, code8: '07081804' },
  { name: 'SHA1 T=1111111111', secret: RFC_SECRET_SHA1, algorithm: 'SHA1', unixSeconds: 1111111111, code8: '14050471' },
  { name: 'SHA1 T=1234567890', secret: RFC_SECRET_SHA1, algorithm: 'SHA1', unixSeconds: 1234567890, code8: '89005924' },
  { name: 'SHA1 T=2000000000', secret: RFC_SECRET_SHA1, algorithm: 'SHA1', unixSeconds: 2000000000, code8: '69279037' },
  { name: 'SHA1 T=20000000000', secret: RFC_SECRET_SHA1, algorithm: 'SHA1', unixSeconds: 20000000000, code8: '65353130' },
  { name: 'SHA256 T=59', secret: RFC_SECRET_SHA256, algorithm: 'SHA256', unixSeconds: 59, code8: '46119246' },
  { name: 'SHA256 T=1111111109', secret: RFC_SECRET_SHA256, algorithm: 'SHA256', unixSeconds: 1111111109, code8: '68084774' },
  { name: 'SHA512 T=59', secret: RFC_SECRET_SHA512, algorithm: 'SHA512', unixSeconds: 59, code8: '90693936' },
  { name: 'SHA512 T=1111111109', secret: RFC_SECRET_SHA512, algorithm: 'SHA512', unixSeconds: 1111111109, code8: '25091201' },
]

describe('RFC 6238 附录 B 官方测试向量（验收 1）', () => {
  for (const v of RFC_VECTORS) {
    it(`${v.name} → 8 位码 ${v.code8}`, async () => {
      const code = await generateTotp({
        secretBytes: v.secret,
        unixSeconds: v.unixSeconds,
        algorithm: v.algorithm,
        digits: 8,
        period: 30,
      })
      expect(code).toBe(v.code8)
    })
  }

  it('6 位口径 = 8 位码后 6 位（SHA1 T=59 → 287082）', async () => {
    const code6 = await generateTotp({ secretBytes: RFC_SECRET_SHA1, unixSeconds: 59, digits: 6 })
    expect(code6).toBe('287082')
    expect(code6).toBe('94287082'.slice(-6))
  })
})

describe('base32 容错解码（验收 2）', () => {
  it('含空格 / 连字符 / 小写 / 缺 padding 的粘贴均正确解码', () => {
    const expected = enc.encode('12345678901234567890')
    const canonical = encodeBase32(expected) // GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    expect(canonical).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')

    expect(decodeBase32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toMatchObject({ ok: true })
    expect(decodeBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq').bytes).toEqual(expected)
    expect(decodeBase32('GEZD-GNBV-GY3T-QOJQ-GEZD-GNBV-GY3T-QOJQ').bytes).toEqual(expected)
    expect(decodeBase32(canonical.toLowerCase()).bytes).toEqual(expected)
    // 缺省 padding 与带 padding 等价
    expect(decodeBase32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ=====')).toMatchObject({ ok: true })
  })

  it('解码结果直接产出 RFC 向量码（base32 → TOTP 全链路）', async () => {
    const decoded = decodeBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')
    const code = await generateTotp({ secretBytes: decoded.bytes, unixSeconds: 59, digits: 8 })
    expect(code).toBe('94287082')
  })

  it('非法字符定位报错（0/1 不在 RFC 4648 字母表）', () => {
    const result = decodeBase32('GEZD1GNBV0')
    expect(result.ok).toBe(false)
    expect(result.invalidChars).toEqual(['1', '0'])
  })
})

describe('otpauth:// URI 整段解析（验收 3）', () => {
  it('query issuer 优先、label 前缀兜底，algorithm/digits/period 全参数带入', () => {
    const parsed = parseOtpauthUri(
      'otpauth://totp/GitHub:me%40example.com?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub&algorithm=SHA256&digits=8&period=60',
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params).toEqual({
      issuer: 'GitHub',
      account: 'me@example.com',
      secret: 'GEZDGNBVGY3TQOJQ',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
    })
  })

  it('仅 query issuer 写法（label 无前缀）同样带入', () => {
    const parsed = parseOtpauthUri('otpauth://totp/me@example.com?secret=GEZDGNBVGY3TQOJQ&issuer=MyCorp')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params.issuer).toBe('MyCorp')
    expect(parsed.params.account).toBe('me@example.com')
  })

  it('仅 label 前缀 issuer 写法（无 query issuer）同样带入', () => {
    const parsed = parseOtpauthUri('otpauth://totp/My%20Corp:alice?secret=GEZDGNBVGY3TQOJQ')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params.issuer).toBe('My Corp')
    expect(parsed.params.account).toBe('alice')
  })

  it('缺省参数取默认 SHA1/6 位/30 秒；密钥粘贴容错同样适用于 URI 内 secret', () => {
    const parsed = parseOtpauthUri('otpauth://totp/a:b?secret=gezd-gnbv-gy3t-qojq')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params.algorithm).toBe(DEFAULT_ALGORITHM)
    expect(parsed.params.digits).toBe(DEFAULT_DIGITS)
    expect(parsed.params.period).toBe(DEFAULT_PERIOD)
    expect(parsed.params.secret).toBe('GEZDGNBVGY3TQOJQ')
  })

  it('坏 URI 整条报错：非 otpauth 协议 / 缺 secret / secret 非法 / 参数非法', () => {
    expect(parseOtpauthUri('https://totp/abc?secret=GEZDGNBVGY3TQOJQ')).toMatchObject({ ok: false, reason: 'not-otpauth' })
    expect(parseOtpauthUri('otpauth://totp/a:b')).toMatchObject({ ok: false, reason: 'no-secret' })
    expect(parseOtpauthUri('otpauth://totp/a:b?secret=GEZD1')).toMatchObject({ ok: false, reason: 'invalid-secret' })
    expect(parseOtpauthUri('otpauth://totp/a:b?secret=GEZDGNBVGY3TQOJQ&algorithm=MD5')).toMatchObject({ ok: false, reason: 'invalid-params' })
    expect(parseOtpauthUri('otpauth://totp/a:b?secret=GEZDGNBVGY3TQOJQ&digits=7')).toMatchObject({ ok: false, reason: 'invalid-params' })
    expect(parseOtpauthUri('otpauth://totp/a:b?secret=GEZDGNBVGY3TQOJQ&period=45')).toMatchObject({ ok: false, reason: 'invalid-params' })
  })

  it('buildOtpauthUri 构造后可回环解析（迁移到 QR 工具前自校验）', () => {
    const uri = buildOtpauthUri({
      issuer: 'GitHub',
      account: 'me@example.com',
      secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      algorithm: 'SHA512',
      digits: 8,
      period: 30,
    })
    const parsed = parseOtpauthUri(uri)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.params.issuer).toBe('GitHub')
    expect(parsed.params.account).toBe('me@example.com')
    expect(parsed.params.algorithm).toBe('SHA512')
    expect(parsed.params.digits).toBe(8)
    expect(parsed.params.secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })
})

describe('轮换边界与周期口径（验收 4 的逻辑层）', () => {
  it('周期边界瞬间换码：counter 在 T=60 从 1 跳到 2', () => {
    expect(counterAt(59, 30)).toBe(1)
    expect(counterAt(60, 30)).toBe(2)
    expect(counterAt(0, 30)).toBe(0)
  })

  it('剩余秒数与真实周期一致（30 与 60 两档）', () => {
    expect(remainingSeconds(59, 30)).toBe(1)
    expect(remainingSeconds(60, 30)).toBe(30)
    expect(remainingSeconds(0, 60)).toBe(60)
    expect(remainingSeconds(59, 60)).toBe(1)
    expect(remainingSeconds(89, 60)).toBe(31)
  })

  it('边界两侧码值与对应 counter 的 HOTP 一致（换码正确性）', async () => {
    const before = await generateTotp({ secretBytes: RFC_SECRET_SHA1, unixSeconds: 59, digits: 8 })
    const after = await generateTotp({ secretBytes: RFC_SECRET_SHA1, unixSeconds: 60, digits: 8 })
    expect(before).toBe('94287082') // counter 1 = RFC T=59 向量
    expect(after).toBe(await hotp(RFC_SECRET_SHA1, 2, 'SHA1', 8)) // counter 2
    expect(after).not.toBe(before)
  })

  it('下一窗口码与下一周期计算一致', async () => {
    const counter = counterAt(1000, 30)
    const next = await generateTotp({ secretBytes: RFC_SECRET_SHA1, unixSeconds: (counter + 1) * 30, digits: 6 })
    expect(next).toBe(await hotp(RFC_SECRET_SHA1, counter + 1, 'SHA1', 6))
  })
})

describe('参数变更立即重算（验收 5 的逻辑层）', () => {
  it('位数变更即时生效：6 位 = 8 位后缀', async () => {
    const code8 = await generateTotp({ secretBytes: RFC_SECRET_SHA1, unixSeconds: 59, digits: 8 })
    const code6 = await generateTotp({ secretBytes: RFC_SECRET_SHA1, unixSeconds: 59, digits: 6 })
    expect(code6).toBe(code8.slice(-6))
  })

  it('算法变更即时生效：同时刻三算法码值与 RFC 各自向量一致', async () => {
    const sha1 = await generateTotp({ secretBytes: RFC_SECRET_SHA1, unixSeconds: 59, algorithm: 'SHA1', digits: 8 })
    const sha256 = await generateTotp({ secretBytes: RFC_SECRET_SHA256, unixSeconds: 59, algorithm: 'SHA256', digits: 8 })
    const sha512 = await generateTotp({ secretBytes: RFC_SECRET_SHA512, unixSeconds: 59, algorithm: 'SHA512', digits: 8 })
    expect(sha1).toBe('94287082')
    expect(sha256).toBe('46119246')
    expect(sha512).toBe('90693936')
  })

  it('周期变更即时生效：同时刻 30s 与 60s 落在不同 counter', () => {
    expect(counterAt(45, 30)).toBe(1)
    expect(counterAt(45, 60)).toBe(0)
  })

  it('参数面支持集：算法三种 / 位数 6、8 / 周期 30、60', () => {
    expect(ALGORITHMS).toEqual(['SHA1', 'SHA256', 'SHA512'])
    expect(DEFAULT_ALGORITHM).toBe('SHA1')
    expect(DEFAULT_DIGITS).toBe(6)
    expect(DEFAULT_PERIOD).toBe(30)
  })
})

describe('记住条目 opt-in 持久化（验收 6）', () => {
  const entryOf = (overrides: Partial<TotpEntry>): TotpEntry => ({
    id: newEntryId(),
    issuer: 'GitHub',
    account: 'me@example.com',
    secret: 'GEZDGNBVGY3TQOJQ',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    remember: false,
    ...overrides,
  })

  it('仅 remember=true 条目入库；刷新（重新 load）后仍在', () => {
    const remembered = entryOf({ account: 'kept@example.com', remember: true })
    const sessionOnly = entryOf({ account: 'gone@example.com', remember: false })
    saveRememberedEntries([remembered, sessionOnly])
    const loaded = loadRememberedEntries()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({ account: 'kept@example.com', remember: true, issuer: 'GitHub' })
  })

  it('取消 opt-in 后条目不再入库', () => {
    const entry = entryOf({ remember: true })
    saveRememberedEntries([entry])
    expect(loadRememberedEntries()).toHaveLength(1)
    saveRememberedEntries([entryOf({ id: entry.id, remember: false })])
    expect(loadRememberedEntries()).toHaveLength(0)
  })

  it('清除全部 → 空且不再加载', () => {
    saveRememberedEntries([entryOf({ remember: true }), entryOf({ remember: true })])
    expect(loadRememberedEntries()).toHaveLength(2)
    clearRememberedEntries()
    expect(loadRememberedEntries()).toHaveLength(0)
  })

  it('未 opt-in 条目不入库（刷新即失）', () => {
    saveRememberedEntries([entryOf({ remember: false })])
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]')
    expect(loadRememberedEntries()).toHaveLength(0)
  })

  it('坏数据（非 JSON / 非数组 / 缺 secret）一律丢弃不抛错', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(loadRememberedEntries()).toEqual([])
    localStorage.setItem(STORAGE_KEY, '{"a":1}')
    expect(loadRememberedEntries()).toEqual([])
    localStorage.setItem(STORAGE_KEY, '[{"account":"x"}]')
    expect(loadRememberedEntries()).toEqual([])
  })
})

describe('条目标识与工具杂项', () => {
  it('条目按 issuer + 账户名标识；无 issuer 时仅账户名', () => {
    expect(entryLabel({ issuer: 'GitHub', account: 'me@example.com' })).toBe('GitHub · me@example.com')
    expect(entryLabel({ issuer: '', account: 'me@example.com' })).toBe('me@example.com')
    expect(entryLabel({ issuer: 'Solo', account: '' })).toBe('Solo')
  })

  it('条目 id 随机且不重复', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newEntryId()))
    expect(ids.size).toBe(50)
  })
})
