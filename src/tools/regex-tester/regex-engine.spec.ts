import { describe, expect, it } from 'vitest'
import {
  ALL_FLAGS,
  DEFAULT_FLAGS,
  MAX_MATCHES,
  MAX_TEXT_BYTES,
  TIMEOUT_MS,
  buildRegExp,
  enforceTextLimit,
  executeRequest,
  previewReplacement,
  probeSupportedFlags,
  runMatch,
  timeoutResponse,
} from './regex-engine'

/**
 * 注入式假时钟：按队列吐出时间值，耗尽后停在最后一位。
 * runMatch 调用序列 = start(1 次) + 每次执行前的超时检查(N 次) + 结束计时(1 次)。
 */
function fakeNow(times: number[]): () => number {
  let i = 0
  return () => (i < times.length ? times[i++] : times[times.length - 1] ?? 0)
}

describe('常量与协议（规格 §2）', () => {
  it('硬上限：匹配 5000 / 文本 1 MiB / 超时 1.5s', () => {
    expect(MAX_MATCHES).toBe(5000)
    expect(MAX_TEXT_BYTES).toBe(1024 * 1024)
    expect(TIMEOUT_MS).toBe(1500)
  })

  it('标志集 g i m s u y d v，默认仅 g', () => {
    expect(ALL_FLAGS).toEqual(['g', 'i', 'm', 's', 'u', 'y', 'd', 'v'])
    expect(DEFAULT_FLAGS).toEqual(['g'])
  })
})

describe('flag 探测（运行时不支持的标志应隐藏）', () => {
  it('node 环境下基础七标志全部可用', () => {
    const supported = probeSupportedFlags()
    for (const f of ['g', 'i', 'm', 's', 'u', 'y', 'd'] as const) {
      expect(supported, `flag ${f}`).toContain(f)
    }
  })

  it('v 标志探测结果与直接 try/catch 一致（不硬编码 node 版本能力）', () => {
    let vWorks = false
    try {
      new RegExp('a', 'v')
      vWorks = true
    } catch {
      vWorks = false
    }
    expect(probeSupportedFlags().includes('v')).toBe(vWorks)
  })

  it('探测不抛错、去重且是 ALL_FLAGS 的子集', () => {
    const supported = probeSupportedFlags()
    expect(new Set(supported).size).toBe(supported.length)
    for (const f of supported) expect(ALL_FLAGS).toContain(f)
  })
})

describe('buildRegExp（非法模式透传 JS 错误）', () => {
  it('合法模式与标志原样构建', () => {
    const re = buildRegExp('a(b+)c', 'gi')
    expect(re.source).toBe('a(b+)c')
    expect(re.flags).toBe('gi')
  })

  it('未闭合括号抛出 SyntaxError', () => {
    expect(() => buildRegExp('(', '')).toThrow()
  })

  it('未知标志抛出 SyntaxError', () => {
    expect(() => buildRegExp('a', 'q')).toThrow()
    expect(() => buildRegExp('a', 'G')).toThrow() // 标志区分大小写
  })
})

describe('执行编排：普通匹配与 g 多匹配', () => {
  it('验收 #1：/a(b+)c/g 对多段文本 → 匹配数、索引、组 1 值正确', () => {
    const r = runMatch('a(b+)c', 'g', 'x abbc y abbbbbc z')
    expect(r.ok).toBe(true)
    expect(r.error).toBeNull()
    expect(r.matches).toHaveLength(2)
    expect(r.matches[0]).toMatchObject({ index: 2, end: 6, text: 'abbc', groups: ['bb'] })
    expect(r.matches[1]).toMatchObject({ index: 9, end: 16, text: 'abbbbbc', groups: ['bbbbb'] })
    expect(r.groupsMeta).toEqual({ count: 1, named: [] })
  })

  it('相邻匹配按发现顺序排列，序号奇偶可直接用于交替底色', () => {
    const r = runMatch('o', 'g', 'foo boo')
    expect(r.matches.map((m) => m.index)).toEqual([1, 2, 5, 6])
    expect(r.matches.map((m) => m.end)).toEqual([2, 3, 6, 7])
  })

  it('非 g 非 y：仅报告第一个匹配', () => {
    const r = runMatch('o', '', 'foo boo')
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]?.index).toBe(1)
  })

  it('无匹配：空列表、ok、无错误', () => {
    const r = runMatch('z', 'g', 'foo')
    expect(r.ok).toBe(true)
    expect(r.matches).toHaveLength(0)
    expect(r.groupsMeta).toEqual({ count: 0, named: [] })
  })
})

