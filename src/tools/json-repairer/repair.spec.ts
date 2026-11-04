import { describe, expect, it } from 'vitest'
import {
  DEBOUNCE_MS,
  DOWNLOAD_FILENAME,
  PASTE_MAX_BYTES,
  isPasteWithinLimit,
  positionToLineColumn,
  repairJson,
  utf8ByteLength,
} from './repair'

function expectOk(outcome: Awaited<ReturnType<typeof repairJson>>): asserts outcome is {
  ok: true
  value: string
} {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
}

function errorOf(outcome: Awaited<ReturnType<typeof repairJson>>) {
  expect(outcome.ok).toBe(false)
  if (outcome.ok) throw new Error('unreachable')
  expect(outcome.errors).toHaveLength(1)
  return outcome.errors[0]!
}

/**
 * 19 类可修 fixture（票据 §验收锚 1）。
 *
 * 断言分两层：
 * - 期望字符串 = jsonrepair@3.15.0 实际输出逐字节锁定（依赖版本已锁，输出确定性）；
 * - JSON.parse 语义层 = 输出确为合法 JSON 且语义正确（修复的最终承诺）。
 */
describe('19 类可修清单逐类 fixture（验收 1）', () => {
  it('1 未引号键：加引号，未改动区域空白原样保留', async () => {
    const outcome = await repairJson('{\n  name: "John"\n}')
    expectOk(outcome)
    expect(outcome.value).toBe('{\n  "name": "John"\n}')
    expect(JSON.parse(outcome.value)).toEqual({ name: 'John' })
  })

  it('2 缺失转义：字符串内裸换行补 \\n 转义', async () => {
    const outcome = await repairJson('{"text": "first line\nsecond line"}')
    expectOk(outcome)
    expect(outcome.value).toBe('{"text": "first line\\nsecond line"}')
    expect(JSON.parse(outcome.value)).toEqual({ text: 'first line\nsecond line' })
  })

  it('3 缺失逗号：相邻成员间补逗号', async () => {
    const outcome = await repairJson('{"a": "1" "b": "2"}')
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": "1", "b": "2"}')
    expect(JSON.parse(outcome.value)).toEqual({ a: '1', b: '2' })
  })

  it('4 缺失闭括号：对象与数组括号补全', async () => {
    const outcome = await repairJson('{"a": [1, 2')
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": [1, 2]}')
    expect(JSON.parse(outcome.value)).toEqual({ a: [1, 2] })
  })

  it('5 截断补全：半截对象补齐闭界', async () => {
    const outcome = await repairJson('{"id": 1, "name": "John"')
    expectOk(outcome)
    expect(outcome.value).toBe('{"id": 1, "name": "John"}')
    expect(JSON.parse(outcome.value)).toEqual({ id: 1, name: 'John' })
  })

  it('6 单引号 → 双引号', async () => {
    const outcome = await repairJson("{'a': 'b'}")
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": "b"}')
    expect(JSON.parse(outcome.value)).toEqual({ a: 'b' })
  })

  it('7 特殊引号 “ ” 统一为双引号', async () => {
    const outcome = await repairJson('{"a": \u201cb\u201d}')
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": "b"}')
    expect(JSON.parse(outcome.value)).toEqual({ a: 'b' })
  })

  it('8 特殊空白：不间断空格 → 常规空格', async () => {
    const outcome = await repairJson('{"a":\u00A0"b"}')
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": "b"}')
    expect(JSON.parse(outcome.value)).toEqual({ a: 'b' })
  })

  it('9 Python 常量 None/True/False → null/true/false', async () => {
    const outcome = await repairJson('{"a": None, "b": True, "c": False}')
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": null, "b": true, "c": false}')
    expect(JSON.parse(outcome.value)).toEqual({ a: null, b: true, c: false })
  })

  it('10 尾逗号：剥离', async () => {
    const outcome = await repairJson('{"a": 1, "b": 2,}')
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": 1, "b": 2}')
    expect(JSON.parse(outcome.value)).toEqual({ a: 1, b: 2 })
  })

  it('11 注释：剥离 /* */ 块注释与 // 行注释', async () => {
    const outcome = await repairJson('{/*c*/"a": 1 // tail\n}')
    expectOk(outcome)
    expect(JSON.parse(outcome.value)).toEqual({ a: 1 })
  })

  it('12 ```json 围栏：剥离 Markdown 包裹', async () => {
    const outcome = await repairJson('```json\n{"a": 1}\n```')
    expectOk(outcome)
    expect(JSON.parse(outcome.value)).toEqual({ a: 1 })
  })

  it('13 数组/对象省略号：剥离 … 项', async () => {
    const outcome = await repairJson('{"a": [1, 2, 3, ...]}')
    expectOk(outcome)
    expect(JSON.parse(outcome.value)).toEqual({ a: [1, 2, 3] })
  })

  it('14 JSONP 包装：剥出 callback(...) 内层 JSON', async () => {
    const outcome = await repairJson('callback({"a": 1})')
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": 1}')
    expect(JSON.parse(outcome.value)).toEqual({ a: 1 })
  })

  it('15 转义串剥离：剥掉整篇转义外壳', async () => {
    const outcome = await repairJson('{\\"a\\": 1}')
    expectOk(outcome)
    expect(outcome.value).toBe('{"a": 1}')
    expect(JSON.parse(outcome.value)).toEqual({ a: 1 })
  })

  it('16 MongoDB 类型：ISODate → 字符串、NumberLong → 数值', async () => {
    const outcome = await repairJson(
      '{"ts": ISODate("2012-12-19T06:01:17.171Z"), "n": NumberLong(2)}',
    )
    expectOk(outcome)
    expect(JSON.parse(outcome.value)).toEqual({ ts: '2012-12-19T06:01:17.171Z', n: 2 })
  })

  it('17 字符串 + 拼接：合并为单字符串', async () => {
    const outcome = await repairJson('{"a": "long text" + "more text"}')
    expectOk(outcome)
    expect(JSON.parse(outcome.value)).toEqual({ a: 'long textmore text' })
  })

  it('18 NDJSON → JSON 数组', async () => {
    const outcome = await repairJson('{"id": 1}\n{"id": 2}')
    expectOk(outcome)
    expect(JSON.parse(outcome.value)).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('19 合法 JSON 直通：逐字节原样返回（视为修复成功）', async () => {
    const compact = await repairJson('{"a": 1}')
    expectOk(compact)
    expect(compact.value).toBe('{"a": 1}')

    // 已合法的空白排版不重排（修复即规范化 ≠ 重排版；排版导流 json-formatter）
    const spaced = await repairJson('{ "a" : 1, "b": [1,  2] }')
    expectOk(spaced)
    expect(spaced.value).toBe('{ "a" : 1, "b": [1,  2] }')
  })
})

describe('不可修复样例报错：JSONRepairError 口径（验收 2）', () => {
  it('}{ → repair 错误，带库原始消息与字符位置', async () => {
    const error = errorOf(await repairJson('}{'))
    expect(error.code).toBe('repair')
    expect(error.message).toBeTruthy()
    expect(error.position).toBe(2)
  })

  it('多个顶层标量 1 2 3 → repair 错误，position 指向第二个标量', async () => {
    const error = errorOf(await repairJson('1 2 3'))
    expect(error.code).toBe('repair')
    expect(error.position).toBe(2)
  })

  it('完整值后跟半截对象 {"a":1} { → repair 错误，position 指向 {', async () => {
    const error = errorOf(await repairJson('{"a":1} {'))
    expect(error.code).toBe('repair')
    expect(error.position).toBe(8)
  })

  it('裸词不是错误：@ 这类符号串被修成字符串（库即规格，不误报）', async () => {
    const outcome = await repairJson('::::')
    expectOk(outcome)
    expect(JSON.parse(outcome.value)).toBe('::::')
  })
})

describe('1 MiB 粘贴边界（验收 3）', () => {
  it('上限常量为 1 MiB，UTF-8 字节按码点累计', () => {
    expect(PASTE_MAX_BYTES).toBe(1024 * 1024)
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('汉')).toBe(3) // CJK 每字 3 字节
    expect(utf8ByteLength('🔐')).toBe(4) // 增补平面 emoji 4 字节
  })

  it('恰好 1 MiB 不超限，超一字节报错；多字节字符按字节计', () => {
    expect(isPasteWithinLimit('a'.repeat(PASTE_MAX_BYTES))).toBe(true)
    expect(isPasteWithinLimit(`${'a'.repeat(PASTE_MAX_BYTES)}!`)).toBe(false)
    expect(isPasteWithinLimit('汉'.repeat(Math.floor(PASTE_MAX_BYTES / 3)))).toBe(true) // 349525 × 3 = 1048575 字节，不超限
    expect(isPasteWithinLimit('汉'.repeat(Math.ceil(PASTE_MAX_BYTES / 3)))).toBe(false) // 349526 × 3 = 1048578 字节，超限
  })

  it('恰好 1 MiB 的合法 JSON 全链路修复成功；超一字节拒绝且不触库', async () => {
    // [" + a…a + "] = 4 字节外壳 + (N-4) 字节内容 = 恰好 N
    const exact = `["${'a'.repeat(PASTE_MAX_BYTES - 4)}"]`
    expect(utf8ByteLength(exact)).toBe(PASTE_MAX_BYTES)
    const okOutcome = await repairJson(exact)
    expectOk(okOutcome)
    expect(okOutcome.value).toBe(exact)

    const over = `["${'a'.repeat(PASTE_MAX_BYTES - 3)}"]`
    expect(utf8ByteLength(over)).toBe(PASTE_MAX_BYTES + 1)
    const error = errorOf(await repairJson(over))
    expect(error.code).toBe('pasteTooLarge')
  })
})

describe('空输入与错误定位（验收 2 的呈现前提）', () => {
  it('空白输入报 empty，不让库抛 Unexpected end', async () => {
    expect(errorOf(await repairJson('')).code).toBe('empty')
    expect(errorOf(await repairJson('   \n  ')).code).toBe('empty')
  })

  it('positionToLineColumn：字符位置 → 1 起始行/列，越界夹紧', () => {
    expect(positionToLineColumn('abc', 0)).toEqual({ line: 1, column: 1 })
    expect(positionToLineColumn('abc\ndef', 3)).toEqual({ line: 1, column: 4 })
    expect(positionToLineColumn('abc\ndef', 4)).toEqual({ line: 2, column: 1 })
    expect(positionToLineColumn('abc\ndef', 6)).toEqual({ line: 2, column: 3 })
    expect(positionToLineColumn('abc', 99)).toEqual({ line: 1, column: 4 })
    expect(positionToLineColumn('a\r\nb', 3)).toEqual({ line: 2, column: 1 }) // CRLF：\r 不计入列
  })
})

describe('交互常量锚（组件层契约）', () => {
  it('实时防抖 300ms；下载文件名 repaired.json', () => {
    expect(DEBOUNCE_MS).toBe(300)
    expect(DOWNLOAD_FILENAME).toBe('repaired.json')
  })
})
