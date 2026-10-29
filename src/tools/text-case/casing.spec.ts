import { describe, expect, it } from 'vitest'
import {
  CASE_STYLES,
  MAX_INPUT_BYTES,
  STOPWORDS,
  convertCase,
  convertLine,
  splitWords,
  truncateInput,
} from './casing'
import type { CaseStyle } from './casing'

function texts(line: string): string[] {
  return splitWords(line).map((w) => w.text)
}

function kinds(line: string): string[] {
  return splitWords(line).map((w) => w.kind)
}

function convertAll(input: string): Record<CaseStyle, string> {
  return {
    camel: convertCase(input, 'camel'),
    pascal: convertCase(input, 'pascal'),
    snake: convertCase(input, 'snake'),
    constant: convertCase(input, 'constant'),
    kebab: convertCase(input, 'kebab'),
    title: convertCase(input, 'title'),
    sentence: convertCase(input, 'sentence'),
  }
}

describe('样式集', () => {
  it('恰好七种样式', () => {
    expect(CASE_STYLES).toEqual(['camel', 'pascal', 'snake', 'constant', 'kebab', 'title', 'sentence'])
  })
})

describe('切词：词边界语义', () => {
  it('分隔符（空白/标点/下划线/连字符）一律切词', () => {
    expect(texts('foo_bar')).toEqual(['foo', 'bar'])
    expect(texts('foo-bar')).toEqual(['foo', 'bar'])
    expect(texts('foo bar')).toEqual(['foo', 'bar'])
    expect(texts('foo.bar')).toEqual(['foo', 'bar'])
    expect(texts('__foo--bar,,baz__')).toEqual(['foo', 'bar', 'baz'])
  })

  it('缩写词组：连续大写整体切分，不拆散', () => {
    expect(texts('HTTPServer')).toEqual(['HTTP', 'Server'])
    expect(texts('parseHTTPResponse')).toEqual(['parse', 'HTTP', 'Response'])
    expect(texts('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request'])
    expect(texts('getUserID')).toEqual(['get', 'User', 'ID'])
    expect(texts('ABC')).toEqual(['ABC'])
  })

  it('驼峰：小写转大写处切词', () => {
    expect(texts('getUserId')).toEqual(['get', 'User', 'Id'])
  })

  it('数字并入前词；纯数字自成词', () => {
    expect(texts('abc123')).toEqual(['abc123'])
    expect(texts('abc 123')).toEqual(['abc', '123'])
    expect(texts('version2Update')).toEqual(['version2', 'Update'])
    expect(texts('v2 beta')).toEqual(['v2', 'beta'])
    expect(texts('HTTP2Server')).toEqual(['HTTP2', 'Server'])
  })

  it('中西文切换处为词边界；CJK 连续段为不透明词', () => {
    expect(texts('用户ID列表')).toEqual(['用户', 'ID', '列表'])
    expect(kinds('用户ID列表')).toEqual(['opaque', 'caseable', 'opaque'])
    expect(texts('api 接口')).toEqual(['api', '接口'])
    expect(texts('版本2更新')).toEqual(['版本', '2', '更新'])
  })

  it('重音拉丁字母按词字符处理', () => {
    expect(texts('café')).toEqual(['café'])
  })
})

describe('七样式端到端：HTTPServer', () => {
  const result = convertAll('HTTPServer')
  it.each([
    ['camel', 'httpServer'],
    ['pascal', 'HttpServer'],
    ['snake', 'http_server'],
    ['constant', 'HTTP_SERVER'],
    ['kebab', 'http-server'],
    ['title', 'Http Server'],
    ['sentence', 'Http server'],
  ] as Array<[CaseStyle, string]>)('%s → %s', (style, expected) => {
    expect(result[style]).toBe(expected)
  })
})

describe('七样式端到端：中西文混排 api 接口 doc', () => {
  const result = convertAll('api 接口 doc')
  it.each([
    ['camel', 'api接口Doc'],
    ['pascal', 'Api接口Doc'],
    ['snake', 'api_接口_doc'],
    ['constant', 'API_接口_DOC'],
    ['kebab', 'api-接口-doc'],
    ['title', 'Api 接口 Doc'],
    ['sentence', 'Api 接口 doc'],
  ] as Array<[CaseStyle, string]>)('%s → %s', (style, expected) => {
    expect(result[style]).toBe(expected)
  })

  it('CJK 词在 camel/pascal 中与拉丁词无缝拼接', () => {
    expect(convertCase('api 接口', 'camel')).toBe('api接口')
  })
})