describe('执行编排：零宽匹配（位置标记语义）', () => {
  it('验收 #3：/(?=a)/g 对 "aaa" → 3 个零宽匹配、不挂起', () => {
    const r = runMatch('(?=a)', 'g', 'aaa')
    expect(r.matches).toHaveLength(3)
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 2])
    for (const m of r.matches) {
      expect(m.text).toBe('')
      expect(m.end).toBe(m.index)
    }
  })

  it('/\\b/g 对 "ab cd" → 词边界位置 0,2,3,5 全部零宽', () => {
    const r = runMatch('\\b', 'g', 'ab cd')
    expect(r.matches.map((m) => m.index)).toEqual([0, 2, 3, 5])
    expect(r.matches.every((m) => m.text === '')).toBe(true)
  })

  it('y（粘连）+ g：从 lastIndex=0 起单次尝试序列，零宽手动推进不挂起', () => {
    const r = runMatch('(?=a)', 'gy', 'aaa')
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 2])
  })

  it('y 无 g：仅一次尝试（lastIndex=0），忠实 JS', () => {
    expect(runMatch('a', 'y', 'aaa').matches).toHaveLength(1)
    expect(runMatch('b', 'y', 'ab').matches).toHaveLength(0) // 粘连只在 0 位尝试
  })

  it('y + g 普通匹配：逐位粘连推进', () => {
    const r = runMatch('a', 'gy', 'aaa')
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 2])
    expect(runMatch('b', 'gy', 'ab').matches).toHaveLength(0)
  })
})

describe('执行编排：标志开关改变结果（验收 #6 逻辑层）', () => {
  it('u 标志：增补平面字符按码点整体匹配（索引仍为 UTF-16 code unit）', () => {
    const withU = runMatch('.', 'gu', '𝕏a')
    expect(withU.matches.map((m) => [m.index, m.end, m.text])).toEqual([
      [0, 2, '𝕏'],
      [2, 3, 'a'],
    ])
    const withoutU = runMatch('.', 'g', '𝕏a')
    expect(withoutU.matches.map((m) => m.index)).toEqual([0, 1, 2]) // 代理对被拆开
  })

  it('i 标志：忽略大小写', () => {
    expect(runMatch('b', 'gi', 'ABC').matches.map((m) => m.text)).toEqual(['B'])
    expect(runMatch('b', 'g', 'ABC').matches).toHaveLength(0)
  })

  it('m 标志：^ $ 匹配行首尾', () => {
    expect(runMatch('^b$', 'gm', 'a\nb\nc').matches.map((m) => m.index)).toEqual([2])
    expect(runMatch('^b$', 'g', 'a\nb\nc').matches).toHaveLength(0)
  })

  it('s 标志：点号匹配换行', () => {
    expect(runMatch('a.b', 'gs', 'a\nb').matches.map((m) => [m.index, m.end])).toEqual([[0, 3]])
    expect(runMatch('a.b', 'g', 'a\nb').matches).toHaveLength(0)
  })

  it('d 标志：产生 indices（含整体匹配与各组），无 d 时不产生', () => {
    const withD = runMatch('a(b)', 'gd', 'xab')
    expect(withD.matches[0]?.indices).toBeDefined()
    expect(withD.matches[0]?.indices?.[0]).toEqual([1, 3])
    expect(withD.matches[0]?.indices?.[1]).toEqual([2, 3])
    const withoutD = runMatch('a(b)', 'g', 'xab')
    expect(withoutD.matches[0]?.indices).toBeUndefined()
  })
})

describe('分组列示（编号组 / 命名组 / 缺组 undefined / 嵌套）', () => {
  it('验收 #2：命名组值与 groupsMeta.named 顺序正确', () => {
    const r = runMatch('(?<year>\\d{4})-(?<month>\\d{2})', 'g', '2024-01 and 9999-12')
    expect(r.matches[0]?.named).toEqual({ year: '2024', month: '01' })
    expect(r.matches[1]?.named).toEqual({ year: '9999', month: '12' })
    expect(r.groupsMeta).toEqual({ count: 2, named: ['year', 'month'] })
  })

  it('未参与匹配的组值为 undefined（编号组）', () => {
    const r = runMatch('(a)|(b)', 'g', 'ab')
    expect(r.matches[0]?.groups).toEqual(['a', undefined])
    expect(r.matches[1]?.groups).toEqual([undefined, 'b'])
    expect(r.groupsMeta.count).toBe(2)
  })

  it('未参与匹配的命名组键存在且值为 undefined', () => {
    const r = runMatch('(?<a>x)?y', 'g', 'y xy')
    expect(r.matches[0]?.named).toEqual({ a: undefined })
    expect(r.matches[1]?.named).toEqual({ a: 'x' })
  })

  it('嵌套组按编号展开', () => {
    const r = runMatch('(a(b))', 'g', 'ab ab')
    expect(r.matches[0]?.groups).toEqual(['ab', 'b'])
    const named = runMatch('(?<outer>a(?<inner>b))', 'g', 'ab')
    expect(named.matches[0]?.named).toEqual({ outer: 'ab', inner: 'b' })
    expect(named.groupsMeta.named).toEqual(['outer', 'inner'])
  })
})

