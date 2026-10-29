import { describe, expect, it } from 'vitest'
import {
  MAX_INPUT_BYTES,
  computeStats,
  countBytes,
  countCodePoints,
  countGraphemes,
  countGraphemesSimple,
  countLines,
  countParagraphs,
  countWhitespace,
  countWords,
  enforceInputLimit,
  readingTime,
  shouldShowGraphemes,
} from './stats'

// 👨‍👩‍👧 = 家庭 emoji（ZWJ 序列）：规格修正记录明确为
// 8 个 UTF-16 code unit / 5 个码点 / 1 个字素。
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'

describe('码点计数（Unicode 码点，非 .length）', () => {
  it('预合成 é 与 e+U+0301 组合符形态的码点数差异', () => {
    expect(countCodePoints('aé')).toBe(2) // a + é(U+00E9)
    expect(countCodePoints('ae\u0301')).toBe(3) // a + e + 组合锐音符
  })

  it('👨‍👩‍👧 = 8 code units / 5 码点', () => {
    expect(FAMILY.length).toBe(8) // UTF-16 code unit（修正记录）
    expect(countCodePoints(FAMILY)).toBe(5)
  })

  it('增补平面字符 𝕏(U+1D54F) = 1 码点 / 2 code units（证明没用 .length）', () => {
    expect('\u{1D54F}'.length).toBe(2)
    expect(countCodePoints('\u{1D54F}')).toBe(1)
  })

  it('空文本 = 0；普通文本 = 码点数', () => {
    expect(countCodePoints('')).toBe(0)
    expect(countCodePoints('hello')).toBe(5)
  })

  it('中英混排：你好 world = 8 码点（CJK 两字 + 空格 + world，见报告备注）', () => {
    expect(countCodePoints('你好 world')).toBe(8)
  })
})

describe('空白与不含空白字符数（Zs、\\t、\\n、\\r）', () => {
  it('四类基础空白各计 1', () => {
    expect(countWhitespace(' \t\n\r')).toBe(4)
  })

  it('Zs 空白（NBSP、em space）计入；\\v、\\f 不在口径内', () => {
    expect(countWhitespace('a\u00A0b')).toBe(1) // NBSP（Zs）
    expect(countWhitespace('a\u2003b')).toBe(1) // em space（Zs）
    expect(countWhitespace('a\u000Bb')).toBe(0) // 垂直制表符（Cc，不在口径）
    expect(countWhitespace('a\u000Cb')).toBe(0) // 换页（Cc，不在口径）
  })

  it('不含空白 = 码点数 − 空白数', () => {
    expect(countCodePoints('a b')).toBe(3)
    expect(countCodePoints('a b') - countWhitespace('a b')).toBe(2)
    expect(countCodePoints('你好 world') - countWhitespace('你好 world')).toBe(7)
  })
})

describe('字素计数', () => {
  it('👨‍👩‍👧 = 1 个字素（Segmenter 主路径）', () => {
    expect(countGraphemes(FAMILY)).toBe(1)
  })

  it('e+U+0301 组合符 = 1；预合成 é = 1（验收 #2）', () => {
    expect(countGraphemes('e\u0301')).toBe(1)
    expect(countGraphemes('é')).toBe(1)
  })

  it('café 与 cafe\\u0301 字素均为 4（码点 4 vs 5）', () => {
    expect(countCodePoints('café')).toBe(4)
    expect(countCodePoints('cafe\u0301')).toBe(5)
    expect(countGraphemes('café')).toBe(4)
    expect(countGraphemes('cafe\u0301')).toBe(4)
  })

  it('普通文本 = 码点数', () => {
    expect(countGraphemes('abc')).toBe(3)
    expect(countGraphemes('你好 world')).toBe(8)
  })

  it('简化聚类回退：ZWJ 序列、组合标记、变体选择符、肤色修饰符、keycap、旗帜、CRLF', () => {
    expect(countGraphemesSimple(FAMILY)).toBe(1)
    expect(countGraphemesSimple('e\u0301')).toBe(1)
    expect(countGraphemesSimple('cafe\u0301')).toBe(4)
    expect(countGraphemesSimple('\u263A\uFE0F')).toBe(1) // ☺️ 笑脸 + VS16
    expect(countGraphemesSimple('\u{1F44D}\u{1F3FB}')).toBe(1) // 👍🏻 肤色修饰符
    expect(countGraphemesSimple('1\uFE0F\u20E3')).toBe(1) // 1️⃣ keycap
    expect(countGraphemesSimple('\u{1F1E8}\u{1F1F3}')).toBe(1) // 🇨🇳 区域指示符对
    expect(countGraphemesSimple('a\r\nb')).toBe(3) // CRLF 是一个字素
    expect(countGraphemesSimple('\u{1D54F}')).toBe(1) // 增补平面单字符
    expect(countGraphemesSimple('')).toBe(0)
  })

  it('字素行可见性：不相等显示、相等隐藏、不可探测(null)隐藏', () => {
    expect(shouldShowGraphemes(1, 5)).toBe(true) // 👨‍👩‍👧
    expect(shouldShowGraphemes(4, 5)).toBe(true) // cafe\u0301
    expect(shouldShowGraphemes(5, 5)).toBe(false) // 与码点相等 → 不重复显示
    expect(shouldShowGraphemes(null, 5)).toBe(false) // 不可探测 → 隐藏
    expect(shouldShowGraphemes(0, 0)).toBe(false) // 空文本
  })
})

