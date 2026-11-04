// @vitest-environment happy-dom
/**
 * XML↔JSON 互转单测（happy-dom：良构校验依赖浏览器原生 DOMParser）。
 * 覆盖票据 05 验收锚：
 * 1. 属性 + 重复标签 + CDATA + 实体语义 round-trip（语义等价非字节级）；
 * 2. `007` / `1.00` 值不变形（值一律字符串无损）；
 * 3. it-tools 同款默认样例 `<a x="1.234" y="It's"/>` 转换对照；
 * 4. 良构错误行/列容忍提取（纯函数）+ DOMParser 集成；JSON 侧位置错误呈现；
 * 5. 1 MiB 恰好不超限 / 超一字节报错；
 * 6. 两方向代表性 fixture（数组、嵌套、混合内容声明限制、注释/声明/DOCTYPE 丢弃）。
 */
import { describe, expect, it } from 'vitest'
import {
  PASTE_MAX_BYTES,
  checkXmlWellFormed,
  convert,
  isPasteWithinLimit,
  jsonToXml,
  locateJsonError,
  locateXmlError,
  utf8ByteLength,
  xmlToJson,
} from './xmlJson'
import type { XmlWellFormednessChecker } from './xmlJson'
import locale from '@/locales/tools/xml-json'

/**
 * happy-dom 的 XML 解析器缺口：不支持 CDATA 节与 DOCTYPE 内部子集（生产权威
 * Chromium DOMParser 均支持）。含这两类构件的 fixture 注入「恒过」替身绕过
 * 前置校验、直达 fast-xml-parser 映射管线；良构校验本身用 happy-dom 支持的
 * 用例在下方独立单测（浏览器行为差异已在 xmlJson.ts 的容忍提取中处理）。
 */
const skipWellFormedCheck: XmlWellFormednessChecker = () => ({ ok: true, message: '' })

async function okXmlToJson(xml: string, checker?: XmlWellFormednessChecker): Promise<string> {
  const result = await xmlToJson(xml, checker ? { checkWellFormed: checker } : {})
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`)
  return result.value
}

async function okJsonToXml(json: string): Promise<string> {
  const result = await jsonToXml(json)
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`)
  return result.value
}

/** 属性 + 重复标签 + CDATA + 实体 + 命名空间前缀 + 空元素 + 注释/声明（丢失项）。 */
const RICH_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<library id="007" xmlns:dc="urn:dc">',
  '  <!-- 注释：已声明的丢失项 -->',
  '  <name>A &amp; B &lt;tag&gt; 书目</name>',
  '  <item>007</item>',
  '  <item>1.00</item>',
  '  <dc:publisher>O&apos;Reilly</dc:publisher>',
  '  <raw><![CDATA[<raw & content>]]></raw>',
  '  <empty/>',
  '</library>',
].join('\n')

describe('XML→JSON：映射约定速览表逐条（验收 3 / 6a）', () => {
  it('it-tools 同款默认样例：<a x="1.234" y="It\'s"/> → {"a":{"@_x":"1.234","@_y":"It\'s"}}', async () => {
    const json = await okXmlToJson(`<a x="1.234" y="It's"/>`)
    expect(json).toBe(JSON.stringify({ a: { '@_x': '1.234', '@_y': "It's" } }, null, 2))
  })

  it('属性 @_ 前缀、文本 #text、重复标签→数组、CDATA→#cdata、命名空间前缀原样保留', async () => {
    const parsed = JSON.parse(await okXmlToJson(RICH_XML, skipWellFormedCheck))
    expect(parsed).toEqual({
      library: {
        '@_id': '007',
        '@_xmlns:dc': 'urn:dc',
        name: 'A & B <tag> 书目',
        item: ['007', '1.00'],
        'dc:publisher': "O'Reilly",
        raw: { '#cdata': '<raw & content>' },
        empty: '',
      },
    })
  })

  it('注释 / XML 声明 / DOCTYPE / 处理指令全部丢弃（已声明的丢失项，无保留开关）', async () => {
    const xml = `${'<?xml version="1.0"?>'}<!DOCTYPE r [<!ENTITY e "v">]><r><!-- c --><?pi data?><a>1</a></r>`
    expect(JSON.parse(await okXmlToJson(xml, skipWellFormedCheck))).toEqual({ r: { a: '1' } })
  })
})