describe('硬上限：5000 匹配截断与 1 MiB 文本截断', () => {
  it('超过 5000 匹配：截取 5000 且 truncated=true', () => {
    const r = runMatch('a', 'g', 'a'.repeat(6000))
    expect(r.matches).toHaveLength(MAX_MATCHES)
    expect(r.truncated).toBe(true)
  })

  it('恰好 5000 匹配：truncated=false（探测一次确认无更多）', () => {
    const r = runMatch('a', 'g', 'a'.repeat(5000))
    expect(r.matches).toHaveLength(5000)
    expect(r.truncated).toBe(false)
  })

  it('maxMatches 可注入覆盖（测试与未来策略用）', () => {
    const r = runMatch('a', 'g', 'a'.repeat(10), { maxMatches: 3 })
    expect(r.matches).toHaveLength(3)
    expect(r.truncated).toBe(true)
  })

  it('文本超 1 MiB：在码点边界截断并报告移除量', () => {
    const over = 'a'.repeat(MAX_TEXT_BYTES + 100)
    const res = enforceTextLimit(over)
    expect(res.truncated).toBe(true)
    expect(res.text).toHaveLength(MAX_TEXT_BYTES)
    expect(res.removedChars).toBe(100)

    const exact = enforceTextLimit('a'.repeat(MAX_TEXT_BYTES))
    expect(exact.truncated).toBe(false)
    expect(exact.text).toHaveLength(MAX_TEXT_BYTES)
  })

  it('截断不撕裂增补平面字符（𝕏 = 4 字节 / 2 code unit）', () => {
    const res = enforceTextLimit('𝕏'.repeat(300000)) // 1.2 MB
    expect(res.truncated).toBe(true)
    expect(res.text.length % 2).toBe(0)
    expect(res.text.length).toBe(524288) // 1 MiB / 4 字节 = 262144 个 𝕏 × 2 unit
    expect(res.removedChars).toBe(300000 - 262144)
  })

  it('executeRequest 汇报文本截断：截断部分不参与匹配（验收 #8）', () => {
    const res = executeRequest({ pattern: 'a', flags: 'g', text: 'ab'.repeat(600000) })
    expect(res.textTruncated).toBe(true)
    expect(res.removedChars).toBe(1200000 - 1048576)
    expect(res.matches).toHaveLength(MAX_MATCHES) // 截断后仍有远超 5000 的匹配
    expect(res.truncated).toBe(true)
  })

  it('短文本走快路径：不截断、不逐字符扫描', () => {
    const res = enforceTextLimit('x'.repeat(300000)) // 3 × 300000 ≤ 1 MiB
    expect(res.truncated).toBe(false)
    expect(res.text).toHaveLength(300000)
  })
})

