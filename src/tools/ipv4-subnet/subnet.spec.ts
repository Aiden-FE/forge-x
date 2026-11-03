import { describe, expect, it } from 'vitest'
import {
  SPLIT_ROW_LIMIT,
  analyze,
  classifyNetwork,
  computeSubnet,
  equalSplit,
  formatBinaryIp,
  formatCidr,
  formatIp,
  parseDottedMask,
  parseDottedQuad,
  parsePrefix,
  parseSubnetInput,
} from './subnet'
import type { SubnetError, SubnetInfo } from './subnet'
import subnetLocale from '@/locales/tools/ipv4-subnet'

function makeTranslator(lang: 'zh-CN' | 'en') {
  const part = subnetLocale[lang] as Record<string, unknown>
  return (key: string, params?: Record<string, string>): string => {
    let node: unknown = part
    for (const p of key.split('.')) {
      if (typeof node !== 'object' || node === null) return key
      node = (node as Record<string, unknown>)[p]
    }
    if (typeof node !== 'string') return key
    if (!params) return node
    return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? `{{${name}}}`)
  }
}

const zh = makeTranslator('zh-CN')

function okInfo(input: string): SubnetInfo {
  const r = analyze(input)
  if (r.status !== 'ok' || !('info' in r)) throw new Error(`expected ok for ${input}, got ${JSON.stringify(r)}`)
  return r.info
}

function errOf(input: string): SubnetError {
  const r = analyze(input)
  if (r.status !== 'error') throw new Error(`expected error for ${input}`)
  return r.error
}

describe('格式化辅助', () => {
  it('点分 / CIDR / 二进制行', () => {
    expect(formatIp(0x0a000000)).toBe('10.0.0.0')
    expect(formatCidr(0x0a000000, 8)).toBe('10.0.0.0/8')
    // 255.255.255.192
    expect(formatBinaryIp(0xffffffc0)).toBe('11111111.11111111.11111111.11000000')
    expect(formatBinaryIp(0x0a0a0a0a)).toBe('00001010.00001010.00001010.00001010')
  })
})

describe('验收 #1：基础数学（10.0.0.0/8 与 192.168.1.77/26 归一化）', () => {
  it('10.0.0.0/8 → 网络/广播/掩码/通配/范围/主机数全对', () => {
    const info = okInfo('10.0.0.0/8')
    expect(formatIp(info.networkU32)).toBe('10.0.0.0')
    expect(formatIp(info.broadcastU32!)).toBe('10.255.255.255')
    expect(formatIp(info.maskU32)).toBe('255.0.0.0')
    expect(formatIp(info.wildcardU32)).toBe('0.255.255.255')
    expect(formatIp(info.firstHostU32!)).toBe('10.0.0.1')
    expect(formatIp(info.lastHostU32!)).toBe('10.255.255.254')
    expect(info.usable).toBe(16777214)
    expect(info.total).toBe(16777216)
    expect(info.isHostAddress).toBe(false)
    expect(info.class).toBe('A')
    expect(info.label).toBe('private')
  })

  it('192.168.1.77/26 归一化 192.168.1.64/26 + 主机标注', () => {
    const info = okInfo('192.168.1.77/26')
    expect(formatIp(info.networkU32)).toBe('192.168.1.64')
    expect(info.prefix).toBe(26)
    expect(info.isHostAddress).toBe(true)
    expect(formatIp(info.broadcastU32!)).toBe('192.168.1.127')
    expect(formatIp(info.maskU32)).toBe('255.255.255.192')
    expect(formatIp(info.wildcardU32)).toBe('0.0.0.63')
    expect(formatIp(info.firstHostU32!)).toBe('192.168.1.65')
    expect(formatIp(info.lastHostU32!)).toBe('192.168.1.126')
    expect(info.usable).toBe(62)
    expect(info.class).toBe('C')
    expect(info.label).toBe('private')
  })

  it('网络地址本身不算主机地址；主机位非零才标注', () => {
    expect(okInfo('10.0.0.0/8').isHostAddress).toBe(false)
    expect(okInfo('10.0.0.1/8').isHostAddress).toBe(true)
  })
})

describe('验收 #2：特例口径（/31 RFC 3021、/32、/0）', () => {
  it('/31：2 个地址、无广播、可用 2（RFC 3021）', () => {
    const info = okInfo('10.0.0.0/31')
    expect(info.broadcastU32).toBeNull()
    expect(info.usable).toBe(2)
    expect(info.total).toBe(2)
    expect(formatIp(info.firstHostU32!)).toBe('10.0.0.0')
    expect(formatIp(info.lastHostU32!)).toBe('10.0.0.1')
  })

  it('/32：单主机，无范围/广播语义', () => {
    const info = okInfo('10.0.0.5/32')
    expect(info.broadcastU32).toBeNull()
    expect(info.firstHostU32).toBeNull()
    expect(info.lastHostU32).toBeNull()
    expect(info.usable).toBe(1)
    expect(info.total).toBe(1)
    expect(info.isHostAddress).toBe(false)
  })

  it('/0：42.9 亿不截断（4,294,967,296 总数 / 4,294,967,294 可用）', () => {
    const info = okInfo('0.0.0.0/0')
    expect(info.total).toBe(4294967296)
    expect(info.usable).toBe(4294967294)
    expect(formatIp(info.networkU32)).toBe('0.0.0.0')
    expect(formatIp(info.broadcastU32!)).toBe('255.255.255.255')
    expect(formatIp(info.firstHostU32!)).toBe('0.0.0.1')
    expect(formatIp(info.lastHostU32!)).toBe('255.255.255.254')
  })
})

