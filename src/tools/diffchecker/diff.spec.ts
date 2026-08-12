import { describe, expect, it } from 'vitest'
import { computeDiff } from './diff'

describe('computeDiff 边界状态', () => {
  it('完全相同 → same 状态', () => {
    const r = computeDiff({ left: 'a\nb', right: 'a\nb' })
    expect(r.status).toBe('same')
    expect(r.rows).toHaveLength(0)
  })

  it('两侧皆空 → both-empty 状态', () => {
    const r = computeDiff({ left: '', right: '' })
    expect(r.status).toBe('both-empty')
    expect(r.rows).toHaveLength(0)
  })

  it('仅一侧为空 → diff 状态，全部删除/全部新增', () => {
    const del = computeDiff({ left: 'a\nb', right: '' })
    expect(del.status).toBe('diff')
    expect(del.rows.map(r => r.kind)).toEqual(['deleted', 'deleted'])
    expect(del.deletedCount).toBe(2)

    const add = computeDiff({ left: '', right: 'a\nb' })
    expect(add.status).toBe('diff')
    expect(add.rows.map(r => r.kind)).toEqual(['added', 'added'])
    expect(add.addedCount).toBe(2)
  })
})

describe('computeDiff 换行符归一化', () => {
  it('CRLF 与 LF 不产生差异', () => {
    const r = computeDiff({ left: 'a\r\nb\r\nc', right: 'a\nb\nc' })
    expect(r.status).toBe('same')
  })

  it('孤立 CR 与 LF 等价', () => {
    const r = computeDiff({ left: 'a\rb\rc', right: 'a\nb\nc' })
    expect(r.status).toBe('same')
  })
})

describe('computeDiff 忽略空白', () => {
  it('开启后仅空白差异判为相同，value 保留原文空白', () => {
    // jsdiff 内置 ignoreWhitespace 仅忽略行首/行尾空白
    const r = computeDiff({ left: 'a ', right: 'a', ignoreWhitespace: true })
    expect(r.status).toBe('same')
  })

  it('关闭（默认）时空白差异判为 diff', () => {
    const r = computeDiff({ left: 'a ', right: 'a' })
    expect(r.status).toBe('diff')
  })

  it('开启后展示仍保留原文空白', () => {
    const r = computeDiff({ left: 'a ', right: 'a', ignoreWhitespace: false })
    expect(r.status).toBe('diff')
    const rows = r.rows.filter(x => x.kind === 'modified')
    expect(rows[0].leftText).toBe('a ')
    expect(rows[0].rightText).toBe('a')
  })
})

describe('computeDiff 大小写默认精确区分', () => {
  it('仅大小写不同 → diff（无忽略大小写开关）', () => {
    const r = computeDiff({ left: 'Hello', right: 'hello' })
    expect(r.status).toBe('diff')
  })
})

describe('computeDiff 行级 + 行配对', () => {
  it('相邻删除+新增配对为一行修改', () => {
    const r = computeDiff({ left: 'a\nold line\nc', right: 'a\nnew line\nc' })
    expect(r.status).toBe('diff')
    expect(r.modifiedCount).toBe(1)
    const m = r.rows.find(x => x.kind === 'modified')
    expect(m!.leftLine).toBe(2)
    expect(m!.rightLine).toBe(2)
    expect(m!.leftText).toBe('old line')
    expect(m!.rightText).toBe('new line')
    // 行内字符级片段：changed / unchanged 区间
    const changedTexts = m!.leftSegments!.filter(s => s.type === 'changed').map(s => s.text).join('')
    expect(changedTexts).toBe('old')
    const rightChanged = m!.rightSegments!.filter(s => s.type === 'changed').map(s => s.text).join('')
    expect(rightChanged).toBe('new')
  })

  it('无配对的新增行独立展示（右列绿）', () => {
    const r = computeDiff({ left: 'a\nb', right: 'a\nb\nnew1\nnew2' })
    expect(r.rows.filter(x => x.kind === 'added').map(x => x.rightLine)).toEqual([3, 4])
    expect(r.addedCount).toBe(2)
  })

  it('无配对的删除行独立展示（左列红）', () => {
    const r = computeDiff({ left: 'a\nold1\nold2\nb', right: 'a\nb' })
    expect(r.rows.filter(x => x.kind === 'deleted').map(x => x.leftLine)).toEqual([2, 3])
    expect(r.deletedCount).toBe(2)
  })

  it('多行修改成对配对且行号连续', () => {
    // jsdiff 将 '1' 与 '3' 判为公共行，'2' 修改为 'X'，'Y' 为独立新增
    const r = computeDiff({ left: '1\n2\n3', right: '1\nX\nY\n3' })
    expect(r.status).toBe('diff')
    expect(r.modifiedCount).toBe(1)
    const mods = r.rows.filter(x => x.kind === 'modified')
    expect(mods[0].leftLine).toBe(2)
    expect(mods[0].rightLine).toBe(2)
    const adds = r.rows.filter(x => x.kind === 'added')
    expect(adds.map(x => x.rightLine)).toEqual([3])
  })
})

describe('computeDiff 行号', () => {
  it('左右行号在相等行上对应', () => {
    const r = computeDiff({ left: 'a\nb\nc', right: 'a\nb\nX\nc' })
    const equals = r.rows.filter(x => x.kind === 'equal')
    expect(equals.map(x => [x.leftLine, x.rightLine])).toEqual([[1, 1], [2, 2], [3, 4]])
  })
})