describe('Title Case 虚词', () => {
  it('非首尾虚词小写', () => {
    expect(convertCase('the art of war', 'title')).toBe('The Art of War')
    expect(convertCase('the lord of the rings', 'title')).toBe('The Lord of the Rings')
    expect(convertCase('war and peace', 'title')).toBe('War and Peace')
    expect(convertCase('a tale of two cities', 'title')).toBe('A Tale of Two Cities')
    expect(convertCase('the catcher in the rye', 'title')).toBe('The Catcher in the Rye')
  })

  it('首尾位置虚词照常大写', () => {
    expect(convertCase('of the', 'title')).toBe('Of The')
    expect(convertCase('the lord of the', 'title')).toBe('The Lord of The')
  })

  it('虚词表规模 20–30 词', () => {
    expect(STOPWORDS.length).toBeGreaterThanOrEqual(20)
    expect(STOPWORDS.length).toBeLessThanOrEqual(30)
    for (const word of ['a', 'an', 'the', 'of', 'and', 'in', 'to']) {
      expect(STOPWORDS, `缺虚词 ${word}`).toContain(word)
    }
  })
})

describe('数字并入', () => {
  it('abc123 单 token：snake 不加下划线', () => {
    expect(convertCase('abc123', 'snake')).toBe('abc123')
  })
  it('v2 beta → [v2, beta]', () => {
    expect(convertCase('v2 beta', 'snake')).toBe('v2_beta')
    expect(convertCase('v2 beta', 'camel')).toBe('v2Beta')
  })
  it('version2Update 保持单驼峰', () => {
    expect(convertCase('version2Update', 'camel')).toBe('version2Update')
    expect(convertCase('version2Update', 'snake')).toBe('version2_update')
  })
})

describe('sentence case：行级定义', () => {
  it('逐行独立：每行第一个拉丁字母大写，行内其余小写', () => {
    expect(convertCase('hello world\nFOO BAR', 'sentence')).toBe('Hello world\nFoo bar')
    expect(convertCase('ONE\ntwo\nTHREE', 'sentence')).toBe('One\nTwo\nThree')
  })
  it('不做句内多句识别', () => {
    expect(convertCase('hello. WORLD. ok', 'sentence')).toBe('Hello world ok')
  })
  it('行首是数字/CJK 时取该行第一个拉丁字母', () => {
    expect(convertCase('123 abc def', 'sentence')).toBe('123 Abc def')
    expect(convertCase('接口 api doc', 'sentence')).toBe('接口 Api doc')
  })
  it('camel 标识符按词展开', () => {
    expect(convertCase('getUserID', 'sentence')).toBe('Get user id')
  })
})

describe('逐行保空白与分隔符折叠', () => {
  it('行首尾空白原样保留', () => {
    expect(convertCase('  foo_bar  ', 'snake')).toBe('  foo_bar  ')
    expect(convertCase('\tfoo bar\t', 'snake')).toBe('\tfoo_bar\t')
  })

  it('空行与纯符号行原样保留（所有样式）', () => {
    for (const style of CASE_STYLES) {
      expect(convertCase('   ', style), `style=${style}`).toBe('   ')
      expect(convertCase('---', style), `style=${style}`).toBe('---')
      expect(convertCase('  ---  ', style), `style=${style}`).toBe('  ---  ')
    }
  })

  it('连续分隔符折叠、首尾分隔符丢弃', () => {
    expect(convertCase('_foo__bar_', 'snake')).toBe('foo_bar')
    expect(convertCase('  "hello, world!"  ', 'snake')).toBe('  hello_world  ')
    expect(convertCase('foo, bar', 'snake')).toBe('foo_bar')
    expect(convertCase('foo\tbar', 'snake')).toBe('foo_bar')
  })

  it('多行结构：空行、缩进、尾换行保留', () => {
    expect(convertCase('  a b\n\nc d\n', 'snake')).toBe('  a_b\n\nc_d\n')
  })

  it('CRLF 的 \\r 作为行尾空白保留', () => {
    expect(convertCase('a b\r\n', 'snake')).toBe('a_b\r\n')
  })
})

