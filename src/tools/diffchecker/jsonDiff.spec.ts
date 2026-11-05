/**
 * 10 票扩展：JSON 结构化 diff 验收——路径正确性 fixture。
 *
 * 覆盖：增 / 删 / 改 / 嵌套路径 / 数组索引对齐（含越界段整段增删）、
 * 类型变更、JSON Pointer 转义（`~`、`/`）、单侧空、双空、解析错误按侧
 * 行列定位、值预览截断。
 */
import { describe, expect, it } from 'vitest'
import {
  computeJsonStructuredDiff,
  computeJsonTreeDiff,
  formatValuePreview,
  jsonDeepEqual,
} from './jsonDiff'
import type { JsonChange } from './jsonDiff'

function runDiff(left: string, right: string): JsonChange[] {
  const outcome = computeJsonStructuredDiff(left, right)
  if (!outcome.ok) throw new Error(`unexpected parse failure: ${JSON.stringify(outcome.issues)}`)
  return outcome.result.changes
}

function simplify(changes: JsonChange[]): Array<[string, JsonChange['type']]> {
  return changes.map((change) => [change.path, change.type])
}

describe('路径正确性 fixture：增 / 删 / 改 / 嵌套 / 数组索引', () => {
  const left = JSON.stringify({
    name: 'forge',
    version: 1,
    kept: true,
    removedKey: 'gone',
    nested: { a: 1, b: { c: 2 } },
    items: [
      { id: 1, tag: 'x' },
      { id: 2, tag: 'y' },
      { id: 3 },
    ],
  })
  const right = JSON.stringify({
    name: 'forge',
    version: 2,
    kept: true,
    addedKey: 'here',
    nested: { a: 1, b: { c: 3 } },
    items: [
      { id: 1, tag: 'x' },
      { id: 2, tag: 'z' },
      { id: 3 },
      { id: 4 },
    ],
  })

  it('变更路径与操作类型逐条正确', () => {
    expect(simplify(runDiff(left, right))).toEqual([
      ['/version', 'changed'],
      ['/removedKey', 'removed'],
      ['/addedKey', 'added'],
      ['/nested/b/c', 'changed'],
      ['/items/1/tag', 'changed'],
      ['/items/3', 'added'],
    ])
  })

  it('旧值→新值随行携带（changed），added/removed 携带对应单侧值', () => {
    const changes = runDiff(left, right)
    const changed = changes.find((change) => change.path === '/version')
    expect(changed?.oldValue).toBe(1)
    expect(changed?.newValue).toBe(2)
    const added = changes.find((change) => change.path === '/items/3')
    expect(added?.newValue).toEqual({ id: 4 })
    expect(added?.oldValue).toBeUndefined()
    const removed = changes.find((change) => change.path === '/removedKey')
    expect(removed?.oldValue).toBe('gone')
    expect(removed?.newValue).toBeUndefined()
  })

  it('计数与 status 一致', () => {
    const outcome = computeJsonStructuredDiff(left, right)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.status).toBe('diff')
    expect(outcome.result.addedCount).toBe(2)
    expect(outcome.result.removedCount).toBe(1)
    expect(outcome.result.changedCount).toBe(3)
  })

  it('数组缩短：越界段整段删除，路径为数组索引', () => {
    expect(simplify(runDiff('[1,2,3,4]', '[1,2]'))).toEqual([
      ['/2', 'removed'],
      ['/3', 'removed'],
    ])
  })

  it('数组中间插入（索引对齐口径）：插入点之后表现为逐位修改，不做移动检测', () => {
    expect(simplify(runDiff('[1,2,3]', '[1,9,2,3]'))).toEqual([
      ['/1', 'changed'],
      ['/2', 'changed'],
      ['/3', 'added'],
    ])
  })

  it('类型变更（对象→标量）记为一条修改，根路径为空串', () => {
    expect(simplify(runDiff('{"a":1}', '[1]'))).toEqual([['', 'changed']])
    expect(simplify(runDiff('1', '"1"'))).toEqual([['', 'changed']])
  })

  it('JSON Pointer 转义：键中的 ~ 与 /', () => {
    expect(simplify(runDiff('{"a/b": 1, "c~d": 2}', '{"a/b": 2, "c~d": 3}'))).toEqual([
      ['/a~1b', 'changed'],
      ['/c~0d', 'changed'],
    ])
  })

  it('嵌套增删：整子树一条记录（路径为子树根）', () => {
    expect(simplify(runDiff('{"a":{"x":1}}', '{"a":{"x":1,"sub":{"deep":[1,2]}}}'))).toEqual([
      ['/a/sub', 'added'],
    ])
    expect(simplify(runDiff('{"a":{"x":1,"old":{"deep":true}}}', '{"a":{"x":1}}'))).toEqual([
      ['/a/old', 'removed'],
    ])
  })

  it('完全相同 → same 且零变更', () => {
    const outcome = computeJsonStructuredDiff('{"a":[1,{"b":2}]}', '{"a":[1,{"b":2}]}')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.status).toBe('same')
    expect(outcome.result.changes).toEqual([])
  })
})

