import { describe, expect, it } from 'vitest'
import { DEFAULT_TOP_N, TOP_N_TIERS, computeWordFrequency, sharePercent } from './frequency'
import type { FrequencyMode } from './frequency'

function tokens(result: ReturnType<typeof computeWordFrequency>): string[] {
  return result.entries.map((e) => e.token)
}

function counts(result: ReturnType<typeof computeWordFrequency>): Map<string, number> {
  return new Map(result.entries.map((e) => [e.token, e.count]))
}

/* ---------- 分词口径：按词（Intl.Segmenter 词级切分，真词频） ---------- */

describe('按词档（Segmenter 词级切分）', () => {
  // 运行时实测（Node 22 / ICU 77，Chromium 同族 cjdict）：
  // 「人工智能」按词典切为 人工 + 智能 两词；按字档逐字计 4。
  // （票面 fixture「1 词 vs 3 词」与任何真实 Segmenter 都对不上——
  //   人工智能是 4 个汉字，按字不可能得 3；以实测口径为准。）
  it('「人工智能」按词 = 人工 + 智能 两词（真词频），按字 = 4 字', () => {
    const word = computeWordFrequency('人工智能', 'word')
    expect(tokens(word)).toEqual(['人工', '智能'])
    expect(word.total).toBe(2)

    const char = computeWordFrequency('人工智能', 'char')
    expect(tokens(char)).toEqual(['人', '工', '智', '能'])
    expect(char.total).toBe(4)
  })

  it('空白与标点段不入桶（isWordLike 除外）', () => {
    const res = computeWordFrequency('hello, world!', 'word')
    expect(tokens(res)).toEqual(['hello', 'world'])
    expect(res.total).toBe(2)
  })

  it("词内撇号不拆：don't 计 1；连字符拆词：state-of-the-art 计 4", () => {
    expect(computeWordFrequency("don't", 'word').entries).toEqual([{ token: "don't", count: 1 }])
    expect(tokens(computeWordFrequency('state-of-the-art', 'word'))).toEqual([
      'state',
      'of',
      'the',
      'art',
    ])
  })
})

/* ---------- 按字档（CJK 逐字，与统计词口径一致） ---------- */

describe('按字档（CJK 逐字）', () => {
  it('你好世界 → 四字各计 1', () => {
    const res = computeWordFrequency('你好世界', 'char')
    expect(res.entries).toEqual([
      { token: '你', count: 1 },
      { token: '好', count: 1 },
      { token: '世', count: 1 },
      { token: '界', count: 1 },
    ])
    expect(res.total).toBe(4)
  })

  it('重复汉字计频次：中文中 → 中×2、文×1（词典词「中文」逐字拆开）', () => {
    expect(computeWordFrequency('中文中', 'char').entries).toEqual([
      { token: '中', count: 2 },
      { token: '文', count: 1 },
    ])
  })

  it('中英混排按字：汉字逐字 + 拉丁词与按词档等价', () => {
    const res = computeWordFrequency('你好 world 中文', 'char')
    expect(counts(res).get('你')).toBe(1)
    expect(counts(res).get('好')).toBe(1)
    expect(counts(res).get('中')).toBe(1)
    expect(counts(res).get('文')).toBe(1)
    expect(counts(res).get('world')).toBe(1)
    expect(res.total).toBe(5)
  })
})

/* ---------- 拉丁文两档等价 + 小写归一 ---------- */

describe('拉丁文两档等价与小写归一', () => {
  it('The / THE 并入 the（小写归一，验收）', () => {
    for (const mode of ['word', 'char'] as const) {
      const res = computeWordFrequency('The cat THE dog the', mode)
      expect(counts(res).get('the')).toBe(3)
      expect(res.entries.some((e) => e.token === 'The')).toBe(false)
      expect(res.entries.some((e) => e.token === 'THE')).toBe(false)
    }
  })

  it('纯拉丁文本两档切分结果完全一致（空格/标点分词）', () => {
    const text = 'The quick brown fox jumps over the lazy dog. Fox FOX fox!'
    const word = computeWordFrequency(text, 'word')
    const char = computeWordFrequency(text, 'char')
    expect(word.entries).toEqual(char.entries)
    expect(counts(word).get('fox')).toBe(4)
    expect(counts(word).get('the')).toBe(2)
  })

  it('大小写归一后的频次合并：iPhone iphone IPHONE → iphone×3', () => {
    const res = computeWordFrequency('iPhone iphone IPHONE', 'word')
    expect(res.entries).toEqual([{ token: 'iphone', count: 3 }])
  })
})

/* ---------- 排序、总数与占比 ---------- */

describe('排序与总数依据', () => {
  it('频次降序；同频保持首次出现序（稳定）', () => {
    const res = computeWordFrequency('b b a c a b a c a', 'word')
    expect(res.entries).toEqual([
      { token: 'a', count: 4 },
      { token: 'b', count: 3 },
      { token: 'c', count: 2 },
    ])
  })

  it('total = 全部频次之和（该口径总词数）', () => {
    const res = computeWordFrequency('a a b c c c', 'word')
    expect(res.total).toBe(6)
    expect(res.entries.reduce((s, e) => s + e.count, 0)).toBe(res.total)
  })

  it('Top-N 截断不丢失总数依据：截断后 total 仍为全量', () => {
    const text = 'a a a b b c d e f g h i j k'
    const res = computeWordFrequency(text, 'word')
    const top2 = res.entries.slice(0, 2)
    expect(top2.map((e) => e.token)).toEqual(['a', 'b'])
    expect(res.total).toBe(14) // a×3 + b×2 + c..k×9
  })

  it('占比合计 = 100%（四舍五入容差，验收）', () => {
    const res = computeWordFrequency('a a a b b c c d', 'word')
    const sum = res.entries.reduce((s, e) => s + sharePercent(e.count, res.total), 0)
    expect(sum).toBeCloseTo(100, 6)
    // 展示口径（1 位小数）在条目较少时合计仍落在 100% 容差内
    const rounded = res.entries.reduce((s, e) => s + Number(sharePercent(e.count, res.total).toFixed(1)), 0)
    expect(Math.abs(rounded - 100)).toBeLessThanOrEqual(0.1 * res.entries.length)
  })

  it('sharePercent：total = 0 恒 0，不产生 NaN', () => {
    expect(sharePercent(1, 0)).toBe(0)
    expect(sharePercent(0, 0)).toBe(0)
    expect(sharePercent(50, 200)).toBe(25)
  })
})

/* ---------- 空输入与档位常量 ---------- */

describe('空输入与档位', () => {
  it('空文本 → 全空、total 0；标点独文本同', () => {
    expect(computeWordFrequency('', 'word')).toEqual({ entries: [], total: 0 })
    expect(computeWordFrequency('', 'char')).toEqual({ entries: [], total: 0 })
    expect(computeWordFrequency('!!! ... ---', 'word')).toEqual({ entries: [], total: 0 })
  })

  it('Top-N 档位固定 10/20/50/100，默认 20', () => {
    expect([...TOP_N_TIERS]).toEqual([10, 20, 50, 100])
    expect(DEFAULT_TOP_N).toBe(20)
  })

  it('档位档常量覆盖为 FrequencyMode 联合类型', () => {
    const modes: FrequencyMode[] = ['word', 'char']
    for (const mode of modes) expect(computeWordFrequency('a', mode).total).toBe(1)
  })
})
