import { describe, expect, it } from 'vitest'
import {
  IPV6_SPLIT_COUNT_OPTIONS,
  IPV6_SPLIT_ROW_LIMIT,
  analyzeIpv6,
  classifyIpv6,
  computeIpv6Subnet,
  equalSplitIpv6,
  formatBigInt,
  formatBinaryIpv6,
  formatIpv6,
  parseIpv6Address,
  parseIpv6Input,
  parseIpv6Prefix,
} from './ipv6'
import type { Ipv6Error, Ipv6Info } from './ipv6'
import ipv6Locale from '@/locales/tools/ipv6-subnet'

function makeTranslator(lang: 'zh-CN' | 'en') {
  const part = ipv6Locale[lang] as Record<string, unknown>
  return (key: string, params?: Record<string, string>): string => {
    let node: unknown = part
    for (const p of key.split('.')) {
      if (typeof node !== 'object' || node === null) return key
      node = (node as Record<string, unknown>)[p]
    }
    if (typeof node !== 'string') return node === undefined ? key : JSON.stringify(node)
    if (!params) return node
    return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? `{{${name}}}`)
  }
}

const zh = makeTranslator('zh-CN')

function okInfo(input: string): Ipv6Info {
  const r = analyzeIpv6(input)
  if (r.status !== 'ok' || !('info' in r)) throw new Error(`expected ok for ${input}, got ${JSON.stringify(r)}`)
  return r.info
}

function errOf(input: string): Ipv6Error {
  const r = analyzeIpv6(input)
  if (r.status !== 'error') throw new Error(`expected error for ${input}`)
  return r.error
}

describe('验收 #1：RFC 5952 归一化断言集', () => {
  it('全零 → `::`；::1 压缩', () => {
    expect(formatIpv6(0n)).toBe('::')
    expect(formatIpv6(1n)).toBe('::1')
    const r = parseIpv6Address('0:0:0:0:0:0:0:1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(formatIpv6(r.value)).toBe('::1')
  })

  it('等长零串取先（RFC 5952 4.2.2）', () => {
    // 两组 2 连零：压缩第一处
    expect(formatIpv6(okInfo('2001:db8:0:0:1:0:0:1/128').network)).toBe('2001:db8::1:0:0:1')
    // 更长零串（3 连零）优先于先出现的 2 连零
    expect(formatIpv6(okInfo('2001:0:0:1:0:0:0:1/128').network)).toBe('2001:0:0:1::1')
  })

  it('小写 + 去前导零', () => {
    expect(formatIpv6(okInfo('2001:DB8::ABCD/128').network)).toBe('2001:db8::abcd')
    expect(formatIpv6(okInfo('2001:0db8:0000:0000:0000:0000:0000:0001/128').network)).toBe('2001:db8::1')
    expect(formatIpv6(okInfo('00ff::1/128').network)).toBe('ff::1')
  })

  it('单一零组不压缩（`::` 须 ≥ 2 组）', () => {
    expect(formatIpv6(okInfo('2001:db8:0:1:1:1:1:1/128').network)).toBe('2001:db8:0:1:1:1:1:1')
  })

  it('IPv4-mapped 统一：不保留尾段写法，收且归一', () => {
    expect(formatIpv6(okInfo('::ffff:1.2.3.4/128').network)).toBe('::ffff:102:304')
    expect(formatIpv6(okInfo('64:ff9b::1.2.3.4/128').network)).toBe('64:ff9b::102:304')
    expect(formatIpv6(okInfo('::1.2.3.4/128').network)).toBe('::102:304')
    // 完整写法等价（6 组 + 尾段）
    expect(formatIpv6(okInfo('0:0:0:0:0:ffff:1.2.3.4/128').network)).toBe('::ffff:102:304')
  })

  it('无零串不压缩：全 1 地址', () => {
    expect(formatIpv6(okInfo('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128').network)).toBe(
      'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    )
  })
})

describe('验收 #2：输入归一化（addr/prefix、裸地址、主机位标注、无掩码形态）', () => {
  it('裸地址自动补 /128（主机地址视角）', () => {
    const r = parseIpv6Input('2001:db8::1')
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.prefix).toBe(128)
      expect(formatIpv6(r.value)).toBe('2001:db8::1')
      expect(r.isHostAddress).toBe(false)
    }
  })

  it('主机位非零 → 归一化到网络地址并标注', () => {
    const info = okInfo('2001:db8::1/64')
    expect(formatIpv6(info.network)).toBe('2001:db8::')
    expect(info.prefix).toBe(64)
    expect(info.isHostAddress).toBe(true)
    expect(okInfo('2001:db8::/64').isHostAddress).toBe(false)
  })

  it('压缩 / 展开 / 混写互通', () => {
    const compressed = okInfo('2001:db8::1/64')
    const expanded = okInfo('2001:0db8:0000:0000:0000:0000:0000:0001/64')
    expect(formatIpv6(compressed.network)).toBe(formatIpv6(expanded.network))
  })

  it('空输入返回 empty（界面隐藏结果）', () => {
    expect(parseIpv6Input('   ').status).toBe('empty')
  })

  it('parseIpv6Address / parseIpv6Prefix 独立可用', () => {
    expect(parseIpv6Address('::')).toEqual({ ok: true, value: 0n })
    expect(parseIpv6Address('::1')).toEqual({ ok: true, value: 1n })
    expect(parseIpv6Prefix('64')).toEqual({ ok: true, value: 64 })
    expect(parseIpv6Prefix('129').ok).toBe(false)
  })
})