describe('替换预览（String.prototype.replace 语义，期望值手写）', () => {
  it('$1–$99 编号引用交换两个词', () => {
    expect(previewReplacement('(\\w+) (\\w+)', '', 'john smith', '$2 $1')).toEqual({
      ok: true,
      result: 'smith john',
      error: null,
    })
  })

  it('$<name> 命名引用', () => {
    expect(previewReplacement('(?<year>\\d{4})', '', 'in 2024 ok', 'y=$<year>').result).toBe('in y=2024 ok')
  })

  it('$& 整体匹配引用', () => {
    expect(previewReplacement('b', 'g', 'abc', '[$&]').result).toBe('a[b]c')
  })

  it('$$ 转义为字面 $', () => {
    expect(previewReplacement('a', 'g', 'aaa', '$$').result).toBe('$$$')
  })

  it('$` 与 $\' 前后文引用', () => {
    expect(previewReplacement('b', '', 'abc', "$`|$'").result).toBe('aa|cc')
  })

  it('非 g 仅替换第一处；g 全部替换（由 g 决定，String.replace 语义）', () => {
    expect(previewReplacement('o', '', 'foo boo', '-').result).toBe('f-o boo')
    expect(previewReplacement('o', 'g', 'foo boo', '-').result).toBe('f-- b--')
  })

  it('零宽匹配正常参与替换', () => {
    expect(previewReplacement('(?=a)', 'g', 'aaa', '-').result).toBe('-a-a-a')
  })

  it('y（粘连）替换仅在起始位尝试一次', () => {
    expect(previewReplacement('a', 'y', 'aaa', '-').result).toBe('-aa')
  })

  it('引用不存在的命名组：按 JS 语义保留字面量、不抛错', () => {
    expect(previewReplacement('b', '', 'abc', '$<foo>').result).toBe('a$<foo>c')
  })

  it('文本超限：替换在截断后的文本上进行', () => {
    const r = previewReplacement('a', 'g', 'a'.repeat(MAX_TEXT_BYTES + 10), 'x')
    expect(r.ok).toBe(true)
    expect(r.result).toHaveLength(MAX_TEXT_BYTES)
    expect(r.result[0]).toBe('x')
  })

  it('非法模式：ok=false、错误透传、结果为空串', () => {
    const r = previewReplacement('(', '', 'abc', 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
    expect(r.result).toBe('')
  })
})

describe('非法模式与错误结构（验收 #5 逻辑层）', () => {
  it('runMatch 捕获构建错误：透传 message、无结果、不抛出', () => {
    const r = runMatch('(', 'g', 'abc')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
    expect(r.error).not.toBe('')
    expect(r.matches).toHaveLength(0)
    expect(r.truncated).toBe(false)
    expect(r.timedOut).toBe(false)
  })

  it('未知标志同样透传错误', () => {
    const r = runMatch('a', 'q', 'abc')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})

describe('超时逻辑（注入时钟，不必真等 1.5s）', () => {
  it('执行前已超时：timedOut=true、零匹配、durationMs 来自注入时钟', () => {
    const r = runMatch('a', 'g', 'a'.repeat(100), { now: fakeNow([0, 2000]) })
    expect(r.timedOut).toBe(true)
    expect(r.matches).toHaveLength(0)
    expect(r.durationMs).toBe(2000)
    expect(r.error).toBeNull()
  })

  it('迭代间超时：保留已完成的部分匹配并标记 timedOut', () => {
    // 调用序列：start=0 → 检查100 执行 → 检查100 执行 → 检查100 执行 → 检查1600 超时
    const r = runMatch('a', 'g', 'a'.repeat(10), { now: fakeNow([0, 100, 100, 100, 1600]) })
    expect(r.timedOut).toBe(true)
    expect(r.matches).toHaveLength(3)
    expect(r.durationMs).toBe(1600)
    expect(r.truncated).toBe(false)
  })

  it('正常完成不误报：注入恒小时间戳', () => {
    const r = runMatch('a', 'g', 'a'.repeat(10), { now: () => 5 })
    expect(r.ok).toBe(true)
    expect(r.timedOut).toBe(false)
    expect(r.matches).toHaveLength(10)
    expect(r.durationMs).toBe(0)
  })
})

describe('executeRequest 编排（Worker 入口的纯函数形态）', () => {
  it('正常路径：匹配结果 + 替换预览一起返回', () => {
    const res = executeRequest({
      pattern: 'a(b+)',
      flags: 'g',
      text: 'ab abb',
      replacement: '[$1]',
    })
    expect(res.matches).toHaveLength(2)
    expect(res.matches[0]).toMatchObject({ index: 0, end: 2, text: 'ab', groups: ['b'] })
    expect(res.replacement).toBe('[b] [bb]')
    expect(res.error).toBeNull()
    expect(res.timedOut).toBe(false)
    expect(res.textTruncated).toBe(false)
    expect(res.removedChars).toBe(0)
  })

  it('未请求替换时 replacement 为 null', () => {
    const res = executeRequest({ pattern: 'a', flags: 'g', text: 'aa' })
    expect(res.matches).toHaveLength(2)
    expect(res.replacement).toBeNull()
  })

  it('非法模式：error 透传、替换预览不出结果', () => {
    const res = executeRequest({ pattern: '(', flags: 'g', text: 'aa', replacement: 'x' })
    expect(res.error).toBeTruthy()
    expect(res.matches).toHaveLength(0)
    expect(res.replacement).toBeNull()
  })

  it('超时路径：跳过替换预览（不可信模式绝不延伸执行）', () => {
    const res = executeRequest(
      { pattern: 'a', flags: 'g', text: 'a'.repeat(100), replacement: 'x' },
      { now: fakeNow([0, 2000]) },
    )
    expect(res.timedOut).toBe(true)
    expect(res.replacement).toBeNull()
    expect(res.matches).toHaveLength(0)
  })
})

describe('timeoutResponse（主线程 terminate 后构造的空响应）', () => {
  it('timedOut=true、无匹配、无错误、零状态', () => {
    const r = timeoutResponse()
    expect(r.timedOut).toBe(true)
    expect(r.matches).toEqual([])
    expect(r.groupsMeta).toEqual({ count: 0, named: [] })
    expect(r.error).toBeNull()
    expect(r.replacement).toBeNull()
    expect(r.truncated).toBe(false)
    expect(r.textTruncated).toBe(false)
  })
})