describe('值保真：007 / 1.00 不变形（验收 2）', () => {
  it('XML→JSON：标签值与属性值一律字符串（007 / 1.00 / 身份证号原样）', async () => {
    const xml = `<box zip="007" price="1.00"><code>007</code><price>1.00</price><id>110101199003077758</id></box>`
    const parsed = JSON.parse(await okXmlToJson(xml))
    expect(parsed.box['@_zip']).toBe('007')
    expect(parsed.box['@_price']).toBe('1.00')
    expect(parsed.box.code).toBe('007')
    expect(parsed.box.price).toBe('1.00')
    expect(parsed.box.id).toBe('110101199003077758')
    // 输出 JSON 文本中全部带引号（字符串形态，非数字字面量）
    const json = await okXmlToJson(xml)
    expect(json).toContain('"007"')
    expect(json).toContain('"1.00"')
  })

  it('JSON→XML：字符串值原样写出（zip="007"、<code>007</code>）', async () => {
    const xml = await okJsonToXml('{"box":{"@_zip":"007","code":"007","price":"1.00"}}')
    expect(xml).toContain('zip="007"')
    expect(xml).toContain('<code>007</code>')
    expect(xml).toContain('<price>1.00</price>')
  })
})

describe('语义保真 round-trip：XML→JSON→XML 语义等价（验收 1）', () => {
  it('rich fixture：reparse(rebuild(parse(x))) 与 parse(x) 深度相等（非字节级）', async () => {
    const json1 = await okXmlToJson(RICH_XML, skipWellFormedCheck)
    const xml2 = await okJsonToXml(json1)
    const json2 = await okXmlToJson(xml2, skipWellFormedCheck)
    expect(JSON.parse(json2)).toEqual(JSON.parse(json1))
  })

  it('实体语义还原：&amp;/&lt;/&apos; 解码进 JSON、构建时重新转义', async () => {
    const json1 = await okXmlToJson(RICH_XML, skipWellFormedCheck)
    expect(JSON.parse(json1).library.name).toBe('A & B <tag> 书目') // 解码后的语义值
    const xml2 = await okJsonToXml(json1)
    expect(xml2).toContain('A &amp; B &lt;tag&gt; 书目')
    expect(xml2).toContain("O&apos;Reilly")
  })

  it('CDATA 内容语义还原：重建为 CDATA 节，内部裸露 & < > 不转义', async () => {
    const xml2 = await okJsonToXml(await okXmlToJson(RICH_XML, skipWellFormedCheck))
    expect(xml2).toContain('<![CDATA[<raw & content>]]>')
  })

  it('混合内容：文本合并进 #text、顺序不保证（已声明限制），round-trip 仍语义等价', async () => {
    const parsed = JSON.parse(await okXmlToJson('<mix>Hello <b>world</b> tail</mix>'))
    expect(parsed).toEqual({ mix: { b: 'world', '#text': 'Hellotail' } })

    const xml2 = await okJsonToXml(JSON.stringify(parsed))
    // 文本不再位于子元素之间的原位置（顺序丢失如实呈现，不伪造保序）
    expect(xml2).not.toContain('Hello <b>world</b> tail')
    // 但语义 round-trip 等价性保持
    const json2 = await okXmlToJson(xml2)
    expect(JSON.parse(json2)).toEqual(parsed)
  })
})