describe('验收 #3：/0、/64、/127、/128、/65（跨 16 位组边界）计算断言', () => {
  it('/0：总容量 2^128 BigInt 千分位、首末为全空间端点', () => {
    const info = okInfo('::/0')
    expect(info.total).toBe(340282366920938463463374607431768211456n)
    expect(formatBigInt(info.total)).toBe('340,282,366,920,938,463,463,374,607,431,768,211,456')
    expect(formatIpv6(info.first)).toBe('::')
    expect(formatIpv6(info.last)).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')
  })

  it('/64：2^64 无扣减（无 IPv4 式 usable-2 语义）', () => {
    const info = okInfo('2001:db8::/64')
    expect(info.total).toBe(18446744073709551616n)
    expect(formatBigInt(info.total)).toBe('18,446,744,073,709,551,616')
    expect(formatIpv6(info.first)).toBe('2001:db8::')
    expect(formatIpv6(info.last)).toBe('2001:db8::ffff:ffff:ffff:ffff')
  })

  it('/127：2 个地址、首末即两端点（RFC 6164 仅注记不特判）', () => {
    const info = okInfo('2001:db8::1/127')
    expect(formatIpv6(info.network)).toBe('2001:db8::')
    expect(info.total).toBe(2n)
    expect(formatIpv6(info.first)).toBe('2001:db8::')
    expect(formatIpv6(info.last)).toBe('2001:db8::1')
    expect(info.isHostAddress).toBe(true)
  })

  it('/128：单地址', () => {
    const info = okInfo('2001:db8::1/128')
    expect(info.total).toBe(1n)
    expect(formatIpv6(info.first)).toBe('2001:db8::1')
    expect(formatIpv6(info.last)).toBe('2001:db8::1')
    expect(info.isHostAddress).toBe(false)
  })

  it('/65：跨 16 位组边界（4 整组 + 1 位；余 15 位 + 3 组）', () => {
    const info = okInfo('2001:db8:1234:5678:8000::/65')
    expect(formatIpv6(info.network)).toBe('2001:db8:1234:5678:8000::')
    expect(info.total).toBe(9223372036854775808n)
    expect(formatBigInt(info.total)).toBe('9,223,372,036,854,775,808')
    expect(formatIpv6(info.last)).toBe('2001:db8:1234:5678:ffff:ffff:ffff:ffff')

    // 主机位跨越组边界归一化：第 128 位置 1 仍是 /65 主机位
    const host = okInfo('2001:db8:1234:5678:8001::/65')
    expect(formatIpv6(host.network)).toBe('2001:db8:1234:5678:8000::')
    expect(host.isHostAddress).toBe(true)
  })

  it('二进制行：16 位 × 8 组点分', () => {
    expect(formatBinaryIpv6(1n)).toBe(`${'0000000000000000.'.repeat(7)}0000000000000001`)
    const info = okInfo('2001:db8::/32')
    expect(formatBinaryIpv6(info.network)).toBe(
      '0010000000000001.0000110110111000.' + '0000000000000000.'.repeat(5) + '0000000000000000',
    )
  })

  it('computeIpv6Subnet 与 analyzeIpv6 一致（共用核心）', () => {
    const viaCompute = computeIpv6Subnet(0x20010db8000000000000000000000001n, 64)
    const viaAnalyze = okInfo('2001:db8::1/64')
    expect(formatIpv6(viaCompute.network)).toBe(formatIpv6(viaAnalyze.network))
    expect(viaCompute.total).toBe(viaAnalyze.total)
    expect(viaCompute.last).toBe(viaAnalyze.last)
    expect(viaCompute.scope).toBe(viaAnalyze.scope)
  })
})

