import { describe, expect, it } from 'vitest'
import { analyzeRange, cidrsForRange, smallestContainingCidr } from './range'
import type { RangeCidrRow } from './range'
import { prefixToMask } from './subnet'
import subnetLocale from '@/locales/tools/ipv4-subnet'

function makeTranslator(lang: 'zh-CN' | 'en') {
  const part = subnetLocale[lang] as Record<string, unknown>
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

/** 精确覆盖程序断言：并集 = 区间、互不重叠、每条对齐自身前缀。 */
function expectExactCover(rows: RangeCidrRow[], startU32: number, endU32: number): void {
  expect(rows.length).toBeGreaterThan(0)
  // 首尾端点
  expect(rows[0]!.firstU32).toBe(startU32)
  expect(rows[rows.length - 1]!.lastU32).toBe(endU32)
  // 无缝隙无重叠：前一行末 + 1 = 后一行首
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i]!.firstU32).toBe((rows[i - 1]!.lastU32 + 1) >>> 0)
  }
  // 每条 CIDR 自洽：网络地址对齐前缀、尺寸 = 2^(32-p)、末 = 首 + 尺寸 - 1
  let sum = 0
  for (const r of rows) {
    const mask = prefixToMask(r.prefix)
    expect((r.networkU32 & mask) >>> 0).toBe(r.networkU32)
    expect(r.total).toBe(2 ** (32 - r.prefix))
    expect(r.lastU32).toBe((r.firstU32 + r.total - 1) >>> 0)
    sum += r.total
  }
  // 并集 = 区间：尺寸之和 = 原区间尺寸
  expect(sum).toBe(endU32 - startU32 + 1)
}

function ipToU32(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number)
  return (((a as number) * 256 + (b as number)) * 256 + (c as number)) * 256 + (d as number)
}

describe('验收 #1：it-tools 同款用例对照（192.168.1.10–192.168.2.20）', () => {
  it('最小包含 CIDR：192.168.0.0/22，原 267 → 包含 1024（it-tools 核验值）', () => {
    const r = analyzeRange('192.168.1.10', '192.168.2.20')
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.result.containing.cidr).toBe('192.168.0.0/22')
    expect(r.result.containing.firstU32).toBe(ipToU32('192.168.0.0'))
    expect(r.result.containing.lastU32).toBe(ipToU32('192.168.3.255'))
    expect(r.result.oldSize).toBe(267)
    expect(r.result.newSize).toBe(1024)
  })

  it('精确覆盖 9 条，贪心最大块序列固定', () => {
    const r = analyzeRange('192.168.1.10', '192.168.2.20')
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.result.rows.map((row) => row.cidr)).toEqual([
      '192.168.1.10/31',
      '192.168.1.12/30',
      '192.168.1.16/28',
      '192.168.1.32/27',
      '192.168.1.64/26',
      '192.168.1.128/25',
      '192.168.2.0/28',
      '192.168.2.16/30',
      '192.168.2.20/32',
    ])
    expectExactCover(r.result.rows, ipToU32('192.168.1.10'), ipToU32('192.168.2.20'))
  })
})

describe('验收 #2：精确覆盖断言（并集 = 区间、互不重叠）', () => {
  it('对齐边界区间 10.0.0.0–10.0.0.255 → 单条 /24', () => {
    const r = analyzeRange('10.0.0.0', '10.0.0.255')
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.result.rows.map((row) => row.cidr)).toEqual(['10.0.0.0/24'])
    expect(r.result.containing.cidr).toBe('10.0.0.0/24')
    expect(r.result.oldSize).toBe(256)
    expect(r.result.newSize).toBe(256)
  })

  it('10.0.0.5–10.0.0.6：两条 /32 覆盖，最小包含 10.0.0.4/30', () => {
    const r = analyzeRange('10.0.0.5', '10.0.0.6')
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.result.rows.map((row) => row.cidr)).toEqual(['10.0.0.5/32', '10.0.0.6/32'])
    expect(r.result.containing.cidr).toBe('10.0.0.4/30')
    expect(r.result.oldSize).toBe(2)
    expect(r.result.newSize).toBe(4)
    expectExactCover(r.result.rows, ipToU32('10.0.0.5'), ipToU32('10.0.0.6'))
  })

  it('随机区间程序断言（无缝无重叠、对齐、尺寸求和）', () => {
    const cases: Array<[string, string]> = [
      ['1.2.3.4', '1.2.3.4'],
      ['10.1.2.0', '10.1.3.255'],
      ['172.16.5.9', '172.16.9.200'],
      ['0.0.0.3', '0.0.0.200'],
      ['192.168.255.254', '192.169.0.1'],
    ]
    for (const [start, end] of cases) {
      const r = analyzeRange(start, end)
      expect(r.status).toBe('ok')
      if (r.status !== 'ok') continue
      expectExactCover(r.result.rows, ipToU32(start), ipToU32(end))
    }
  })

  it('cidrsForRange / smallestContainingCidr 独立可用', () => {
    expect(cidrsForRange(ipToU32('10.0.0.0'), ipToU32('10.0.0.3')).map((row) => row.cidr)).toEqual([
      '10.0.0.0/30',
    ])
    expect(smallestContainingCidr(ipToU32('10.0.0.0'), ipToU32('10.0.0.3')).cidr).toBe('10.0.0.0/30')
  })
})

