// @vitest-environment happy-dom
/**
 * HTML 实体转义单测（happy-dom：DOMParser 属浏览器 API）。
 * 覆盖规格验收 1–5：五实体往返与 &#39; 口径、全表抽样、数字引用（含星面）、
 * 标签字面保留、未知实体行级定位、无分号原生规则。
 */
import { describe, expect, it } from 'vitest'
import { MAX_INPUT_BYTES, escapeHtml, isOverLimit, unescapeHtml } from './htmlEntity'

describe('escape：五个必需实体（验收 1）', () => {
  it('五实体逐一映射，撇号产出口径为 &#39;（非 &apos;）', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#39;')
    expect(escapeHtml("'")).not.toBe('&apos;')
  })

  it('其余字符原样透传（含 CJK、emoji）', () => {
    expect(escapeHtml('a1中😀<br>')).toBe('a1中😀&lt;br&gt;')
    expect(escapeHtml('')).toBe('')
  })

  it('& 必须最先替换（不产生双重转义）', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
    expect(escapeHtml('&&')).toBe('&amp;&amp;')
  })

  it('五实体往返：escape → unescape 字节级还原', () => {
    const original = 'A & B < C > D " E \' F 中文 😀'
    expect(unescapeHtml(escapeHtml(original)).text).toBe(original)
  })
})

describe('unescape：全表抽样（验收 2）', () => {
  it('常用命名实体：&copy; &eacute; &forall;', () => {
    expect(unescapeHtml('&copy;').text).toBe('©')
    expect(unescapeHtml('&eacute;').text).toBe('é')
    expect(unescapeHtml('&forall;').text).toBe('∀')
  })

  it('全表抽样：非 Latin-1 命名实体（含增补平面）解码正确', () => {
    // 注：HTML5 命名实体表中不存在映射到汉字的条目（规格「CJK 命名实体」的
    // 全表口径以增补平面/扩展命名实体抽样代证——全表支持即都支持）
    expect(unescapeHtml('&cscr;').text).toBe('\u{1D4B8}') // 𝒸 非 BMP
    expect(unescapeHtml('&bopf;').text).toBe('\u{1D553}') // 𝕓 非 BMP
    expect(unescapeHtml('&bull;').text).toBe('•')
    expect(unescapeHtml('&aogon;').text).toBe('ą')
  })

  it('大小写敏感命名实体各自成立', () => {
    expect(unescapeHtml('&amp;').text).toBe('&')
    expect(unescapeHtml('&AMP;').text).toBe('&')
    expect(unescapeHtml('&lt;').text).toBe('<')
    expect(unescapeHtml('&LT;').text).toBe('<')
  })
})

describe('unescape：数字字符引用（验收 3）', () => {
  it('十进制 &#NNN;', () => {
    expect(unescapeHtml('&#35;').text).toBe('#')
    expect(unescapeHtml('&#20013;').text).toBe('中')
  })

  it('十六进制 &#xHHHH;（大小写 x 皆可）', () => {
    expect(unescapeHtml('&#x23;').text).toBe('#')
    expect(unescapeHtml('&#X23;').text).toBe('#')
    expect(unescapeHtml('&#x4E2D;').text).toBe('中')
  })

  it('星面 emoji &#x1F600;（代理对处理正确）', () => {
    expect(unescapeHtml('&#x1F600;').text).toBe('\u{1F600}')
    expect(unescapeHtml('&#128512;').text).toBe('\u{1F600}')
    expect(unescapeHtml('&#x1F600;').text).toBe('😀')
  })

  it('越界数字引用按原生规则（U+FFFD，不报错）', () => {
    expect(unescapeHtml('&#1114112;').ok).toBe(true)
  })
})

