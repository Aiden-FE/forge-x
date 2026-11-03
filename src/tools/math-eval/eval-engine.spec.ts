import { describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  MAX_INPUT_BYTES,
  enforceInputLimit,
  evaluateScratchpad,
  formatValue,
  pushHistory,
} from './eval-engine'
import type { DefinitionRow, ExpressionRow } from './eval-engine'
import mathLocale from '@/locales/tools/math-eval'

function makeTranslator(lang: 'zh-CN' | 'en') {
  const part = mathLocale[lang] as Record<string, unknown>
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

async function rows(input: string) {
  const r = await evaluateScratchpad(input)
  return r.rows
}

function exprRow(row: Awaited<ReturnType<typeof rows>>[number]): ExpressionRow {
  if (row.type !== 'expression') throw new Error(`expected expression row, got ${row.type}`)
  return row
}

function defRow(row: Awaited<ReturnType<typeof rows>>[number]): DefinitionRow {
  if (row.type !== 'definition') throw new Error(`expected definition row, got ${row.type}`)
  return row
}

describe('常量与协议', () => {
  it('历史 20 条上限；输入上限 1 MiB', () => {
    expect(HISTORY_LIMIT).toBe(20)
    expect(MAX_INPUT_BYTES).toBe(1024 * 1024)
  })
})

describe('验收 #1：运算优先级 / 括号 / 一元负号 / 幂右结合 / 取模与幂', () => {
  it('优先级与括号正确', async () => {
    expect(exprRow((await rows('2 + 3 * 4'))[0]!).text).toBe('14')
    expect(exprRow((await rows('(2 + 3) * 4'))[0]!).text).toBe('20')
    expect(exprRow((await rows('10 - 4 - 3'))[0]!).text).toBe('3')
  })

  it('一元负号：-2^2 = -4（负号绑定低于幂，与库一致）', async () => {
    expect(exprRow((await rows('-2^2'))[0]!).text).toBe('-4')
  })

  it('幂右结合：2^3^2 = 512（验收主断言）', async () => {
    expect(exprRow((await rows('2^3^2'))[0]!).text).toBe('512')
  })

  it('取模与幂混用优先级与库一致：2%3^2 = 2 % 9', async () => {
    expect(exprRow((await rows('2%3^2'))[0]!).text).toBe('2')
    expect(exprRow((await rows('(2%3)^2'))[0]!).text).toBe('4')
  })
})

describe('验收 #2：常量 π/e 与函数集抽样（容差 1e-12）', () => {
  it('常量 pi 与 e 可直接引用（库内置为 PI/E，工具注入小写别名）', async () => {
    const rs = await rows('pi > 3.14\ne > 2.71')
    expect(exprRow(rs[0]!).text).toBe('true')
    expect(exprRow(rs[1]!).text).toBe('true')
  })

  it('函数抽样与高精度参照一致（容差 1e-12）', async () => {
    const input = [
      'sin(pi / 6)',
      'log(e)',
      'log10(100000)',
      'round(2.567)',
      'min(3, 1, 2)',
      'max(3, 1, 2)',
      'sqrt(2)',
    ].join('\n')
    const rs = await rows(input)
    const reference = [
      Math.sin(Math.PI / 6),
      Math.log(Math.E),
      Math.log10(100000),
      Math.round(2.567),
      Math.min(3, 1, 2),
      Math.max(3, 1, 2),
      Math.sqrt(2),
    ]
    expect(rs).toHaveLength(reference.length)
    for (let i = 0; i < reference.length; i++) {
      const row = exprRow(rs[i]!)
      expect(row.ok).toBe(true)
      const value = Number(row.text)
      expect(Number.isFinite(value)).toBe(true)
      expect(Math.abs(value - reference[i]!)).toBeLessThan(1e-12)
    }
  })
})

describe('验收 #3：逐行 scope：定义 → 引用 → 覆盖重绑 → 后行生效', () => {
  it('定义行回显绑定名、不显示结果值；表达式行引用前面的绑定', async () => {
    const rs = await rows('x = 5\nx * 2')
    const def = defRow(rs[0]!)
    expect(def.ok).toBe(true)
    expect(def.name).toBe('x')
    expect((def as { text?: string }).text).toBeUndefined()
    expect(exprRow(rs[1]!).text).toBe('10')
  })

  it('覆盖重绑：后行生效', async () => {
    const rs = await rows('x = 5\nx * 2\nx = 7\nx * 2')
    expect(exprRow(rs[1]!).text).toBe('10')
    expect(exprRow(rs[3]!).text).toBe('14')
  })

  it('undefined 变量只红该行、他行结果保留', async () => {
    const rs = await rows('x = 5\nx * 2\ny + 1\nx + 1')
    const bad = exprRow(rs[2]!)
    expect(bad.ok).toBe(false)
    expect(bad.error?.kind).toBe('undefinedVar')
    expect(bad.error?.name).toBe('y')
    expect(exprRow(rs[1]!).text).toBe('10')
    expect(exprRow(rs[3]!).text).toBe('6')
  })

  it('定义行出错同样只错该行，绑定不生效', async () => {
    const rs = await rows('a = nope + 1\n1 + 1')
    const def = defRow(rs[0]!)
    expect(def.ok).toBe(false)
    expect(def.error?.kind).toBe('undefinedVar')
    expect(exprRow(rs[1]!).text).toBe('2')
    const rs2 = await rows('a = nope + 1\na + 1')
    expect(exprRow(rs2[1]!).ok).toBe(false)
    expect(exprRow(rs2[1]!).error?.kind).toBe('undefinedVar')
  })

  it('undefined 变量文案定位到变量名（真实文案渲染）', async () => {
    const rs = await rows('y + 1')
    const bad = exprRow(rs[0]!)
    expect(bad.error?.kind).toBe('undefinedVar')
    expect(zh('mathEval.errUndefinedVar', { name: bad.error!.name! })).toBe('未定义变量 y')
  })

  it('语法错误只红该行，库原文透传', async () => {
    const rs = await rows('1 +\n2 * 3')
    const bad = exprRow(rs[0]!)
    expect(bad.ok).toBe(false)
    expect(bad.error?.kind).toBe('syntax')
    expect(bad.error?.message).toContain('unexpected TEOF') // 库原文：unexpected TEOF: EOF
    expect(exprRow(rs[1]!).text).toBe('6')
  })

  it('空输入产出零行', async () => {
    const r = await evaluateScratchpad('\n  \n\r\n')
    expect(r.rows).toHaveLength(0)
    expect(r.truncated).toBe(false)
  })
})

describe('验收 #4：浮点如实（不修约不美化）', () => {
  it('0.1+0.2 完整位数断言', async () => {
    const row = exprRow((await rows('0.1+0.2'))[0]!)
    expect(row.ok).toBe(true)
    expect(row.text).toBe('0.30000000000000004')
    expect(row.special).toBeNull()
  })

  it('除零 ∞ / 负除零 -∞ / 0÷0 NaN，特殊值标记', async () => {
    const inf = exprRow((await rows('1/0'))[0]!)
    expect(inf.text).toBe('∞')
    expect(inf.special).toBe('inf')
    const neginf = exprRow((await rows('-1/0'))[0]!)
    expect(neginf.text).toBe('-∞')
    expect(neginf.special).toBe('neginf')
    const nan = exprRow((await rows('0/0'))[0]!)
    expect(nan.text).toBe('NaN')
    expect(nan.special).toBe('nan')
  })

  it('formatValue 独立校验（整型无尾随 .0）', () => {
    expect(formatValue(512)).toEqual({ text: '512', special: null })
    expect(formatValue(Number.POSITIVE_INFINITY)).toEqual({ text: '∞', special: 'inf' })
    expect(formatValue(Number.NEGATIVE_INFINITY)).toEqual({ text: '-∞', special: 'neginf' })
    expect(formatValue(Number.NaN)).toEqual({ text: 'NaN', special: 'nan' })
  })

  it('1 MiB 超限截断并在字符边界回退', () => {
    const small = enforceInputLimit('1 + 1')
    expect(small.truncated).toBe(false)
    const big = enforceInputLimit('x'.repeat(MAX_INPUT_BYTES + 10))
    expect(big.truncated).toBe(true)
    expect(big.text.length).toBeLessThanOrEqual(MAX_INPUT_BYTES)
    // 😀 = 1 码点 = 2 UTF-16 code unit = 4 UTF-8 字节：恰好 1 MiB 不截断
    const emoji = enforceInputLimit('😀'.repeat(MAX_INPUT_BYTES / 4))
    expect(emoji.truncated).toBe(false)
    const emojiOver = enforceInputLimit('😀'.repeat(MAX_INPUT_BYTES / 4 + 1))
    expect(emojiOver.truncated).toBe(true)
    expect(emojiOver.text.length % 2).toBe(0) // 未劈开代理对
  })
})

describe('验收 #5：历史 20 条滚动淘汰、点击回填完整多行块', () => {
  it('滚动淘汰并保留完整多行块', () => {
    let history = [] as ReturnType<typeof pushHistory>
    for (let i = 0; i < 25; i++) {
      history = pushHistory(history, `x = ${i}\nx * 2`)
    }
    expect(history).toHaveLength(HISTORY_LIMIT)
    expect(history[0]!.text).toBe('x = 24\nx * 2')
    expect(history[19]!.text).toBe('x = 5\nx * 2')
  })

  it('空块不入史；连续相同块不重复记录', () => {
    expect(pushHistory([], '   ')).toHaveLength(0)
    let history = pushHistory([], '1 + 1')
    history = pushHistory(history, '1 + 1')
    expect(history).toHaveLength(1)
    history = pushHistory(history, '2 + 2')
    expect(history).toHaveLength(2)
  })
})
