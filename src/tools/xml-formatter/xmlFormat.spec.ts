// @vitest-environment happy-dom
/**
 * XML 格式化/压缩单测（happy-dom：DOMParser 属浏览器 API）。
 *
 * 覆盖票据 04（.scratch/hot-tools-v0.5.0/issues/04-xml-formatter-spec.md）验收锚：
 * - 畸形 fixture（未闭合标签、裸 &、非法名、重复属性、嵌套错误）行/列呈现：
 *   happy-dom 实测（标签嵌套两类）+ Chromium parsererror 文本注入快照（五类全）
 *   + WebKit 形态与降级原文；
 * - xml:space="preserve" 保真样例；格式化幂等；minify → 再格式化 round-trip；
 * - 1 MiB 恰好不超限 / 超一字节报错（UTF-8 字节、码点整体计数）；
 * - DOMParser 良构/非良构判定（环境可行范围内，引擎差异如实处理）。
 *
 * 期望值均为独立事实（2026-11-04 对 happy-dom 21.0.4 / xml-formatter 3.7.0
 * 的探测输出与票据锁定口径），非按实现重算。
 */
import { describe, expect, it } from 'vitest'
import {
  PASTE_MAX_BYTES,
  checkWellformed,
  exceedsPasteLimit,
  extractParserError,
  indentationFor,
  runXmlTool,
} from './xmlFormat'
import type { ParseXml } from './xmlFormat'

/** 注入缝：良构（绕开 DOMParser，隔离字节边界/排版测试）。 */
const okParse: ParseXml = () => ({ parserErrorText: null })

/** 注入缝：喂指定形态的 parsererror 文本（模拟特定引擎输出）。 */
const engineParse = (parserErrorText: string): ParseXml => () => ({ parserErrorText })

/* ---------------- 票据验收锚 1：畸形 fixture 行/列呈现 ---------------- */

// Chromium（libxml2 系）真实输出形态的 parsererror 文本样例
const CHROMIUM = {
  unclosed:
    'This page contains the following errors:error on line 3 at column 8: ' +
    'Opening and ending tag mismatch: a line 2 and root\n' +
    'Below is a rendering of the page up to the first error.',
  mismatched:
    'This page contains the following errors:error on line 2 at column 11: ' +
    'Opening and ending tag mismatch: a line 2 and b',
  bareAmp:
    'This page contains the following errors:error on line 1 at column 10: ' +
    "EntityRef: expecting ';'",
  illegalName: 'This page contains the following errors:error on line 1 at column 10: StartTag: invalid element name',
  dupAttr: 'This page contains the following errors:error on line 1 at column 21: Attribute a redefined',
}

describe('行/列容忍提取（纯函数，票据验收锚 1）', () => {
  it('Chromium 形态：error on line N at column M: msg → 行/列/消息', () => {
    expect(extractParserError(CHROMIUM.unclosed)).toEqual({
      line: 3,
      column: 8,
      message: 'Opening and ending tag mismatch: a line 2 and root',
    })
    expect(extractParserError(CHROMIUM.bareAmp)).toEqual({
      line: 1,
      column: 10,
      message: "EntityRef: expecting ';'",
    })
  })

  it('WebKit 形态：line N, column M 双正则兜住（Chromium 正则未命中时）', () => {
    expect(extractParserError('This document contains an error: line 2, column 9: mismatched end tag')).toEqual({
      line: 2,
      column: 9,
      message: 'mismatched end tag',
    })
    // 括号收尾形态：行/列仍提取，消息为空（降级不误造）
    expect(extractParserError('ParserError: Tag must be paired (line 2, column 9)')).toMatchObject({
      line: 2,
      column: 9,
      message: '',
    })
  })

  it('两种形态都提取不到 → null（调用方降级原文展示）', () => {
    expect(extractParserError('Something inexplicable happened')).toBeNull()
    expect(extractParserError('')).toBeNull()
  })
})