describe('验收 #4：scope 六类判定 fixture', () => {
  it('六类各就位', () => {
    expect(okInfo('::1/128').scope).toBe('loopback')
    expect(okInfo('::/128').scope).toBe('unspecified')
    expect(okInfo('fe80::1/128').scope).toBe('linkLocal')
    expect(okInfo('febf::1/128').scope).toBe('linkLocal') // fe80::/10 上界
    expect(okInfo('fc00::/7').scope).toBe('ula')
    expect(okInfo('fd12:3456:789a::/64').scope).toBe('ula') // fd00::/8 归 fc00::/7
    expect(okInfo('ff02::1/128').scope).toBe('multicast')
    expect(okInfo('2001:db8::/32').scope).toBe('global')
    expect(okInfo('3fff:ffff::/32').scope).toBe('global') // 2000::/3 上界
  })

  it('六类之外如实标 other（IPv4-mapped、fec0 site-local 等）', () => {
    expect(okInfo('::ffff:1.2.3.4/128').scope).toBe('other')
    expect(okInfo('fec0::1/128').scope).toBe('other')
    expect(okInfo('64:ff9b::/96').scope).toBe('other')
  })

  it('按网络地址判定：::/0 网络地址为 :: → unspecified', () => {
    expect(okInfo('::/0').scope).toBe('unspecified')
  })

  it('classifyIpv6 独立可用', () => {
    expect(classifyIpv6(1n)).toBe('loopback')
    expect(classifyIpv6(0n)).toBe('unspecified')
    expect(classifyIpv6(0x40000000000000000000000000000000n)).toBe('other') // 4000::/3 之外
  })
})

describe('验收 #5：错误定位到段', () => {
  it('组 > ffff 定位到第 1 组', () => {
    const err = errOf('12345::')
    expect(err.kind).toBe('groupRange')
    expect(err.segment).toBe('group1')
    expect(zh('ipv6Subnet.errGroupRange', { index: '1', value: '12345' })).toBe('第 1 组「12345」超出 0000–ffff')
  })

  it('组含非十六进制字符定位到第 3 组', () => {
    const err = errOf('2001:db8:zzzz::')
    expect(err.kind).toBe('groupFormat')
    expect(err.segment).toBe('group3')
  })

  it('结构非法：组数不符 / 多个 :: / 纯 IPv4', () => {
    expect(errOf('1:2:3').kind).toBe('addrFormat')
    expect(errOf('1:2:3:4:5:6:7:8:9').kind).toBe('addrFormat')
    expect(errOf('1::2::3').kind).toBe('addrFormat')
    expect(errOf('1.2.3.4').kind).toBe('addrFormat')
  })

  it('IPv4 尾段非法', () => {
    const err = errOf('::ffff:1.2.3.400')
    expect(err.kind).toBe('v4tailFormat')
    expect(err.segment).toBe('v4tail')
  })

  it('前缀非数字 / 前缀 > 128', () => {
    expect(errOf('2001:db8::1/abc').kind).toBe('prefixFormat')
    const err = errOf('2001:db8::1/129')
    expect(err.kind).toBe('prefixRange')
    expect(err.segment).toBe('prefix')
    expect(zh('ipv6Subnet.errPrefixRange', { value: '129' })).toBe('前缀「129」超出 0–128')
  })

  it('多段输入报 fieldCount（IPv6 无点分掩码形态，文案明示）', () => {
    const err = errOf('2001:db8::1 ff00::')
    expect(err.kind).toBe('fieldCount')
    const msg = zh('ipv6Subnet.errFieldCount', { value: '2' })
    expect(msg).toContain('2')
    expect(msg).toContain('无点分掩码')
  })
})

