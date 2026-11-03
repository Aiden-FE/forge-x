import { describe, expect, it } from 'vitest'
import { buildOutput, decodePart, detectMode, parseQueryInput, parseQueryBody, serializeRow } from './queryEngine'
import type { DocMeta, ParamRow } from './queryEngine'

/** 模拟用户编辑 key 单元格。 */
function editKey(row: ParamRow, value: string): ParamRow {
  row.key = value
  row.keyEdited = true
  row.keyError = false
  return row
}

/** 模拟用户编辑 value 单元格。 */
function editValue(row: ParamRow, value: string): ParamRow {
  row.value = value
  row.valueEdited = true
  row.valueError = false
  if (row.rawValue === null) row.rawValue = ''
  return row
}

/** 解析 → 可选行级编辑 → 重组（UI 管线同款）。 */
function roundTrip(
  input: string,
  edit?: (rows: ParamRow[]) => void,
  sortOn = false,
  metaOverride?: DocMeta,
): string {
  const doc = parseQueryInput(input)
  if (edit) edit(doc.rows)
  return buildOutput(metaOverride ?? doc, doc.rows, sortOn)
}

describe('输入形态与模式识别（规格 §1）', () => {
  it('含 :// → URL 模式', () => {
    expect(detectMode('https://e.cn/p?a=1')).toBe('url')
  })

  it('以 /? 开头 → URL 模式', () => {
    expect(detectMode('/?a=1')).toBe('url')
  })

  it('?a=1 与 a=1 → 参数串模式', () => {
    expect(detectMode('?a=1')).toBe('query')
    expect(detectMode('a=1')).toBe('query')
  })
})

describe('原样保真（验收 1、2）', () => {
  it('?x=%2Fpath&y=a+b 不做任何编辑 → 输出字节级一致（含 %2F 与 +）', () => {
    const input = '?x=%2Fpath&y=a+b'
    expect(roundTrip(input)).toBe(input)
    expect(roundTrip(input)).toBe('?x=%2Fpath&y=a+b')
  })

  it('解码显示：y 行值显示 a b（+ = 空格）；x 行 %2F 解码为 /', () => {
    const doc = parseQueryInput('?x=%2Fpath&y=a+b')
    expect(doc.rows[0]!.key).toBe('x')
    expect(doc.rows[0]!.value).toBe('/path')
    expect(doc.rows[1]!.key).toBe('y')
    expect(doc.rows[1]!.value).toBe('a b')
  })

  it('编辑 y → 重编码为 a%20b（空格 → %20）；x 行仍 %2Fpath 原始字节', () => {
    const out = roundTrip('?x=%2Fpath&y=a+b', (rows) => {
      editValue(rows[1]!, 'a b')
    })
    expect(out).toBe('?x=%2Fpath&y=a%20b')
  })

  it('编辑过的值按 encodeURIComponent 口径重编码，未编辑的编码大小写不变', () => {
    const input = '?k=%2fLOWER%2f'
    expect(roundTrip(input)).toBe(input) // 未编辑 → 小写 %2f 等原始字节原样
    const out = roundTrip('?k=abc', (rows) => {
      editValue(rows[0]!, '/lower/')
    })
    expect(out).toBe('?k=%2Flower%2F') // 编辑 → encodeURIComponent 口径（%2F 大写）
    const out2 = roundTrip('?k=abc', (rows) => {
      editValue(rows[0]!, '/a+b')
    })
    expect(out2).toBe('?k=%2Fa%2Bb') // 编辑 → + 被转义
  })

  it('参数串模式：无前导 ? 的输入输出也无 ?；有 ? 的保持 ?', () => {
    expect(roundTrip('a=1&b=2')).toBe('a=1&b=2')
    expect(roundTrip('?a=1&b=2')).toBe('?a=1&b=2')
  })
})