describe('畸形 fixture → 不良构 + 位置（Chromium 注入快照，五类全）', () => {
  const cases = [
    { name: '未闭合标签', xml: '<root>\n  <a>text\n</root>', err: CHROMIUM.unclosed, line: 3, column: 8 },
    { name: '嵌套错误（开闭不匹配）', xml: '<root>\n  <a>1</b>\n</root>', err: CHROMIUM.mismatched, line: 2, column: 11 },
    { name: '裸 & 实体引用错误', xml: '<root>a & b</root>', err: CHROMIUM.bareAmp, line: 1, column: 10 },
    { name: '非法元素名 <1tag>', xml: '<root><1tag>x</1tag></root>', err: CHROMIUM.illegalName, line: 1, column: 10 },
    { name: '重复属性', xml: '<root a="1" a="2"/>', err: CHROMIUM.dupAttr, line: 1, column: 21 },
  ]

  for (const c of cases) {
    it(`${c.name} → notWellFormed + 第 ${c.line} 行第 ${c.column} 列`, async () => {
      const outcome = await runXmlTool(c.xml, 'format', '2', engineParse(c.err))
      expect(outcome).toMatchObject({
        ok: false,
        errors: [{ code: 'notWellFormed', position: { line: c.line, column: c.column } }],
      })
    })
  }

  it('位置提取失败 → 保留 parsererror 原文（降级展示），不带位置', async () => {
    const outcome = await runXmlTool('<root>\n<a>1</b>\n</root>', 'format', '2', engineParse('不可名状的解析失败'))
    expect(outcome).toMatchObject({
      ok: false,
      errors: [{ code: 'notWellFormed', message: '不可名状的解析失败' }],
    })
    if (!outcome.ok) expect(outcome.errors[0]!.position).toBeUndefined()
  })
})

/* ---------------- 票据验收锚 6：DOMParser 良构判定（环境可行范围内） ---------------- */

describe('DOMParser 良构判定（happy-dom 实测，默认权威路径）', () => {
  it('良构文档（含声明/注释/自闭合）→ ok', () => {
    expect(checkWellformed('<?xml version="1.0" encoding="UTF-8"?><root><!-- c --><a>1</a><b/></root>').ok).toBe(true)
  })

  it('未闭合标签 → 不良构，行/列呈现（happy-dom 探测值：line 3 col 8）', () => {
    const result = checkWellformed('<root>\n  <a>text\n</root>')
    expect(result.ok).toBe(false)
    expect(result.position).toEqual({ line: 3, column: 8, message: 'Opening and ending tag mismatch: a line 2 and root' })
  })

  it('嵌套错误 → 不良构（happy-dom 探测值：line 2 col 11）', () => {
    const result = checkWellformed('<root>\n  <a>1</b>\n</root>')
    expect(result.ok).toBe(false)
    expect(result.position).toMatchObject({ line: 2, column: 11 })
  })

  it('纯文本非 XML → 不良构（Start tag expected）', () => {
    const result = checkWellformed('hello')
    expect(result.ok).toBe(false)
    expect(result.position).toMatchObject({ line: 1, column: 1 })
  })

  it('引擎差异如实处理：happy-dom 对裸 & / 非法名 / 重复属性宽松（无 parsererror）', () => {
    // 生产环境（WebView2/Chromium 与 WebKit）对这三类均报 parsererror，由上方
    // Chromium 注入快照测试覆盖判定与行/列提取；此处固化 happy-dom 的已知宽松面，
    // 防止环境差异被误当回归。
    expect(checkWellformed('<root>a & b</root>').ok).toBe(true)
    expect(checkWellformed('<root><1tag>x</1tag></root>').ok).toBe(true)
    expect(checkWellformed('<root a="1" a="2"/>').ok).toBe(true)
  })

  it('引擎差异如实处理：happy-dom 不支持 CDATA 段（误报非法名），生产引擎均接受', () => {
    // CDATA 是核心 XML 语法，Chromium/WebKit 均按良构接受；happy-dom 的 XML
    // 解析器把 <![ 误判为非法起始标签（探测值 line 1 col 11）。固化该测试环境
    // 缺口，防止被误当本工具回归；真库对 CDATA 的保真由排版测试覆盖。
    const result = checkWellformed('<root><c><![CDATA[x]]></c></root>')
    expect(result.ok).toBe(false)
    expect(result.position).toMatchObject({ line: 1, column: 11 })
  })
})

/* ---------------- 票据验收锚 2/3：排版口径（锁定选项，真库） ---------------- */

const SHAPE =
  '<root><child attr="v">text</child><empty></empty><self/>' +
  '<pre xml:space="preserve">  keep   me  </pre><wrap><deep>x</deep></wrap></root>'