describe('字节数（UTF-8）', () => {
  it('空文本 = 0；ASCII = 1 字节/字', () => {
    expect(countBytes('')).toBe(0)
    expect(countBytes('abc')).toBe(3)
  })

  it('中文 = 3 字节/字；emoji = 4 字节/字', () => {
    expect(countBytes('你好')).toBe(6)
    expect(countBytes('\u{1F44D}')).toBe(4)
  })

  it('混合文本精确值', () => {
    expect(countBytes('a中\u{1F44D}')).toBe(8) // 1 + 3 + 4
    expect(countBytes('é')).toBe(2) // U+00E9 → 2 字节
    expect(countBytes('e\u0301')).toBe(3) // e(1) + U+0301(2)
    expect(countBytes(FAMILY)).toBe(18) // 3 emoji×4 + 2 ZWJ×3
  })
})

describe('统计词（拉丁/数字段 + CJK 逐字）', () => {
  it('hello world = 2', () => {
    expect(countWords('hello world').total).toBe(2)
  })

  it("词内 ' 与 - 不拆词：don't = 1、state-of-the-art = 1（验收 #6）", () => {
    expect(countWords("don't").total).toBe(1)
    expect(countWords('state-of-the-art').total).toBe(1)
  })

  it("don't stop-me-now = 2（两个不拆词的词）；don't stop-me now = 3", () => {
    expect(countWords("don't stop-me-now").total).toBe(2)
    expect(countWords("don't stop-me now").total).toBe(3)
  })

  it('CJK 每个汉字计 1 词：你好世界 = 4', () => {
    expect(countWords('你好世界')).toEqual({ total: 4, latin: 0, cjk: 4 })
  })

  it('中英混排：你好 world = 3（验收 #3）；abc 你好 123 = 4', () => {
    expect(countWords('你好 world')).toEqual({ total: 3, latin: 1, cjk: 2 })
    expect(countWords('abc 你好 123')).toEqual({ total: 4, latin: 2, cjk: 2 })
  })

  it('无空格混排同样按口径切分：abc你好123 = 4', () => {
    expect(countWords('abc你好123')).toEqual({ total: 4, latin: 2, cjk: 2 })
  })

  it('空标点不影响词数', () => {
    expect(countWords('!!! ...').total).toBe(0)
    expect(countWords("he said 'hello'").total).toBe(3)
    expect(countWords('-a-b a- b').total).toBe(3) // 词边界外的 - 不并入
  })

  it('返回结构化结果：拉丁词与 CJK 字分别计数', () => {
    expect(countWords('hello world')).toEqual({ total: 2, latin: 2, cjk: 0 })
  })
})

describe('行数（\\r\\n / \\n / \\r 切分段）', () => {
  it('空输入 = 0；单行无换行 = 1', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('a')).toBe(1)
  })

  it('三种换行风格切分', () => {
    expect(countLines('a\nb')).toBe(2)
    expect(countLines('a\r\nb')).toBe(2)
    expect(countLines('a\rb')).toBe(2)
    expect(countLines('a\nb\r\nc\rd')).toBe(4)
  })

  it('末尾无换行不多计、末尾有换行不多计空行（验收 #4）', () => {
    expect(countLines('line1\r\nline2\r\nline3')).toBe(3)
    expect(countLines('line1\r\nline2\r\n')).toBe(2)
    expect(countLines('a\n')).toBe(1)
    expect(countLines('a\r\n')).toBe(1)
  })

  it('中间空行计入行数；单个换行符 = 1 行（空行）', () => {
    expect(countLines('a\n\nb')).toBe(3)
    expect(countLines('\n')).toBe(1)
  })
})

describe('段落数（连续非空行块，空行分隔）', () => {
  it('空输入 = 0；无空行 = 1 段', () => {
    expect(countParagraphs('')).toBe(0)
    expect(countParagraphs('a')).toBe(1)
    expect(countParagraphs('a\nb')).toBe(1)
  })

  it('空行分隔成段', () => {
    expect(countParagraphs('a\n\nb')).toBe(2)
    expect(countParagraphs('a\n \nb')).toBe(2) // 仅空白的行为空行
  })

  it('两空行分隔仍计相邻两段（验收 #5）', () => {
    expect(countParagraphs('a\n\n\nb')).toBe(2)
  })

  it('纯空行文本 = 0 段；末尾空行不多计', () => {
    expect(countParagraphs('\n\n')).toBe(0)
    expect(countParagraphs('a\n\n')).toBe(1)
  })
})

