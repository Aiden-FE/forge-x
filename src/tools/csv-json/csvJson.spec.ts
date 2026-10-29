import { describe, expect, it } from 'vitest'
import {
  FILE_MAX_BYTES,
  PASTE_MAX_BYTES,
  csvToJson,
  csvToJsonStreaming,
  detectDelimiter,
  detectNewline,
  isFileWithinLimit,
  isPasteWithinLimit,
  jsonToCsv,
  locateOffset,
  utf8ByteLength,
} from './csvJson'
import type { CsvJsonError } from './csvJson'

function expectOk<T extends { ok: boolean }>(outcome: T): asserts outcome is T & { ok: true } {
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
}

function errorsOf(outcome: { ok: boolean; errors?: CsvJsonError[] }): CsvJsonError[] {
  expect(outcome.ok).toBe(false)
  return outcome.errors ?? []
}

async function jsonOf(text: string, options?: Parameters<typeof csvToJson>[1]): Promise<unknown> {
  const outcome = await csvToJson(text, options)
  expectOk(outcome)
  return JSON.parse((outcome as { json: string }).json)
}

describe('CSV→JSON 表头形态', () => {
  it('默认首行作表头，输出对象数组（缩进 2 格式化）', async () => {
    const outcome = await csvToJson('name,age\nAlice,30')
    expectOk(outcome)
    expect((outcome as { json: string }).json).toBe(
      '[\n  {\n    "name": "Alice",\n    "age": "30"\n  }\n]',
    )
  })

  it('「无表头行」输出数组的数组', async () => {
    const records = await jsonOf('name,age\nAlice,30', { header: false })
    expect(records).toEqual([['name', 'age'], ['Alice', '30']])
  })

  it('短行缺失字段补空字符串', async () => {
    const records = await jsonOf('a,b\n1', { header: true })
    expect(records).toEqual([{ a: '1', b: '' }])
  })

  it('空输入返回 empty 错误（UI 呈现空状态，不当作解析失败展示）', async () => {
    const errors = errorsOf(await csvToJson('  \n \t'))
    expect(errors[0]?.code).toBe('empty')
  })
})

describe('RFC 4180 严格解析', () => {
  it('引号内逗号不切列', async () => {
    const records = await jsonOf('a,b\n1,"x,y"')
    expect(records).toEqual([{ a: '1', b: 'x,y' }])
  })

  it('引号内换行合法（单字段跨两行）', async () => {
    const records = await jsonOf('a,b\n"l1\nl2",2')
    expect(records).toEqual([{ a: 'l1\nl2', b: '2' }])
  })

  it('"" 为转义引号', async () => {
    const records = await jsonOf('quote\n"say ""hi"""')
    expect(records).toEqual([{ quote: 'say "hi"' }])
  })

  it('CRLF 行分隔正确', async () => {
    const records = await jsonOf('a,b\r\n1,2\r\n3,4')
    expect(records).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })

  it('裸 CR 行分隔正确', async () => {
    const records = await jsonOf('a,b\r1,2\r3,4')
    expect(records).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })

  it('BOM 自动剥离（含 BOM 首列名不带 \\uFEFF）', async () => {
    const records = await jsonOf('\uFEFFname,age\nAlice,30')
    expect(records).toEqual([{ name: 'Alice', age: '30' }])
  })

  it('空行跳过', async () => {
    const records = await jsonOf('a,b\n1,2\n\n\n3,4')
    expect(records).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })

  it('未闭合引号：结构化错误定位到引号所在行列', async () => {
    const errors = errorsOf(await csvToJson('a,b\nx,"unclosed'))
    expect(errors[0]).toMatchObject({ code: 'unclosedQuote', line: 2, column: 3 })
  })

  it('跨行字段之后的未闭合引号：物理行号正确', async () => {
    const errors = errorsOf(await csvToJson('a,b\n"l1\nl2",v\n"oops'))
    expect(errors[0]).toMatchObject({ code: 'unclosedQuote', line: 4, column: 1 })
  })
})

describe('值无损性', () => {
  it('一律字符串：007 / 身份证号 / 3.10 不变形', async () => {
    const records = await jsonOf('code,id,price\n007,11010519491231002X,3.10')
    expect(records).toEqual([{ code: '007', id: '11010519491231002X', price: '3.10' }])
  })

  it('空字段输出空字符串', async () => {
    const records = await jsonOf('a,b\n1,')
    expect(records).toEqual([{ a: '1', b: '' }])
  })
})