describe('验收 #6：等分切分（无缝隙无重叠恰好覆盖父网，与 IPv4 同构）', () => {
  it('2001:db8::/32 切 4 → 四个 /34，首尾相接恰好覆盖父网（程序断言）', () => {
    const parent = okInfo('2001:db8::/32')
    const res = equalSplitIpv6(parent.network, parent.prefix, { count: 4 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.newPrefix).toBe(34)
    expect(res.rows.map((r) => r.cidr)).toEqual([
      '2001:db8::/34',
      '2001:db8:4000::/34',
      '2001:db8:8000::/34',
      '2001:db8:c000::/34',
    ])
    // 无缝隙无重叠：前一行末地址 + 1 = 后一行网络地址；首行 = 父网络；末行末 = 父末
    for (let i = 1; i < res.rows.length; i++) {
      expect(res.rows[i]!.network).toBe(res.rows[i - 1]!.last + 1n)
    }
    expect(res.rows[0]!.network).toBe(parent.network)
    expect(res.rows[res.rows.length - 1]!.last).toBe(parent.last)
    // 每行容量 2^94
    expect(res.rows.every((r) => r.total === 1n << 94n)).toBe(true)
  })

  it('行数上限 1024：/56 切 1024 可行，/32 → /43 超 1024 报超限', () => {
    const p56 = okInfo('2001:db8::/56')
    const res56 = equalSplitIpv6(p56.network, p56.prefix, { count: 1024 })
    expect(res56.ok).toBe(true)
    if (res56.ok) expect(res56.rows).toHaveLength(1024)

    const p32 = okInfo('2001:db8::/32')
    const res43 = equalSplitIpv6(p32.network, p32.prefix, { newPrefix: 43 })
    expect(res43.ok).toBe(false)
    if (!res43.ok) expect(res43.reason).toBe('tooManySubnets')

    const res128 = equalSplitIpv6(p32.network, p32.prefix, { newPrefix: 128 })
    expect(res128.ok).toBe(false)
    if (!res128.ok) expect(res128.reason).toBe('tooManySubnets')

    expect(IPV6_SPLIT_ROW_LIMIT).toBe(1024)
    expect(IPV6_SPLIT_COUNT_OPTIONS[IPV6_SPLIT_COUNT_OPTIONS.length - 1]).toBe(1024)
  })

  it('非 2 的幂与非法目标拒绝', () => {
    const parent = okInfo('2001:db8::/32')
    expect(equalSplitIpv6(parent.network, parent.prefix, { count: 3 }).ok).toBe(false)
    expect(equalSplitIpv6(parent.network, parent.prefix, { count: 1 }).ok).toBe(false)
    expect(equalSplitIpv6(parent.network, parent.prefix, { newPrefix: 32 }).ok).toBe(false)
    expect(equalSplitIpv6(parent.network, parent.prefix, { newPrefix: 31 }).ok).toBe(false)
  })

  it('切到 /128 仍是单地址口径（无特判语义）', () => {
    const parent = okInfo('2001:db8::/127')
    const res = equalSplitIpv6(parent.network, parent.prefix, { count: 2 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.rows.map((r) => r.cidr)).toEqual(['2001:db8::/128', '2001:db8::1/128'])
    expect(res.rows.every((r) => r.total === 1n && r.first === r.network && r.last === r.network)).toBe(true)
  })
})

describe('locale fragment：zh/en 键结构与文案', () => {
  it('zh 与 en 键路径一致（双语齐备）', () => {
    const paths = (obj: Record<string, unknown>, base = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? paths(v as Record<string, unknown>, `${base}${k}.`) : [`${base}${k}`],
      )
    const zhPart = ipv6Locale['zh-CN'] as Record<string, unknown>
    const enPart = ipv6Locale.en as Record<string, unknown>
    expect(paths(enPart)).toEqual(paths(zhPart))
  })

  it('工具名与描述键（tools.ipv6-subnet / Desc）', () => {
    expect(zh('tools.ipv6-subnet')).toBe('IPv6 子网计算')
    expect(zh('tools.ipv6-subnetDesc')).toBe('前缀解析、参数计算、scope 判定与等分切分')
  })

  it('口径说明与注记文案存在（无 broadcast 扣减、SLAAC、RFC 6164）', () => {
    expect(zh('ipv6Subnet.semanticNotice')).toContain('无 broadcast')
    expect(zh('ipv6Subnet.slaacNote')).toContain('SLAAC')
    expect(zh('ipv6Subnet.rfc6164Note')).toContain('RFC 6164')
  })
})