describe('阅读时长（拉丁 200 词/分 + CJK 300 字/分，四舍五入）', () => {
  it('纯拉丁：200 词 = 1 分钟；300 词 = 1.5 → 2 分钟', () => {
    expect(readingTime(200, 0)).toEqual({ minutes: 1, underOne: false })
    expect(readingTime(300, 0)).toEqual({ minutes: 2, underOne: false })
  })

  it('纯 CJK：300 字 = 1 分钟', () => {
    expect(readingTime(0, 300)).toEqual({ minutes: 1, underOne: false })
  })

  it('混合合成：100 拉丁词 + 150 CJK 字 = 1 分钟', () => {
    expect(readingTime(100, 150)).toEqual({ minutes: 1, underOne: false })
  })

  it('不足 1 分钟 → { minutes: 0, underOne: true }', () => {
    expect(readingTime(10, 0)).toEqual({ minutes: 0, underOne: true })
    expect(readingTime(0, 100)).toEqual({ minutes: 0, underOne: true })
  })

  it('恰好 0.5 分钟四舍五入到 1 分钟（Math.round 半值向上）', () => {
    expect(readingTime(0, 150)).toEqual({ minutes: 1, underOne: false })
    expect(readingTime(100, 0)).toEqual({ minutes: 1, underOne: false })
  })

  it('无内容（0 词 0 字）→ null（UI 隐藏该行）', () => {
    expect(readingTime(0, 0)).toBeNull()
  })
})

describe('computeStats 汇总', () => {
  it('👨‍👩‍👧：码点 5 / 字素 1（显示）/ 字节 18 / 词 0 / 行 1 / 段 1 / 无阅读时长', () => {
    const s = computeStats(FAMILY)
    expect(s.codePoints).toBe(5)
    expect(s.graphemes).toBe(1)
    expect(s.showGraphemes).toBe(true)
    expect(s.bytes).toBe(18)
    expect(s.words).toBe(0)
    expect(s.lines).toBe(1)
    expect(s.paragraphs).toBe(1)
    expect(s.reading).toBeNull()
  })

  it('普通 ASCII：字素与码点相等 → 隐藏字素行', () => {
    const s = computeStats('hello world')
    expect(s.showGraphemes).toBe(false)
    expect(s.codePoints).toBe(11)
    expect(s.codePointsNoWhitespace).toBe(10)
    expect(s.words).toBe(2)
  })

  it('空文本：全 0、字素行隐藏、无阅读时长行', () => {
    const s = computeStats('')
    expect(s.codePoints).toBe(0)
    expect(s.codePointsNoWhitespace).toBe(0)
    expect(s.graphemes).toBe(0)
    expect(s.showGraphemes).toBe(false)
    expect(s.bytes).toBe(0)
    expect(s.words).toBe(0)
    expect(s.lines).toBe(0)
    expect(s.paragraphs).toBe(0)
    expect(s.reading).toBeNull()
  })

  it('中英混排完整指标（验收 #3）', () => {
    const s = computeStats('你好 world')
    expect(s.codePoints).toBe(8)
    expect(s.codePointsNoWhitespace).toBe(7)
    expect(s.words).toBe(3)
    expect(s.latinWords).toBe(1)
    expect(s.cjkChars).toBe(2)
    expect(s.reading).toEqual({ minutes: 0, underOne: true }) // 1/200 + 2/300 ≈ 0.0117
  })
})

describe('1 MiB 输入上限', () => {
  it('空文本与恰好上限内的文本不截断', () => {
    expect(enforceInputLimit('')).toEqual({ text: '', truncated: false })
    expect(enforceInputLimit('a'.repeat(MAX_INPUT_BYTES))).toEqual({
      text: 'a'.repeat(MAX_INPUT_BYTES),
      truncated: false,
    })
  })

  it('ASCII 超限：截断到恰好 1 MiB', () => {
    const res = enforceInputLimit('a'.repeat(MAX_INPUT_BYTES + 1))
    expect(res.truncated).toBe(true)
    expect(res.text.length).toBe(MAX_INPUT_BYTES)
    expect(countBytes(res.text)).toBe(MAX_INPUT_BYTES)
  })

  it('CJK 边界：349525 字（1,048,575 字节）不截断；349526 字截断', () => {
    const fits = '中'.repeat(349_525)
    expect(countBytes(fits)).toBe(MAX_INPUT_BYTES - 1)
    expect(enforceInputLimit(fits).truncated).toBe(false)
    const res = enforceInputLimit('中'.repeat(349_526))
    expect(res.truncated).toBe(true)
    expect(res.text).toBe(fits)
  })

  it('多字节字符跨线时整字符回退，不产生半个码点', () => {
    const res = enforceInputLimit('a'.repeat(MAX_INPUT_BYTES - 2) + '中')
    expect(res.truncated).toBe(true)
    expect(res.text).toBe('a'.repeat(MAX_INPUT_BYTES - 2))
    expect(countBytes(res.text)).toBe(MAX_INPUT_BYTES - 2)
  })

  it('emoji（4 字节/字）恰好填满上限不截断', () => {
    const fits = '\u{1F44D}'.repeat(262_144)
    expect(countBytes(fits)).toBe(MAX_INPUT_BYTES)
    expect(enforceInputLimit(fits).truncated).toBe(false)
    expect(enforceInputLimit(fits + '\u{1F44D}').truncated).toBe(true)
  })
})