describe('重复键与行序（验收 3）', () => {
  it('a=1&a=2&a=3 三行不合并；编辑中间行后首尾位置不变', () => {
    const out = roundTrip('a=1&a=2&a=3', (rows) => {
      expect(rows).toHaveLength(3)
      editValue(rows[1]!, '九')
    })
    expect(out).toBe('a=1&a=%E4%B9%9D&a=3')
  })

  it('同名键各自成行（参数实例），行序 = 输出顺序', () => {
    const doc = parseQueryInput('a=1&a=2')
    expect(doc.rows.map((r) => r.value)).toEqual(['1', '2'])
  })
})

describe('URL 模式（验收 4）', () => {
  it('编辑 query 后 scheme/host/path/#frag 字节级完整', () => {
    const out = roundTrip('https://e.cn/p?b=2&a=1#frag', (rows) => {
      editValue(rows[0]!, '3')
    })
    expect(out).toBe('https://e.cn/p?b=3&a=1#frag')
  })

  it('未编辑的 URL 整体字节级一致（含 fragment 内的编码）', () => {
    const input = 'https://e.cn/p/a%2Fb?x=%E4%B8%AD#f%20r%2Fag'
    expect(roundTrip(input)).toBe(input)
  })

  it('URL 模式 head/tail 只读展示拆分正确', () => {
    const doc = parseQueryInput('https://e.cn/p?b=2&a=1#frag')
    expect(doc.head).toBe('https://e.cn/p?')
    expect(doc.tail).toBe('#frag')
  })

  it('URL 无 query 而新增行 → 自动补 ?，骨架字节不动', () => {
    const doc = parseQueryInput('https://e.cn/p')
    const row: ParamRow = {
      uid: 999,
      rawKey: 'a',
      rawValue: '1',
      key: 'a',
      value: '1',
      keyEdited: true,
      valueEdited: true,
      keyError: false,
      valueError: false,
    }
    expect(buildOutput(doc, [row], false)).toBe('https://e.cn/p?a=1')
  })

  it('URL 无 query 且无编辑 → 原样（含 #frag）', () => {
    expect(roundTrip('https://e.cn/p#frag')).toBe('https://e.cn/p#frag')
  })

  it('query 中不包含 #（# 只在 URL 模式切分）', () => {
    // 参数串模式里 '#' 按原始字节留在值中
    const input = 'a=1%23b'
    expect(roundTrip(input)).toBe(input)
    const doc = parseQueryInput(input)
    expect(doc.rows[0]!.value).toBe('1#b')
  })
})

describe('key-only 行（验收 5）', () => {
  it('?flag&x=1 → flag 输出不带 =', () => {
    expect(roundTrip('?flag&x=1')).toBe('?flag&x=1')
  })

  it('给 flag 填值后带 =', () => {
    const out = roundTrip('?flag&x=1', (rows) => {
      editValue(rows[0]!, '1')
    })
    expect(out).toBe('?flag=1&x=1')
  })

  it('key-only 行 rawValue = null', () => {
    const doc = parseQueryInput('?flag&x=1')
    expect(doc.rows[0]!.rawValue).toBeNull()
    expect(doc.rows[0]!.value).toBe('')
  })

  it('serializeRow：key-only 行不带 =；带值行带 =', () => {
    const doc = parseQueryInput('?flag&x=1')
    expect(serializeRow(doc.rows[0]!)).toBe('flag')
    expect(serializeRow(doc.rows[1]!)).toBe('x=1')
  })

  it('key 编辑也重编码，value 保持原始字节', () => {
    const out = roundTrip('?a%20b=1', (rows) => {
      editKey(rows[0]!, 'a b')
    })
    expect(out).toBe('?a%20b=1')
    const out2 = roundTrip('?ab=1', (rows) => {
      editKey(rows[0]!, 'a b')
    })
    expect(out2).toBe('?a%20b=1')
  })
})