describe('验收 #3：五类判定与类别 A–E', () => {
  it('私网 / 环回 / 链路本地 / 组播 / 公网标签正确', () => {
    const privateNet = okInfo('192.168.1.0/24')
    expect(privateNet.label).toBe('private')
    expect(privateNet.class).toBe('C')

    const loopback = okInfo('127.0.0.1/32')
    expect(loopback.label).toBe('loopback')
    expect(loopback.class).toBe('A')

    const linklocal = okInfo('169.254.1.1/32')
    expect(linklocal.label).toBe('linklocal')
    expect(linklocal.class).toBe('B')

    const multicast = okInfo('224.0.0.1')
    expect(multicast.label).toBe('multicast')
    expect(multicast.class).toBe('D')

    const publicNet = okInfo('8.8.8.8')
    expect(publicNet.label).toBe('public')
    expect(publicNet.class).toBe('A')
  })

  it('RFC 1918 三段与 240/4 保留段', () => {
    expect(classifyNetwork(0x0a000000)).toBe('private') // 10/8
    expect(classifyNetwork(0xac100001)).toBe('private') // 172.16.0.1
    expect(classifyNetwork(0xac1f0001)).toBe('private') // 172.31.0.1
    expect(classifyNetwork(0xac200001)).toBe('public') // 172.32.0.1 出私网
    expect(classifyNetwork(0xc0a80001)).toBe('private') // 192.168.0.1
    expect(classifyNetwork(0xf0000001)).toBe('reserved') // 240.0.0.1
    const reserved = okInfo('240.0.0.1')
    expect(reserved.class).toBe('E')
    expect(reserved.label).toBe('reserved')
  })
})

describe('验收 #4：错误定位到段', () => {
  it('IP 段 >255 定位到第 4 段', () => {
    const err = errOf('10.0.0.256/24')
    expect(err.kind).toBe('octetRange')
    expect(err.segment).toBe('octet4')
    expect(zh('ipv4Subnet.errOctetRange', { index: '4', value: '256' })).toBe('第 4 段「256」超出 0–255')
  })

  it('前缀 >32 定位到前缀', () => {
    const err = errOf('10.0.0.0/33')
    expect(err.kind).toBe('prefixRange')
    expect(err.segment).toBe('prefix')
  })

  it('前缀非数字', () => {
    expect(errOf('10.0.0.0/abc').kind).toBe('prefixFormat')
  })

  it('非连续掩码 255.0.255.0 明确报错', () => {
    const err = errOf('10.0.0.0 255.0.255.0')
    expect(err.kind).toBe('maskContiguous')
    expect(err.segment).toBe('mask')
    expect(zh('ipv4Subnet.errMaskContiguous', { value: '255.0.255.0' })).toContain('不连续')
  })

  it('掩码段非法', () => {
    const err = errOf('10.0.0.0 abc.0.0.0')
    expect(err.kind).toBe('maskFormat')
    expect(err.segment).toBe('mask')
  })

  it('IP 段非数字定位到第 3 段', () => {
    const err = errOf('10.0.x.1/24')
    expect(err.kind).toBe('octetFormat')
    expect(err.segment).toBe('octet3')
  })

  it('三段以上输入报字段数', () => {
    const err = errOf('10.0.0.0 255.0.0.0 extra')
    expect(err.kind).toBe('fieldCount')
  })

  it('点分掩码形态正常解析（空格分隔）', () => {
    const info = okInfo('10.0.0.0 255.255.255.0')
    expect(info.prefix).toBe(24)
    expect(formatIp(info.networkU32)).toBe('10.0.0.0')
  })

  it('parseDottedQuad / parsePrefix / parseDottedMask 独立可用', () => {
    expect(parseDottedQuad('10.0.0.1')).toEqual({ ok: true, u32: 0x0a000001 })
    expect(parsePrefix('26')).toEqual({ ok: true, prefix: 26 })
    expect(parseDottedMask('255.255.255.192')).toEqual({ ok: true, prefix: 26, maskU32: 0xffffffc0 })
    expect(parseDottedMask('0.0.0.0')).toEqual({ ok: true, prefix: 0, maskU32: 0 })
  })
})