describe('JSON→XML：代表性 fixture（验收 6b）', () => {
  it('数组 → 同名重复标签；嵌套对象逐层展开；#text + @_ 同元素并存', async () => {
    const xml = await okJsonToXml(
      '{"root":{"@_id":"r1","meta":{"#text":"v","@_k":"1.00"},"list":{"item":["a","b","c"]}}}',
    )
    expect(xml).toContain('<root id="r1">')
    expect(xml).toContain('<meta k="1.00">v</meta>')
    expect(xml).toContain('<item>a</item>')
    expect(xml).toContain('<item>b</item>')
    expect(xml).toContain('<item>c</item>')
  })

  it('用户 JSON 中的原生数字/布尔按文本写出（尽力构建）', async () => {
    const xml = await okJsonToXml('{"r":{"n":5,"flag":true}}')
    expect(xml).toContain('<n>5</n>')
    expect(xml).toContain('<flag>true</flag>')
  })

  it('顶层非单一根元素对象：标量 / 数组 / 多键 / 属性或文本约定键作根名 → 明确报错', async () => {
    for (const json of ['5', '"str"', '[]', '{}', '{"a":1,"b":2}', '{"@_x":"1"}', '{"#text":"t"}']) {
      const result = await jsonToXml(json)
      expect(result, json).toEqual({ ok: false, error: { code: 'jsonRootInvalid' } })
    }
  })
})