const SHAPE_FORMATTED_2 =
  '<root>\n' +
  '  <child attr="v">text</child>\n' +
  '  <empty></empty>\n' +
  '  <self/>\n' +
  '  <pre xml:space="preserve">  keep   me  </pre>\n' +
  '  <wrap>\n' +
  '    <deep>x</deep>\n' +
  '  </wrap>\n' +
  '</root>'

const SHAPE_MINIFIED =
  '<root><child attr="v">text</child><empty></empty><self/>' +
  '<pre xml:space="preserve">  keep   me  </pre><wrap><deep>x</deep></wrap></root>'

describe('排版口径（定死不暴露；唯一选项 = 缩进）', () => {
  it('缩进档位映射：2 / 4 / Tab', () => {
    expect(indentationFor('2')).toBe('  ')
    expect(indentationFor('4')).toBe('    ')
    expect(indentationFor('tab')).toBe('\t')
  })

  it('格式化：\\n 换行（覆盖库默认 \\r\\n）+ 缩进 2 + collapseContent 文本不折行', async () => {
    const outcome = await runXmlTool(SHAPE, 'format', '2', okParse)
    expect(outcome).toEqual({ ok: true, value: SHAPE_FORMATTED_2 })
    expect(outcome.ok && !outcome.value.includes('\r')).toBe(true)
  })

  it('缩进 4 / Tab 生效（结构缩进变化，preserve 内容不动）', async () => {
    const four = await runXmlTool(SHAPE, 'format', '4', okParse)
    expect(four).toEqual({
      ok: true,
      value:
        '<root>\n' +
        '    <child attr="v">text</child>\n' +
        '    <empty></empty>\n' +
        '    <self/>\n' +
        '    <pre xml:space="preserve">  keep   me  </pre>\n' +
        '    <wrap>\n' +
        '        <deep>x</deep>\n' +
        '    </wrap>\n' +
        '</root>',
    })
    const tab = await runXmlTool(SHAPE, 'format', 'tab', okParse)
    expect(tab).toEqual({
      ok: true,
      value:
        '<root>\n' +
        '\t<child attr="v">text</child>\n' +
        '\t<empty></empty>\n' +
        '\t<self/>\n' +
        '\t<pre xml:space="preserve">  keep   me  </pre>\n' +
        '\t<wrap>\n' +
        '\t\t<deep>x</deep>\n' +
        '\t</wrap>\n' +
        '</root>',
    })
  })

  it('<tag></tag> 保真（forceSelfClosingEmptyTag 关）与自闭合紧凑（<tag/> 无空格）', async () => {
    const outcome = await runXmlTool('<root><empty></empty><self/></root>', 'format', '2', okParse)
    expect(outcome).toEqual({ ok: true, value: '<root>\n  <empty></empty>\n  <self/>\n</root>' })
  })

  it('属性引号统一 double（单引号输入归一）', async () => {
    const outcome = await runXmlTool(`<root attr='v'/>`, 'format', '2', okParse)
    expect(outcome).toEqual({ ok: true, value: '<root attr="v"/>' })
  })

  it('xml:space="preserve" 内容保真（内部空白/空行逐字节保留）', async () => {
    const outcome = await runXmlTool(
      '<root>\n  <code xml:space="preserve">   spaced\n\nlines  </code>\n</root>',
      'format',
      '2',
      okParse,
    )
    expect(outcome.ok && outcome.value.includes('<code xml:space="preserve">   spaced\n\nlines  </code>')).toBe(true)
  })

  it('CDATA 段与 XML 声明保真（内容逐字节保留，声明不丢）', async () => {
    // happy-dom 的 DOMParser 不识别 CDATA（见引擎差异测试），此处注入良构判定，
    // 真库排版按生产引擎的良构口径验证。
    const doc = '<?xml version="1.0" encoding="UTF-8"?>\n<root><c><![CDATA[x & y <b> keep]]></c></root>'
    const fmt = await runXmlTool(doc, 'format', '2', okParse)
    expect(fmt).toEqual({
      ok: true,
      value: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <c><![CDATA[x & y <b> keep]]></c>\n</root>',
    })
    const min = await runXmlTool(doc, 'minify', '2', okParse)
    expect(min).toEqual({ ok: true, value: '<?xml version="1.0" encoding="UTF-8"?><root><c><![CDATA[x & y <b> keep]]></c></root>' })
  })
})