describe('分隔符：自动检测与手动覆盖', () => {
  it('自动检测 , ; \\t | 空格', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a;b\n1;2')).toBe(';')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(detectDelimiter('a|b\n1|2')).toBe('|')
    expect(detectDelimiter('a b\n1 2')).toBe(' ')
    expect(detectDelimiter('\uFEFFa,b\n1,2')).toBe(',')
    expect(detectDelimiter('')).toBe(',')
  })

  it('引号内的分隔符不参与检测计数', () => {
    expect(detectDelimiter('a,b\n"x,y",1')).toBe(',')
  })

  it('TSV 按制表符解析', async () => {
    const records = await jsonOf('name\tage\nAlice\t30')
    expect(records).toEqual([{ name: 'Alice', age: '30' }])
  })

  it('手动覆盖优先于自动检测', async () => {
    const records = await jsonOf('a\tb\n1\t2', { delimiter: ',' })
    expect(records).toEqual([{ 'a\tb': '1\t2' }])
  })
})

describe('JSON→CSV', () => {
  it('列集 = 对象 key 并集（按首次出现序），缺失 key 补空', async () => {
    const outcome = await jsonToCsv('[{"a":"1","b":"2"},{"c":"3","b":"4"}]')
    expectOk(outcome)
    expect((outcome as { csv: string }).csv).toBe('a,b,c\r\n1,2,\r\n,4,3')
  })

  it('null → 空字段', async () => {
    const outcome = await jsonToCsv('[{"a":null,"b":"x"}]')
    expectOk(outcome)
    expect((outcome as { csv: string }).csv).toBe('a,b\r\n,x')
  })

  it('数组的数组形态：无表头行，短行补空', async () => {
    const outcome = await jsonToCsv('[["1","2"],["3"]]')
    expectOk(outcome)
    expect((outcome as { csv: string }).csv).toBe('1,2\r\n3,')
  })

  it('输出引号规则：含逗号/引号/换行的字段加引号并转义，其余最小引号', async () => {
    const outcome = await jsonToCsv(
      '[{"v":"plain"},{"v":"x,y"},{"v":"say \\"hi\\""},{"v":"l1\\nl2"}]',
    )
    expectOk(outcome)
    expect((outcome as { csv: string }).csv).toBe(
      'v\r\nplain\r\n"x,y"\r\n"say ""hi"""\r\n"l1\nl2"',
    )
  })

  it('默认 CRLF 行结尾，可指定 \\n 与输出分隔符（TSV 生成）', async () => {
    const lf = await jsonToCsv('[{"a":"1","b":"2"}]', { newline: '\n' })
    expectOk(lf)
    expect((lf as { csv: string }).csv).toBe('a,b\n1,2')

    const tsv = await jsonToCsv('[["1","2"]]', { delimiter: '\t', newline: '\n' })
    expectOk(tsv)
    expect((tsv as { csv: string }).csv).toBe('1\t2')
  })

  it('顶层数组之外的输入 → notArray', async () => {
    const errors = errorsOf(await jsonToCsv('{"a":1}'))
    expect(errors[0]?.code).toBe('notArray')
  })

  it('顶层数组里的原始值 → invalidRow 带行号', async () => {
    const errors = errorsOf(await jsonToCsv('[{"a":"1"},"oops",null]'))
    expect(errors).toEqual([
      { code: 'invalidRow', row: 2 },
      { code: 'invalidRow', row: 3 },
    ])
  })

  it('嵌套对象/数组 → nestedValue 定位 key 与行，不自动展平', async () => {
    const errors = errorsOf(
      await jsonToCsv('[{"a":"1"},{"a":{"deep":1}},{"a":["x"],"b":[1]}]'),
    )
    expect(errors).toEqual([
      { code: 'nestedValue', key: 'a', row: 2 },
      { code: 'nestedValue', key: 'a', row: 3 },
      { code: 'nestedValue', key: 'b', row: 3 },
    ])
  })

  it('数组形态中的嵌套元素 → nestedValue key 为列号', async () => {
    const errors = errorsOf(await jsonToCsv('[["1",["nested"]]]'))
    expect(errors).toEqual([{ code: 'nestedValue', key: '2', row: 1 }])
  })

  it('JSON 语法错误 → jsonParse 带行列', async () => {
    const errors = errorsOf(await jsonToCsv('[\n  {"a":1}\n  {"b":2}\n]'))
    expect(errors[0]).toMatchObject({ code: 'jsonParse', line: 3, column: 3 })
  })
})