describe('空态（沿 diffchecker 空状态口径）', () => {
  it('双空 → both-empty', () => {
    const outcome = computeJsonStructuredDiff('', '   ')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.status).toBe('both-empty')
  })

  it('仅左侧空 → 全部新增', () => {
    const changes = runDiff('', '{"a":1,"b":[2]}')
    expect(simplify(changes)).toEqual([['', 'added']])
  })

  it('仅右侧空 → 全部删除', () => {
    const changes = runDiff('{"a":1,"b":[2]}', '')
    expect(simplify(changes)).toEqual([['', 'removed']])
  })
})

describe('解析错误：按侧定位、互不掩盖', () => {
  it('双侧各有错误时同时呈现，行列各自定位', () => {
    const outcome = computeJsonStructuredDiff('{\n  "a": 1\n  "b": 2\n}', '{"ok": ]}')
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.issues).toHaveLength(2)
    const leftIssue = outcome.issues.find((issue) => issue.side === 'left')
    const rightIssue = outcome.issues.find((issue) => issue.side === 'right')
    expect(leftIssue?.line).toBe(3)
    expect(leftIssue?.column).toBe(3)
    expect(rightIssue?.line).toBe(1)
    expect(rightIssue?.column).toBe(9)
  })

  it('单侧错误只报该侧', () => {
    const outcome = computeJsonStructuredDiff('{"ok":1}', 'not json')
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.issues).toHaveLength(1)
    expect(outcome.issues[0]?.side).toBe('right')
  })
})

describe('jsonDeepEqual 与值预览', () => {
  it('类型严格：1 与 "1" 不等；结构与值深度相等', () => {
    expect(jsonDeepEqual(1, '1')).toBe(false)
    expect(jsonDeepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(jsonDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(jsonDeepEqual([1, 2], [2, 1])).toBe(false)
    expect(jsonDeepEqual(null, null)).toBe(true)
    expect(jsonDeepEqual(null, {})).toBe(false)
  })

  it('预览：紧凑序列化 + 超长截断', () => {
    expect(formatValuePreview('gone')).toBe('"gone"')
    expect(formatValuePreview({ id: 4 })).toBe('{"id":4}')
    expect(formatValuePreview(undefined)).toBe('')
    const long = 'x'.repeat(100)
    const preview = formatValuePreview(long)
    expect(preview.length).toBe(64)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.startsWith(`"${'x'.repeat(62)}`)).toBe(true)
  })
})

describe('树遍历入口（已解析值）', () => {
  it('computeJsonTreeDiff 与统一入口结果一致', () => {
    const direct = computeJsonTreeDiff({ a: 1 }, { a: 2 })
    const viaText = computeJsonStructuredDiff('{"a":1}', '{"a":2}')
    expect(viaText.ok && viaText.result.changes).toEqual(direct.changes)
  })
})