describe('幂等与 round-trip（票据验收锚 3/4）', () => {
  it('格式化幂等：format(format(x)) === format(x)', async () => {
    const once = await runXmlTool(SHAPE, 'format', '2', okParse)
    const twice = await runXmlTool(once.ok ? once.value : '', 'format', '2', okParse)
    expect(twice).toEqual(once)
  })

  it('minify：标签间空白折叠、preserve 区保留、<empty></empty> 不强转自闭合', async () => {
    const outcome = await runXmlTool(SHAPE, 'minify', '2', okParse)
    expect(outcome).toEqual({ ok: true, value: SHAPE_MINIFIED })
  })

  it('minify → 再格式化 round-trip 语义不变：format(minify(x)) === format(x)', async () => {
    const minified = await runXmlTool(SHAPE, 'minify', '2', okParse)
    const roundTrip = await runXmlTool(minified.ok ? minified.value : '', 'format', '2', okParse)
    const straight = await runXmlTool(SHAPE, 'format', '2', okParse)
    expect(roundTrip).toEqual(straight)
  })
})

/* ---------------- 票据验收锚 5：1 MiB 粘贴上限 ---------------- */

describe('1 MiB 粘贴上限（UTF-8 字节，码点整体计数）', () => {
  it('恰好 1 MiB 不超限（且可正常格式化）；超一字节明确报错', async () => {
    const exactly = `<r>${'x'.repeat(PASTE_MAX_BYTES - 7)}</r>` // 3 + (MAX-7) + 4 = MAX 字节
    expect(exceedsPasteLimit(exactly)).toBe(false)
    await expect(runXmlTool(exactly, 'format', '2', okParse)).resolves.toMatchObject({ ok: true })

    const oneOver = `${exactly}!`
    expect(exceedsPasteLimit(oneOver)).toBe(true)
    await expect(runXmlTool(oneOver, 'format', '2', okParse)).resolves.toMatchObject({
      ok: false,
      errors: [{ code: 'pasteTooLarge' }],
    })
  })

  it('多字节字符按 UTF-8 字节精确计数（汉字 3 字节/字）', () => {
    expect(exceedsPasteLimit('汉'.repeat(Math.floor(PASTE_MAX_BYTES / 3)))).toBe(false) // 1048575 字节
    expect(exceedsPasteLimit('汉'.repeat(Math.ceil(PASTE_MAX_BYTES / 3)))).toBe(true) // 1048578 字节
    // 星面 emoji 4 字节/码点：恰好 1 MiB 不超限（码点整体计数，无代理对切分）；多一个码点即超
    expect(exceedsPasteLimit('\u{1F600}'.repeat(PASTE_MAX_BYTES / 4))).toBe(false)
    expect(exceedsPasteLimit('\u{1F600}'.repeat(PASTE_MAX_BYTES / 4 + 1))).toBe(true)
  })

  it('快速路径：短输入恒不超限', () => {
    expect(exceedsPasteLimit('a'.repeat(1000))).toBe(false)
    expect(PASTE_MAX_BYTES).toBe(1024 * 1024)
  })
})

/* ---------------- 入口边界与兜底 ---------------- */

describe('runXmlTool 入口边界与 xml-formatter 兜底', () => {
  it('空输入 / 纯空白 → empty（不触发解析与计算）', async () => {
    await expect(runXmlTool('', 'format', '2', okParse)).resolves.toMatchObject({
      ok: false,
      errors: [{ code: 'empty' }],
    })
    await expect(runXmlTool('   \n  ', 'format', '2', okParse)).resolves.toMatchObject({
      ok: false,
      errors: [{ code: 'empty' }],
    })
  })

  it('良构判定通过但库解析失败 → convert 兜底错误（throwOnFailure，不输出静默修复结果）', async () => {
    // 截断的结束标签：注入的引擎判定宽松放过，xml-formatter throwOnFailure 抛
    // "Failed to parse XML"（2026-11-04 探测：未闭合注释/CDATA/结束标签均抛）
    const outcome = await runXmlTool('<root><a>1</a', 'format', '2', okParse)
    expect(outcome).toMatchObject({ ok: false, errors: [{ code: 'convert' }] })
    if (!outcome.ok) expect(outcome.errors[0]!.message).toBeTruthy()
  })

  it('minify 模式同样先过良构校验（校验不分模式）', async () => {
    const outcome = await runXmlTool('<root>a & b</root>', 'minify', '2', engineParse(CHROMIUM.bareAmp))
    expect(outcome).toMatchObject({ ok: false, errors: [{ code: 'notWellFormed' }] })
  })
})