describe('验收 #5：等分切分（无缝隙无重叠恰好覆盖父网）', () => {
  it('10.0.0.0/24 切 4 → 四个 /26，首尾相接恰好覆盖父网（程序断言）', () => {
    const parent = okInfo('10.0.0.0/24')
    const res = equalSplit(parent.networkU32, parent.prefix, { count: 4 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.newPrefix).toBe(26)
    expect(res.rows.map((r) => r.cidr)).toEqual([
      '10.0.0.0/26',
      '10.0.0.64/26',
      '10.0.0.128/26',
      '10.0.0.192/26',
    ])
    // 无缝隙无重叠：前一行广播地址 + 1 = 后一行网络地址；首行 = 父网络；末行广播 = 父广播
    for (let i = 1; i < res.rows.length; i++) {
      const prev = computeSubnet(res.rows[i - 1]!.networkU32, 26)
      expect(res.rows[i]!.networkU32).toBe((prev.broadcastU32! + 1) >>> 0)
    }
    expect(res.rows[0]!.networkU32).toBe(parent.networkU32)
    const last = computeSubnet(res.rows[res.rows.length - 1]!.networkU32, 26)
    expect(last.broadcastU32).toBe(parent.broadcastU32)
    // 可用数 62
    expect(res.rows.every((r) => r.usable === 62)).toBe(true)
  })

  it('行数上限 1024：/20 切 1024 可行，/23 切 1024 超前缀报错', () => {
    const p20 = okInfo('10.0.0.0/20')
    const res20 = equalSplit(p20.networkU32, p20.prefix, { count: 1024 })
    expect(res20.ok).toBe(true)
    if (res20.ok) expect(res20.rows).toHaveLength(1024)

    const p23 = okInfo('10.0.0.0/23')
    const res23 = equalSplit(p23.networkU32, p23.prefix, { count: 1024 })
    expect(res23.ok).toBe(false)
    if (!res23.ok) expect(res23.reason).toBe('tooManySubnets')

    // 前缀步进口径：/10 → /32 需要 2^22 行 > 1024，报超限
    const p10 = okInfo('10.0.0.0/10')
    const res10 = equalSplit(p10.networkU32, p10.prefix, { newPrefix: 32 })
    expect(res10.ok).toBe(false)
    if (!res10.ok) expect(res10.reason).toBe('tooManySubnets')
    expect(SPLIT_ROW_LIMIT).toBe(1024)
  })

  it('非 2 的幂与非法目标拒绝', () => {
    const parent = okInfo('10.0.0.0/24')
    expect(equalSplit(parent.networkU32, parent.prefix, { count: 3 }).ok).toBe(false)
    expect(equalSplit(parent.networkU32, parent.prefix, { count: 1 }).ok).toBe(false)
    expect(equalSplit(parent.networkU32, parent.prefix, { newPrefix: 24 }).ok).toBe(false)
    expect(equalSplit(parent.networkU32, parent.prefix, { newPrefix: 21 }).ok).toBe(false)
  })

  it('切到 /31 与 /32 的特例行仍符合 RFC 3021 / 单主机口径', () => {
    const parent = okInfo('10.0.0.0/30')
    const res = equalSplit(parent.networkU32, parent.prefix, { count: 2 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.rows[0]!.cidr).toBe('10.0.0.0/31')
    expect(res.rows[0]!.usable).toBe(2)
    expect(res.rows[0]!.firstU32).not.toBeNull()

    const res32 = equalSplit(okInfo('10.0.0.0/31').networkU32, 31, { count: 2 })
    expect(res32.ok).toBe(true)
    if (!res32.ok) return
    expect(res32.rows.map((r) => r.cidr)).toEqual(['10.0.0.0/32', '10.0.0.1/32'])
    expect(res32.rows.every((r) => r.usable === 1 && r.firstU32 === null)).toBe(true)
  })
})

describe('验收 #6：点分掩码与等价前缀互通', () => {
  it('255.255.255.192 ↔ /26 全量等价', () => {
    const viaCidr = okInfo('10.0.0.0/26')
    const viaMask = okInfo('10.0.0.0 255.255.255.192')
    expect(viaMask.prefix).toBe(26)
    expect(formatIp(viaMask.networkU32)).toBe(formatIp(viaCidr.networkU32))
    expect(formatIp(viaMask.broadcastU32!)).toBe(formatIp(viaCidr.broadcastU32!))
    expect(formatIp(viaMask.maskU32)).toBe(formatIp(viaCidr.maskU32))
    expect(formatIp(viaMask.wildcardU32)).toBe(formatIp(viaCidr.wildcardU32))
    expect(formatIp(viaMask.firstHostU32!)).toBe(formatIp(viaCidr.firstHostU32!))
    expect(formatIp(viaMask.lastHostU32!)).toBe(formatIp(viaCidr.lastHostU32!))
    expect(viaMask.usable).toBe(viaCidr.usable)
  })

  it('裸 IP 自动补 /32（主机地址视角）', () => {
    const info = okInfo('8.8.8.8')
    expect(info.prefix).toBe(32)
    expect(formatIp(info.networkU32)).toBe('8.8.8.8')
    expect(info.usable).toBe(1)
  })

  it('空输入返回 empty（界面隐藏结果）', () => {
    expect(parseSubnetInput('   ').status).toBe('empty')
  })
})