describe('CJK 透传', () => {
  it('CJK 不参与大小写操作，原样透传', () => {
    expect(convertCase('用户ID列表', 'constant')).toBe('用户_ID_列表')
    expect(convertCase('用户 ID 列表', 'snake')).toBe('用户_id_列表')
  })

  it('所有样式下 CJK 内容不变', () => {
    for (const style of CASE_STYLES) {
      expect(convertCase('用户ID', style), `style=${style}`).toContain('用户')
    }
  })
})

describe('JS 原生大小写语义（无 locale 选项）', () => {
  it('ß 大写为 SS', () => {
    expect(convertCase('straße', 'constant')).toBe('STRASSE')
  })
  it('大写后小写回落', () => {
    expect(convertCase('STRASSE', 'sentence')).toBe('Strasse')
  })
  it('重音字母保留', () => {
    expect(convertCase('café', 'snake')).toBe('café')
  })
})

describe('空输入', () => {
  it('空字符串 → 空字符串（所有样式）', () => {
    for (const style of CASE_STYLES) {
      expect(convertCase('', style), `style=${style}`).toBe('')
    }
  })
})

describe('往返稳定性', () => {
  it('camel → snake → camel 稳定', () => {
    expect(convertCase(convertCase('httpServer', 'snake'), 'camel')).toBe('httpServer')
  })

  it('多轮链式转换不崩且形态符合预期', () => {
    let text = 'HTTPServer v2'
    for (const style of CASE_STYLES) {
      text = convertCase(text, style)
      expect(text, `style=${style}`).toBeTruthy()
    }
    expect(text).toBe('Http server v2') // 样式链末位是 sentence：首字母大写、其余小写
  })

  it('Title / sentence 幂等', () => {
    expect(convertCase('The Art of War', 'title')).toBe('The Art of War')
    expect(convertCase('Hello world', 'sentence')).toBe('Hello world')
  })

  it('多轮转换后 CJK 始终原样', () => {
    let text = '用户 ID 列表'
    for (const style of CASE_STYLES) {
      text = convertCase(text, style)
    }
    expect(text).toContain('用户')
    expect(text).toContain('列表')
  })
})

describe('convertLine', () => {
  it('等价于 convertCase 的单行行为', () => {
    expect(convertLine('foo bar', 'snake')).toBe('foo_bar')
    expect(convertLine('', 'title')).toBe('')
  })
})

describe('truncateInput：1 MiB 上限', () => {
  it('上限为 1 MiB（1048576 字节）', () => {
    expect(MAX_INPUT_BYTES).toBe(1024 * 1024)
  })

  it('短输入不截断', () => {
    expect(truncateInput('hello')).toEqual({ text: 'hello', truncated: false })
  })

  it('恰好达到上限不截断', () => {
    expect(truncateInput('a'.repeat(MAX_INPUT_BYTES))).toEqual({
      text: 'a'.repeat(MAX_INPUT_BYTES),
      truncated: false,
    })
  })

  it('ASCII 超长按字节截断', () => {
    const result = truncateInput('a'.repeat(MAX_INPUT_BYTES + 1))
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBe(MAX_INPUT_BYTES)
  })

  it('多字节字符恰好填满不截断', () => {
    const input = 'é'.repeat(MAX_INPUT_BYTES / 2) // é 为 2 字节
    expect(truncateInput(input)).toEqual({ text: input, truncated: false })
  })

  it('多字节截断按码点对齐，不产生 replacement 字符', () => {
    const result = truncateInput('é'.repeat(MAX_INPUT_BYTES / 2 + 1))
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBe(MAX_INPUT_BYTES / 2)
    expect(Buffer.byteLength(result.text, 'utf8')).toBe(MAX_INPUT_BYTES)
    expect(result.text.includes('\uFFFD')).toBe(false)
  })
})
