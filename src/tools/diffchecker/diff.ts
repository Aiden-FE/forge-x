/**
 * 纯 diff 计算模块（不依赖 Vue）。
 *
 * 唯一可测缝：输入两份文本 + 选项 → 结构化差异结果。
 * UI 组件仅负责渲染本模块的输出，不内嵌任何算法。
 *
 * 语义约定（见根 CONTEXT.md）：
 * - 换行符归一化：比较前始终将 CRLF / 孤立 CR 视为 LF，始终开启。
 * - 忽略空白：仅影响相等性判定；`value` 保留原文空白。
 * - 大小写：默认精确区分，无忽略大小写开关。
 * - 行配对：删除行与其紧随的新增行按 1:1 贪心配对为「修改行」；
 *   剩余无配对的新增/删除行独立展示。
 * - 边界状态：相同 / 双空 / 单侧空（单侧空按全删/全增正常渲染）。
 */
import { diffLines, diffChars } from 'diff'

export interface DiffInput {
  left: string
  right: string
  ignoreWhitespace?: boolean
}

export type DiffStatus = 'same' | 'both-empty' | 'diff'

export type RowKind = 'equal' | 'added' | 'deleted' | 'modified'

export interface CharSegment {
  text: string
  type: 'unchanged' | 'changed'
}

export interface DiffRow {
  kind: RowKind
  /** 该行在左侧（旧文本）中的行号；右侧无对应行时为 null */
  leftLine: number | null
  /** 该行在右侧（新文本）中的行号；左侧无对应行时为 null */
  rightLine: number | null
  leftText: string | null
  rightText: string | null
  /** 修改行的行内字符级片段（仅 kind === 'modified' 时有值） */
  leftSegments?: CharSegment[]
  rightSegments?: CharSegment[]
}

export interface DiffResult {
  status: DiffStatus
  rows: DiffRow[]
  modifiedCount: number
  addedCount: number
  deletedCount: number
}

/** 将文本中的 CRLF 与孤立 CR 统一归一化为 LF。 */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** 将一个 diff 片段 value 拆成行（去掉末尾因换行产生的空串）。 */
function splitLines(value: string): string[] {
  const raw = value.split('\n')
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()
  return raw
}

/** 对一对「修改行」做行内字符级 diff，输出左右两侧的字符片段。 */
function inlineSegments(left: string, right: string): { leftSegments: CharSegment[]; rightSegments: CharSegment[] } {
  const parts = diffChars(left, right)
  const leftSegments: CharSegment[] = []
  const rightSegments: CharSegment[] = []
  for (const part of parts) {
    if (part.added) {
      rightSegments.push({ text: part.value, type: 'changed' })
    } else if (part.removed) {
      leftSegments.push({ text: part.value, type: 'changed' })
    } else {
      leftSegments.push({ text: part.value, type: 'unchanged' })
      rightSegments.push({ text: part.value, type: 'unchanged' })
    }
  }
  return { leftSegments, rightSegments }
}

/** 计算两份文本的结构化差异。 */
export function computeDiff(input: DiffInput): DiffResult {
  const left = normalizeNewlines(input.left)
  const right = normalizeNewlines(input.right)

  // 双空 → 占位状态
  if (left === '' && right === '') {
    return { status: 'both-empty', rows: [], modifiedCount: 0, addedCount: 0, deletedCount: 0 }
  }

  const changes = diffLines(left, right, input.ignoreWhitespace ? { ignoreWhitespace: true } : undefined)

  // 完全相同 → 成功状态
  let hasAdded = false
  let hasRemoved = false
  for (const c of changes) {
    if (c.added) hasAdded = true
    if (c.removed) hasRemoved = true
  }
  if (!hasAdded && !hasRemoved) {
    return { status: 'same', rows: [], modifiedCount: 0, addedCount: 0, deletedCount: 0 }
  }

  const rows: DiffRow[] = []
  let leftLine = 0
  let rightLine = 0
  let modifiedCount = 0
  let addedCount = 0
  let deletedCount = 0

  // 等待与紧随新增行配对的一批删除行
  let pendingRemoved: { text: string; line: number }[] = []

  const flushPendingAsDeleted = () => {
    for (const r of pendingRemoved) {
      rows.push({ kind: 'deleted', leftLine: r.line, rightLine: null, leftText: r.text, rightText: null })
      deletedCount++
    }
    pendingRemoved = []
  }

  for (const change of changes) {
    if (!change.added && !change.removed) {
      // 相等块：先把未配对的删除行落为独立删除，再输出相等行
      flushPendingAsDeleted()
      for (const line of splitLines(change.value)) {
        leftLine++
        rightLine++
        rows.push({ kind: 'equal', leftLine, rightLine, leftText: line, rightText: line })
      }
      continue
    }

    if (change.removed) {
      for (const line of splitLines(change.value)) {
        leftLine++
        pendingRemoved.push({ text: line, line: leftLine })
      }
      continue
    }

    // change.added：与紧随的待配对删除行按 1:1 贪心配对
    const addedLines = splitLines(change.value)
    const pairCount = Math.min(pendingRemoved.length, addedLines.length)
    const startRight = rightLine

    for (let i = 0; i < pairCount; i++) {
      const leftText = pendingRemoved[i].text
      const rightText = addedLines[i]
      const segs = inlineSegments(leftText, rightText)
      rows.push({
        kind: 'modified',
        leftLine: pendingRemoved[i].line,
        rightLine: startRight + i + 1,
        leftText,
        rightText,
        leftSegments: segs.leftSegments,
        rightSegments: segs.rightSegments,
      })
      modifiedCount++
    }

    // 未被配对的删除行 → 独立删除
    for (let i = pairCount; i < pendingRemoved.length; i++) {
      rows.push({ kind: 'deleted', leftLine: pendingRemoved[i].line, rightLine: null, leftText: pendingRemoved[i].text, rightText: null })
      deletedCount++
    }
    pendingRemoved = []

    // 未被配对的新增行 → 独立新增（行号从已配对新增行之后继续）
    rightLine = startRight + pairCount
    for (let i = pairCount; i < addedLines.length; i++) {
      rightLine++
      rows.push({ kind: 'added', leftLine: null, rightLine, leftText: null, rightText: addedLines[i] })
      addedCount++
    }
  }

  // 末尾未配对的删除行
  flushPendingAsDeleted()

  return { status: 'diff', rows, modifiedCount, addedCount, deletedCount }
}