describe('仅解码不解析：标签字面保留（验收 4）', () => {
  it('<b>x</b>&amp;y → <b>x</b>&y（标签不消失、不渲染）', () => {
    expect(unescapeHtml('<b>x</b>&amp;y').text).toBe('<b>x</b>&y')
  })

  it('script 标签字面保留（inert 环境）', () => {
    const res = unescapeHtml('<script>alert(1)</script>')
    expect(res.text).toBe('<script>alert(1)</script>')
  })

  it('img 标签与属性引号按字面保留', () => {
    const res = unescapeHtml('<img src="x" onerror="a&amp;b">')
    expect(res.text).toBe('<img src="x" onerror="a&b">')
  })

  it('已被转义的标签 &lt;b&gt; 解码为字面文本 <b>（正确的反转义语义）', () => {
    expect(unescapeHtml('&lt;b&gt;x&lt;/b&gt;&amp;y').text).toBe('<b>x</b>&y')
  })
})

describe('未知命名实体行级错误（验收 5）', () => {
  it('&unknownname; 所在行标记错误，其余行照常', () => {
    const res = unescapeHtml('good &amp; fine\nbad &unknownname; here\nstill &lt; fine')
    expect(res.ok).toBe(false)
    expect(res.lines[0]!.unknownEntities).toEqual([])
    expect(res.lines[0]!.text).toBe('good & fine')
    expect(res.lines[1]!.unknownEntities).toEqual(['&unknownname;'])
    expect(res.lines[2]!.unknownEntities).toEqual([])
    // 错误行文本保持解码所得（残留 &unknownname; 可见），其他行正常解码
    expect(res.lines[1]!.text).toBe('bad &unknownname; here')
    expect(res.text).toBe('good & fine\nbad &unknownname; here\nstill < fine')
  })

  it('&amp 无分号按 HTML5 原生规则解码（历史实体）', () => {
    expect(unescapeHtml('&amp').text).toBe('&')
    expect(unescapeHtml('&amp').ok).toBe(true)
    expect(unescapeHtml('a&ampb').text).toBe('a&b') // 文本上下文：后随字母仍解码（原生）
  })

  it('& 后非字母（AT&T）不是字符引用，原样保留', () => {
    const res = unescapeHtml('AT&T')
    expect(res.text).toBe('AT&T')
    expect(res.ok).toBe(true)
  })

  it('&amp;name; 单次解码后残留 &name; 不误报（输入侧 token 检测）', () => {
    const res = unescapeHtml('Tom&amp;Jerry;')
    expect(res.ok).toBe(true)
    expect(res.text).toBe('Tom&Jerry;')
  })

  it('同一未知实体多次出现只报一次', () => {
    const res = unescapeHtml('&nope; &nope;')
    expect(res.lines[0]!.unknownEntities).toEqual(['&nope;'])
  })

  it('CRLF / CR 行切分保持行号', () => {
    const res = unescapeHtml('a&lt;b\r\n&unknown;\rmore')
    expect(res.lines).toHaveLength(3)
    expect(res.lines[0]!.text).toBe('a<b')
    expect(res.lines[1]!.unknownEntities).toEqual(['&unknown;'])
    expect(res.lines[2]!.text).toBe('more')
  })
})

describe('1 MiB 输入上限（验收 6：超限明确报错，不触发计算）', () => {
  it('超限判定为 true；emoji 输入按 UTF-8 字节精确计数', () => {
    const emoji = '\u{1F600}' // 4 字节
    const text = emoji.repeat(300_000) // 1.2 MB > 1 MiB
    expect(isOverLimit(text)).toBe(true)
  })

  it('未超限为 false', () => {
    const text = 'a'.repeat(1000)
    expect(isOverLimit(text)).toBe(false)
  })

  it('快速路径：短于上界 1/3 的输入必然安全（false）', () => {
    expect(isOverLimit('x'.repeat(MAX_INPUT_BYTES / 3 - 1))).toBe(false)
  })

  it('1 MiB 级输入解码可完成（真实日历内）', () => {
    const text = `a&amp;b&lt;${'x'.repeat(500_000)}`
    const start = Date.now()
    const res = unescapeHtml(text)
    expect(res.ok).toBe(true)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