describe('验收 #3：62 行极限样例（0.0.0.1–255.255.255.254）', () => {
  it('恰好 62 行、天然有界；首尾 /32、中段两条 /2', () => {
    const r = analyzeRange('0.0.0.1', '255.255.255.254')
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.result.rows).toHaveLength(62)
    expect(r.result.rows[0]!.cidr).toBe('0.0.0.1/32')
    expect(r.result.rows[30]!.cidr).toBe('64.0.0.0/2')
    expect(r.result.rows[31]!.cidr).toBe('128.0.0.0/2')
    expect(r.result.rows[32]!.cidr).toBe('192.0.0.0/3')
    expect(r.result.rows[61]!.cidr).toBe('255.255.255.254/32')
    expectExactCover(r.result.rows, 1, 0xfffffffe)
    // 最小包含升级到全空间
    expect(r.result.containing.cidr).toBe('0.0.0.0/0')
    expect(r.result.oldSize).toBe(4294967294)
    expect(r.result.newSize).toBe(4294967296)
  })
})

describe('验收 #4：单地址 / 全空间特例', () => {
  it('单地址区间 → /32 单行，尺寸 1:1', () => {
    const r = analyzeRange('1.2.3.4', '1.2.3.4')
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.result.rows.map((row) => row.cidr)).toEqual(['1.2.3.4/32'])
    expect(r.result.containing.cidr).toBe('1.2.3.4/32')
    expect(r.result.oldSize).toBe(1)
    expect(r.result.newSize).toBe(1)
  })

  it('全空间 → /0 单行，42.9 亿不截断', () => {
    const r = analyzeRange('0.0.0.0', '255.255.255.255')
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.result.rows.map((row) => row.cidr)).toEqual(['0.0.0.0/0'])
    expect(r.result.containing.cidr).toBe('0.0.0.0/0')
    expect(r.result.oldSize).toBe(4294967296)
    expect(r.result.newSize).toBe(4294967296)
    expect(r.result.rows[0]!.total).toBe(4294967296)
  })
})

describe('验收 #5：起 > 止显式报错与字段级定位', () => {
  it('起 > 止：显式报错（it-tools 返 undefined 的行为升级）', () => {
    const r = analyzeRange('10.0.0.5', '10.0.0.1')
    expect(r.status).toBe('error')
    if (r.status !== 'error') return
    expect(r.error.field).toBe('order')
    expect(r.error.kind).toBe('order')
    expect(zh('ipv4Subnet.rangeErrOrder')).toContain('大于')
  })

  it('起字段非法定位到起', () => {
    const r = analyzeRange('abc', '10.0.0.1')
    expect(r.status).toBe('error')
    if (r.status !== 'error') return
    expect(r.error.field).toBe('start')
    expect(r.error.kind).toBe('invalid')
    expect(zh('ipv4Subnet.rangeErrInvalid', { value: 'abc' })).toBe('「abc」不是合法的 IPv4 地址')
  })

  it('止字段非法定位到止', () => {
    const r = analyzeRange('10.0.0.1', '10.0.0.256')
    expect(r.status).toBe('error')
    if (r.status !== 'error') return
    expect(r.error.field).toBe('end')
  })

  it('双空或只填一侧 → empty（不出结果不报错）', () => {
    expect(analyzeRange('', '').status).toBe('empty')
    expect(analyzeRange('  ', '10.0.0.1').status).toBe('empty')
    expect(analyzeRange('10.0.0.1', '').status).toBe('empty')
  })
})

describe('locale fragment：区间反推文案与 zh/en 键结构', () => {
  it('区块标题与双输出口径文案存在', () => {
    expect(zh('ipv4Subnet.rangeTitle')).toContain('区间反推')
    expect(zh('ipv4Subnet.rangeExactCount')).toContain('并集 = 区间')
    expect(zh('ipv4Subnet.rangeContainingTitle')).toContain('最小包含')
  })

  it('zh 与 en 键路径一致（双语齐备，含既有等分切分键不回归）', () => {
    const paths = (obj: Record<string, unknown>, base = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? paths(v as Record<string, unknown>, `${base}${k}.`) : [`${base}${k}`],
      )
    const zhPart = subnetLocale['zh-CN'] as Record<string, unknown>
    const enPart = subnetLocale.en as Record<string, unknown>
    expect(paths(enPart)).toEqual(paths(zhPart))
  })
})