describe('良构校验：行/列容忍提取（验收 4a）', () => {
  it('纯函数 locateXmlError：Chromium 形态（error on line N at column M: 描述）', () => {
    const located = locateXmlError(
      'This page contains the following errors:error on line 2 at column 11: Opening and ending tag mismatch: a line 2 and b',
    )
    expect(located.line).toBe(2)
    expect(located.column).toBe(11)
    expect(located.message).toContain('Opening and ending tag mismatch')
  })

  it('纯函数：Firefox camelCase（lineNumber: 2, columnNumber: 5）与 WebKit 通用（line 3, column 7）', () => {
    expect(locateXmlError('not well-formed\nlineNumber: 2, columnNumber: 5')).toMatchObject({
      line: 2,
      column: 5,
    })
    expect(locateXmlError('XML parser error: line 3, column 7: mismatched tag')).toMatchObject({
      line: 3,
      column: 7,
    })
  })

  it('纯函数：无位置信息降级原文（不虚构行/列）', () => {
    const located = locateXmlError('undefined entity')
    expect(located.line).toBeUndefined()
    expect(located.column).toBeUndefined()
    expect(located.message).toBe('undefined entity')
  })

  it('DOMParser 集成（happy-dom）：未闭合标签与未定义实体行/列呈现、良构样例放行', () => {
    const mismatch = checkXmlWellFormed('<root>\n  <a>1</b>\n</root>')
    expect(mismatch.ok).toBe(false)
    expect(mismatch.line).toBe(2)
    expect(mismatch.column).toBe(11)
    expect(mismatch.message).toContain('mismatch')

    // 实体可解析属良构口径：未定义实体拦截并定位（Chromium/happy-dom 同径）
    const entity = checkXmlWellFormed('<r>&nbsp;</r>')
    expect(entity.ok).toBe(false)
    expect(entity.line).toBe(1)

    // 良构样例（无 CDATA——happy-dom 不支持 CDATA 节，见文件头注）放行
    expect(checkXmlWellFormed('<library id="007"><item>007</item><item>1.00</item></library>').ok).toBe(true)

    // 注：重复属性 / 裸 & 在 Chromium DOMParser 下同样拒绝（良构口径），但
    // happy-dom 解析器较宽（实测放过），故不在此断言——生产行为以浏览器为准。
  })

  it('管线呈现：convert 对畸形 XML 报 xmlNotWellFormed 并携带行/列', async () => {
    const result = await convert('<r><a>1</b></r>', 'xml-to-json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('xmlNotWellFormed')
    expect(result.error.line).toBe(1)
    expect(result.error.column).toBeDefined()
  })
})

describe('JSON 侧位置错误呈现（验收 4b）', () => {
  it('纯函数 locateJsonError：line/column 文本形态直取', () => {
    expect(locateJsonError('{}', 'Expected double-quoted property name in JSON at position 7 (line 1 column 8)')).toEqual({
      line: 1,
      column: 8,
    })
  })

  it('纯函数：仅 position 形态时按原文换算 1-based 行/列', () => {
    const input = '{\n  "a": 1,\n  "b" 2\n}'
    // 第 1 行 offset0-1、第 2 行 offset2-11、第 3 行自 offset12 起：
    // offset17 → 第 3 行第 17-12+1=6 列
    expect(locateJsonError(input, "Expected ':' after property name in JSON at position 17")).toEqual({
      line: 3,
      column: 6,
    })
  })

  it('纯函数：无位置信息返回空对象（降级为无定位报错）', () => {
    expect(locateJsonError('{}', 'Unexpected end of JSON input')).toEqual({})
  })

  it('管线呈现：V8 现行报错格式（position N (line L column C)）直达结果', async () => {
    const result = await convert('{"a":1,}', 'json-to-xml')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('jsonInvalid')
    expect(result.error.line).toBe(1)
    expect(result.error.column).toBe(8)

    const multi = await convert('{\n  "a": 1,\n}', 'json-to-xml')
    expect(multi.ok).toBe(false)
    if (multi.ok) return
    expect(multi.error.code).toBe('jsonInvalid')
    expect(multi.error.line).toBe(3)
    expect(multi.error.column).toBe(1)
  })
})

describe('1 MiB 输入上限：恰好不超限 / 超一字节报错（验收 5）', () => {
  it('UTF-8 字节精确计数（ASCII 1、CJK 3、emoji 4）', () => {
    expect(utf8ByteLength('a')).toBe(1)
    expect(utf8ByteLength('中')).toBe(3)
    expect(utf8ByteLength('\u{1F600}')).toBe(4)
  })

  it('恰好 1 MiB 的合法 XML 全管线放行', async () => {
    const xml = `<r>${'a'.repeat(PASTE_MAX_BYTES - 7)}</r>` // '<r></r>' 共 7 字节
    expect(utf8ByteLength(xml)).toBe(PASTE_MAX_BYTES)
    const result = await xmlToJson(xml)
    expect(result.ok).toBe(true)
  })

  it('超一字节即拒绝：pasteTooLarge，且在解析之前拦截', async () => {
    const xml = `<r>${'a'.repeat(PASTE_MAX_BYTES - 6)}</r>` // 1 MiB + 1 字节
    expect(utf8ByteLength(xml)).toBe(PASTE_MAX_BYTES + 1)
    const result = await convert(xml, 'xml-to-json')
    expect(result).toEqual({ ok: false, error: { code: 'pasteTooLarge' } })
  })

  it('码点边界：emoji 恰好 1 MiB（262144 个 4 字节）放行，多一个拒绝', () => {
    expect(isPasteWithinLimit('\u{1F600}'.repeat(PASTE_MAX_BYTES / 4))).toBe(true)
    expect(isPasteWithinLimit('\u{1F600}'.repeat(PASTE_MAX_BYTES / 4 + 1))).toBe(false)
  })
})

describe('空输入与方向分派', () => {
  it('空白输入两方向均为 empty（非错误呈现）', async () => {
    expect(await convert('', 'xml-to-json')).toEqual({ ok: false, error: { code: 'empty' } })
    expect(await convert('   \n  ', 'json-to-xml')).toEqual({ ok: false, error: { code: 'empty' } })
  })

  it('convert 按方向分派：json 方向的根校验错误可达', async () => {
    expect(await convert('[]', 'json-to-xml')).toEqual({ ok: false, error: { code: 'jsonRootInvalid' } })
  })
})

describe('i18n fragment：zh/en 键结构一致', () => {
  it('两语言 xmlJson 键树完全一致，tools.* 名称齐备', () => {
    const zh = locale['zh-CN']!
    const en = locale.en!
    const keysOf = (node: unknown, prefix = ''): string[] =>
      typeof node === 'object' && node !== null
        ? Object.entries(node).flatMap(([k, v]) => keysOf(v, `${prefix}${k}.`))
        : [prefix.slice(0, -1)]
    expect(keysOf(en)).toEqual(keysOf(zh))
    expect(zh.tools['xml-json']).toBe('XML↔JSON 互转')
    expect(en.tools['xml-json']).toBe('XML↔JSON Converter')
    expect(zh.tools['xml-jsonDesc']).toBeTruthy()
    expect(en.tools['xml-jsonDesc']).toBeTruthy()
  })
})