describe('%ZZ 行级错误（验收 6）', () => {
  it('无效编码只错该行：他行与输出其余部分照常', () => {
    const doc = parseQueryInput('?x=%ZZ&y=ok')
    expect(doc.rows[0]!.valueError).toBe(true)
    expect(doc.rows[1]!.valueError).toBe(false)
    // 未编辑 → 原始字节输出（错误行也原样保留）
    expect(buildOutput(doc, doc.rows, false)).toBe('?x=%ZZ&y=ok')
  })

  it('key 上的无效编码标记 keyError', () => {
    const doc = parseQueryInput('?%ZZ=1')
    expect(doc.rows[0]!.keyError).toBe(true)
    expect(doc.rows[0]!.key).toBe('%ZZ')
  })

  it('解码失败行显示原始串；编辑该单元格后错误清除并重编码', () => {
    const doc = parseQueryInput('?x=%ZZ&y=ok')
    const row = doc.rows[0]!
    editValue(row, 'fine')
    expect(row.valueError).toBe(false)
    expect(buildOutput(doc, doc.rows, false)).toBe('?x=fine&y=ok')
  })

  it('残缺的 % 序列与坏代理对都算行级错误', () => {
    expect(decodePart('100%').ok).toBe(false)
    expect(decodePart('%ED%A0%80').ok).toBe(false) // lone surrogate
    expect(decodePart('a%2Fb').ok).toBe(true)
  })
})

describe('排序开关（验收 7）', () => {
  it('默认关：保持行序；开启按 key 字典序', () => {
    const input = 'b=1&a=2&c=3'
    expect(roundTrip(input, undefined, false)).toBe('b=1&a=2&c=3')
    expect(roundTrip(input, undefined, true)).toBe('a=2&b=1&c=3')
  })

  it('排序按解码后的 key（非原始字节）', () => {
    const input = 'b=1&A=2'
    // 'A' (0x41) < 'b' (0x62)
    expect(roundTrip(input, undefined, true)).toBe('A=2&b=1')
  })

  it('等键保持实例序（稳定排序）', () => {
    const input = 'a=1&a=0&_=3'
    expect(roundTrip(input, undefined, true)).toBe('_=3&a=1&a=0')
  })

  it('关闭排序恢复原始行序', () => {
    const input = 'b=1&a=2'
    expect(roundTrip(input, undefined, true)).toBe('a=2&b=1')
    expect(roundTrip(input, undefined, false)).toBe('b=1&a=2')
  })
})

describe('行操作与空段', () => {
  it('空输入 → 无行、空输出', () => {
    const doc = parseQueryInput('')
    expect(doc.rows).toEqual([])
    expect(buildOutput(doc, doc.rows, false)).toBe('')
  })

  it('空段保留（字节保真）', () => {
    expect(roundTrip('a=1&&b=2')).toBe('a=1&&b=2')
    expect(roundTrip('?a=1&')).toBe('?a=1&')
  })

  it('只有 ? 的输入原样', () => {
    expect(roundTrip('?')).toBe('?')
  })

  it('增行 → 追加在行序末尾', () => {
    const doc = parseQueryInput('?a=1')
    const row: ParamRow = {
      uid: 1,
      rawKey: 'new',
      rawValue: '',
      key: 'new',
      value: '',
      keyEdited: true,
      valueEdited: true,
      keyError: false,
      valueError: false,
    }
    expect(buildOutput(doc, [...doc.rows, row], false)).toBe('?a=1&new=')
  })
})

describe('parseQueryBody 直接覆盖', () => {
  it('值内含 = 只切第一个等号', () => {
    const rows = parseQueryBody('a=b=c')
    expect(rows[0]!.rawKey).toBe('a')
    expect(rows[0]!.rawValue).toBe('b=c')
  })

  it('+ 解码为空格（主流服务端惯例）', () => {
    const decoded = decodePart('a+b')
    expect(decoded.ok).toBe(true)
    expect(decoded.ok ? decoded.value : '').toBe('a b')
  })
})
