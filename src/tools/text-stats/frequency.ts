/**
 * 词频 Top-N 纯逻辑模块（零第三方依赖）。
 *
 * 术语见 CONTEXT.md「分词口径 (Segmentation)」——词频区块的切分档位：
 * - 「按词」= Intl.Segmenter 词级切分（真词频，随运行环境词典）；
 * - 「按字」= 汉字逐字计（与「统计词」口径一致，即字频）；
 * - 拉丁文两档等价（空格/标点分词）。
 *
 * 与「统计词」是两个概念：后者是文本统计指标专用、永不随环境变化；
 * 本模块只在词频区块消费，不改动任何既有指标。
 *
 * 拉丁词小写归一计数（The / THE 并入 the），明示于 UI。
 * Intl.Segmenter 不可用的环境两档统一回退到统计词确定式切分（无词典可用，
 * 真词频不可得；回退路径两档同源，等价性仍成立）。
 */

/** 切分档位：按词 / 按字（CONTEXT.md「分词口径」）。 */
export type FrequencyMode = 'word' | 'char'

/** Top-N 档位。 */
export const TOP_N_TIERS = [10, 20, 50, 100] as const
export const DEFAULT_TOP_N: (typeof TOP_N_TIERS)[number] = 20

export interface FrequencyEntry {
  /** 归一后的词（拉丁词已小写） */
  token: string
  count: number
}

export interface FrequencyResult {
  /** 按频次降序（同频按首次出现序，稳定排序）；未截断的全量表 */
  entries: FrequencyEntry[]
  /** 该口径总词数——占比与「截断不丢失总数依据」的分母 */
  total: number
}

/** 汉字（\p{Script=Han}，与 stats.ts 的统计词口径同一集合）。 */
const HAN_RE = /\p{Script=Han}/gu

function isHanChar(ch: string): boolean {
  HAN_RE.lastIndex = 0
  return HAN_RE.test(ch)
}

function addToken(buckets: Map<string, number>, token: string): void {
  // 拉丁词小写归一（明示）；CJK 无大小写概念，不受影响
  const key = token.toLowerCase()
  buckets.set(key, (buckets.get(key) ?? 0) + 1)
}

/* ---------- 词级切分（Intl.Segmenter，原生 0 依赖） ---------- */

interface WordSegmentData {
  segment: string
  /** 词级粒度下单词段为 true；空白/标点段为 false 或缺失 */
  isWordLike?: boolean
}

type WordSegmenter = { segment(input: string): Iterable<WordSegmentData> }

let wordSegmenter: WordSegmenter | null | undefined

function getWordSegmenter(): WordSegmenter | null {
  if (wordSegmenter !== undefined) return wordSegmenter
  wordSegmenter =
    typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function'
      ? (new (Intl as unknown as { Segmenter: new (l?: string, o?: { granularity: string }) => WordSegmenter }).Segmenter(
          undefined,
          { granularity: 'word' },
        ) as WordSegmenter)
      : null
  return wordSegmenter
}

/**
 * 「按字」档的段内切分：词段中的汉字逐字出桶，其余字符保持原段
 * （拉丁/其他文字与「按词」档逐段等价）。
 */
function splitSegmentPerChar(segment: string, buckets: Map<string, number>): void {
  let run = ''
  for (const ch of segment) {
    if (isHanChar(ch)) {
      if (run !== '') {
        addToken(buckets, run)
        run = ''
      }
      addToken(buckets, ch)
    } else {
      run += ch
    }
  }
  if (run !== '') addToken(buckets, run)
}

/** 词级切分主路径。 */
function computeWithSegmenter(text: string, mode: FrequencyMode, buckets: Map<string, number>): void {
  const seg = getWordSegmenter()
  if (!seg) return
  for (const item of seg.segment(text)) {
    if (item.isWordLike !== true) continue
    if (mode === 'char') {
      splitSegmentPerChar(item.segment, buckets)
    } else {
      addToken(buckets, item.segment)
    }
  }
}

/* ---------- 确定式回退（无 Intl.Segmenter 环境） ---------- */

/** 统计词的拉丁/数字词正则（词内 `'`、`-` 不拆词）——回退档两档同源。 */
const WORD_RE = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu

function computeDeterministic(text: string, buckets: Map<string, number>): void {
  // 汉字逐字出桶；拉丁段在移除汉字后的文本上切分（与统计词切分一致）
  for (const ch of text.match(HAN_RE) ?? []) addToken(buckets, ch)
  for (const run of text.replace(HAN_RE, ' ').match(WORD_RE) ?? []) addToken(buckets, run)
}

/* ---------- 汇总 ---------- */

/**
 * 词频计算：返回全量词表（频次降序、同频首次出现序）与该口径总词数。
 * Top-N 截断由展示层做——截断不改变 total（总数依据不丢失）。
 */
export function computeWordFrequency(text: string, mode: FrequencyMode): FrequencyResult {
  const buckets = new Map<string, number>()
  if (getWordSegmenter()) {
    computeWithSegmenter(text, mode, buckets)
  } else {
    computeDeterministic(text, buckets)
  }
  const entries = [...buckets].map(([token, count]) => ({ token, count }))
  // 稳定排序：同频保持首次出现序（Map 迭代序 = 插入序）
  entries.sort((a, b) => b.count - a.count)
  const total = entries.reduce((sum, e) => sum + e.count, 0)
  return { entries, total }
}

/** 占比 = 频次 / 该口径总词数 ×100；total 为 0 时恒 0（不产生 NaN）。 */
export function sharePercent(count: number, total: number): number {
  return total === 0 ? 0 : (count / total) * 100
}