describe('round-trip 字节级一致', () => {
  it('CRLF 文件：CSV→JSON→CSV 与原文字节级一致', async () => {
    const csv = 'name,note,code\r\nalice,"say ""hi""",007\r\nbob,"l1\nl2",3.10\r\n'
    const parsed = await csvToJson(csv, { header: true })
    expectOk(parsed)
    const back = await jsonToCsv((parsed as { json: string }).json, {
      newline: detectNewline(csv),
      ensureTrailingNewline: true,
    })
    expectOk(back)
    expect((back as { csv: string }).csv).toBe(csv)
  })

  it('LF 文件：round-trip 一致', async () => {
    const csv = 'a,b\n1,x\n2,"y,z"\n'
    const parsed = await csvToJson(csv, { header: true })
    expectOk(parsed)
    const back = await jsonToCsv((parsed as { json: string }).json, {
      newline: detectNewline(csv),
      ensureTrailingNewline: true,
    })
    expectOk(back)
    expect((back as { csv: string }).csv).toBe(csv)
  })

  it('无表头形态：CSV→JSON→CSV 一致', async () => {
    const csv = '1,2\n"3,5",4\n'
    const parsed = await csvToJson(csv, { header: false })
    expectOk(parsed)
    const back = await jsonToCsv((parsed as { json: string }).json, {
      newline: detectNewline(csv),
      ensureTrailingNewline: true,
    })
    expectOk(back)
    expect((back as { csv: string }).csv).toBe(csv)
  })
})

describe('Worker 分块流式解析', () => {
  it('分块解析结果与单次解析一致，且进度事件逐步推进', async () => {
    const row = 'code,price,note\n'
    const body = Array.from({ length: 5000 }, (_, i) => `007${i},3.10,"l1\nl${i}"\n`).join('')
    const text = row + body

    const progress: Array<{ bytes: number; total: number }> = []
    const streamed = await csvToJsonStreaming(
      text,
      { header: true, chunkSize: 4096 },
      (bytes, total) => {
        progress.push({ bytes, total })
      },
    )
    const direct = await csvToJson(text, { header: true })
    expect(streamed).toEqual(direct)
    expect(progress.length).toBeGreaterThan(1)
    expect(progress[0]).toEqual({ bytes: expect.any(Number), total: text.length })
    expect(progress[progress.length - 1]?.total).toBe(text.length)
  })

  it('分块路径同样产出未闭合引号的行级定位', async () => {
    const text = 'a,b\n1,2\nx,"unclosed'
    const errors = errorsOf(await csvToJsonStreaming(text, { header: true }))
    expect(errors[0]).toMatchObject({ code: 'unclosedQuote', line: 3, column: 3 })
  })
})

describe('大小上限', () => {
  it('常量：粘贴 1 MiB、文件 10 MiB', () => {
    expect(PASTE_MAX_BYTES).toBe(1024 * 1024)
    expect(FILE_MAX_BYTES).toBe(10 * 1024 * 1024)
  })

  it('字节数与粘贴上限判定（边界含等于）', () => {
    const oneMiBAscii = 'a'.repeat(1024 * 1024)
    expect(utf8ByteLength(oneMiBAscii)).toBe(1024 * 1024)
    expect(isPasteWithinLimit(oneMiBAscii)).toBe(true)
    expect(isPasteWithinLimit(oneMiBAscii + 'b')).toBe(false)
    // 多字节字符按 UTF-8 计数
    expect(utf8ByteLength('中')).toBe(3)
    expect(isPasteWithinLimit('中'.repeat(1024 * 1024))).toBe(false)
  })

  it('文件上限判定（按字节）', () => {
    expect(isFileWithinLimit(FILE_MAX_BYTES)).toBe(true)
    expect(isFileWithinLimit(FILE_MAX_BYTES + 1)).toBe(false)
    expect(isFileWithinLimit(0)).toBe(true)
  })
})

describe('位置与换行工具', () => {
  it('detectNewline 识别 CRLF / LF / CR，无换行回退 LF', () => {
    expect(detectNewline('a\r\nb')).toBe('\r\n')
    expect(detectNewline('a\nb')).toBe('\n')
    expect(detectNewline('a\rb')).toBe('\r')
    expect(detectNewline('abc')).toBe('\n')
    expect(detectNewline('')).toBe('\n')
  })

  it('locateOffset 把字符偏移换算为 1-based 行列', () => {
    expect(locateOffset('ab\ncd', 0)).toEqual({ line: 1, column: 1 })
    expect(locateOffset('ab\ncd', 3)).toEqual({ line: 2, column: 1 })
    expect(locateOffset('ab\ncd', 5)).toEqual({ line: 2, column: 3 })
    expect(locateOffset('a\r\nb', 3)).toEqual({ line: 2, column: 1 })
    expect(locateOffset('a\rb', 2)).toEqual({ line: 2, column: 1 })
  })
})
