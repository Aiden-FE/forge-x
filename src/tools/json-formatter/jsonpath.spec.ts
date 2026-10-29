import { describe, expect, it } from 'vitest'
import { queryJsonPath } from './jsonpath'
import type { JsonPathQueryOutcome } from './jsonpath'

function expectOk(outcome: JsonPathQueryOutcome): asserts outcome is Extract<JsonPathQueryOutcome, { ok: true }> {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
}

function expectError(outcome: JsonPathQueryOutcome): asserts outcome is Extract<JsonPathQueryOutcome, { ok: false }> {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(false)
}

/**
 * Goessner 规范样例文档（jsonpath.com / Stefan Goessner 原文 store 示例）。
 * 所有期望值为独立手写真值，不依赖库输出推导。
 */
const storeText = JSON.stringify({
  store: {
    book: [
      { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
      { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
      { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', isbn: '0-553-21311-3', price: 8.99 },
      { category: 'fiction', author: 'J. R. R. Tolkien', title: 'The Lord of the Rings', isbn: '0-395-19395-8', price: 22.99 },
    ],
    bicycle: { color: 'red', price: 19.95 },
  },
})

async function valuesOf(jsonText: string, path: string): Promise<unknown[]> {
  const outcome = await queryJsonPath(jsonText, path)
  expectOk(outcome)
  return outcome.matches.map((match) => match.value)
}

describe('Goessner 规范查询集（store 样例文档）', () => {
  it('$.store.book[*].author 返回四本书作者', async () => {
    expect(await valuesOf(storeText, '$.store.book[*].author')).toEqual([
      'Nigel Rees',
      'Evelyn Waugh',
      'Herman Melville',
      'J. R. R. Tolkien',
    ])
  })

  it('$..author 递归下降返回同样的四位作者', async () => {
    expect(await valuesOf(storeText, '$..author')).toEqual([
      'Nigel Rees',
      'Evelyn Waugh',
      'Herman Melville',
      'J. R. R. Tolkien',
    ])
  })

  it('$.store.* 返回 store 下全部直接子节点（book 数组 + bicycle）', async () => {
    const values = await valuesOf(storeText, '$.store.*')
    expect(values).toHaveLength(2)
    expect(values[0]).toEqual([
      expect.objectContaining({ author: 'Nigel Rees' }),
      expect.objectContaining({ author: 'Evelyn Waugh' }),
      expect.objectContaining({ author: 'Herman Melville' }),
      expect.objectContaining({ author: 'J. R. R. Tolkien' }),
    ])
    expect(values[1]).toEqual({ color: 'red', price: 19.95 })
  })

  it('$.store..price 返回店内五个价格', async () => {
    expect(await valuesOf(storeText, '$.store..price')).toEqual([8.95, 12.99, 8.99, 22.99, 19.95])
  })

  it('$..book[2] 返回第三本书（Moby Dick）', async () => {
    expect(await valuesOf(storeText, '$..book[2]')).toEqual([
      {
        category: 'fiction',
        author: 'Herman Melville',
        title: 'Moby Dick',
        isbn: '0-553-21311-3',
        price: 8.99,
      },
    ])
  })

  it('$..book[-1:] 负切片返回最后一本书', async () => {
    expect(await valuesOf(storeText, '$..book[-1:]')).toEqual([
      expect.objectContaining({ title: 'The Lord of the Rings' }),
    ])
  })

  it('$..book[0,1] union 返回前两本书', async () => {
    const values = await valuesOf(storeText, '$..book[0,1]')
    expect(values).toEqual([
      expect.objectContaining({ title: 'Sayings of the Century' }),
      expect.objectContaining({ title: 'Sword of Honour' }),
    ])
  })

  it('$..book[::2] 切片含步长返回第 0、2 本', async () => {
    const values = await valuesOf(storeText, '$..book[::2]')
    expect(values).toEqual([
      expect.objectContaining({ title: 'Sayings of the Century' }),
      expect.objectContaining({ title: 'Moby Dick' }),
    ])
  })

  it('$..book[?(@.isbn)] 过滤出带 isbn 的书', async () => {
    const values = await valuesOf(storeText, '$..book[?(@.isbn)]')
    expect(values).toEqual([
      expect.objectContaining({ title: 'Moby Dick' }),
      expect.objectContaining({ title: 'The Lord of the Rings' }),
    ])
  })

  it('$..[?(@.price<10)] 递归过滤返回两本低价书', async () => {
    const values = await valuesOf(storeText, '$..[?(@.price<10)]')
    expect(values).toEqual([
      expect.objectContaining({ title: 'Sayings of the Century' }),
      expect.objectContaining({ title: 'Moby Dick' }),
    ])
  })

  it('每个匹配都带以 $ 开头的规范化路径字符串', async () => {
    const outcome = await queryJsonPath(storeText, '$.store.book[*].author')
    expectOk(outcome)
    for (const match of outcome.matches) {
      expect(typeof match.path).toBe('string')
      expect(match.path.startsWith('$')).toBe(true)
      expect(match.path).toContain('author')
    }
  })

  it('转义键 $.a[\'b.c\'] 命中含点属性', async () => {
    const doc = JSON.stringify({ a: { 'b.c': 'escaped-value' } })
    const outcome = await queryJsonPath(doc, "$.a['b.c']")
    expectOk(outcome)
    expect(outcome.matches.map((m) => m.value)).toEqual(['escaped-value'])
    expect(outcome.matches[0]?.path).toBe("$['a']['b.c']")
  })

  it("union 含缺失成员 $['store','owner'] 只返回存在的成员", async () => {
    const outcome = await queryJsonPath(storeText, "$['store','owner']")
    expectOk(outcome)
    expect(outcome.matches).toHaveLength(1)
    expect(outcome.matches[0]?.value).toEqual({
      book: expect.any(Array),
      bicycle: { color: 'red', price: 19.95 },
    })
  })
})

describe('过滤表达式', () => {
  it('数值比较 price<10', async () => {
    expect(await valuesOf(storeText, '$..book[?(@.price<10)].title')).toEqual([
      'Sayings of the Century',
      'Moby Dick',
    ])
  })

  it('字符串比较 category==fiction', async () => {
    expect(await valuesOf(storeText, "$..book[?(@.category=='fiction')].title")).toEqual([
      'Sword of Honour',
      'Moby Dick',
      'The Lord of the Rings',
    ])
  })

  it('复合条件 && 组合', async () => {
    const values = await valuesOf(storeText, '$..book[?(@.price>20 && @.isbn)].title')
    expect(values).toEqual(['The Lord of the Rings'])
  })

  it('结果恒为数组（单值也包裹）', async () => {
    const outcome = await queryJsonPath(storeText, '$.store.book[0].author')
    expectOk(outcome)
    expect(Array.isArray(outcome.matches)).toBe(true)
    expect(outcome.matches).toHaveLength(1)
  })

  it('脚本表达式 [(1)] 按 jsonpath-plus 能力可用（safe eval）', async () => {
    expect(await valuesOf(storeText, '$..book[(1)].author')).toEqual(['Evelyn Waugh'])
  })
})

describe('空结果与错误（结构化，不抛裸异常）', () => {
  it('无匹配返回空数组，与错误区分', async () => {
    const outcome = await queryJsonPath(storeText, '$..book[?(@.price>100)]')
    expectOk(outcome)
    expect(outcome.matches).toEqual([])
  })

  it('过滤表达式语法错误 → invalidPath 结构化错误', async () => {
    const outcome = await queryJsonPath(storeText, '$..book[?(@.price<)]')
    expectError(outcome)
    expect(outcome.error.code).toBe('invalidPath')
    expect(outcome.error.message).toBeTruthy()
  })

  it('未闭合括号的过滤表达式 → invalidPath', async () => {
    const outcome = await queryJsonPath(storeText, '$..book[?(@.isbn')
    expectError(outcome)
    expect(outcome.error.code).toBe('invalidPath')
  })

  it('路径语法合法但过滤运行时失败 → queryError', async () => {
    const outcome = await queryJsonPath(storeText, '$..book[?(@.price.notReal.deep)]')
    expectError(outcome)
    expect(outcome.error.code).toBe('queryError')
    expect(outcome.error.message).toBeTruthy()
  })

  it('空路径 → invalidPath', async () => {
    const outcome = await queryJsonPath(storeText, '   ')
    expectError(outcome)
    expect(outcome.error.code).toBe('invalidPath')
  })

  it('文档解析失败先于查询 → jsonParse 错误', async () => {
    const outcome = await queryJsonPath('{not json', '$.a')
    expectError(outcome)
    expect(outcome.error.code).toBe('jsonParse')
    expect(outcome.error.message).toBeTruthy()
  })

  it('文档非法时即使路径也非法，仍先报 jsonParse', async () => {
    const outcome = await queryJsonPath('{not json', '$..book[?(@.price<)]')
    expectError(outcome)
    expect(outcome.error.code).toBe('jsonParse')
  })

  it('空文档输入 → empty 错误', async () => {
    const outcome = await queryJsonPath('  \n\t ', '$..author')
    expectError(outcome)
    expect(outcome.error.code).toBe('empty')
  })
})

describe('重复查询（懒加载模块引用缓存后可复用）', () => {
  it('同一进程内连续多次查询结果一致', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect(await valuesOf(storeText, '$..book[0].author')).toEqual(['Nigel Rees'])
    }
  })
})
