<template>
  <ToolLayout :tool="toolMeta">
    <div class="text-stats">
      <!-- 输入：实时统计（防抖），1 MiB 超限截断并提示 -->
      <section class="panel">
        <label class="label" for="text-stats-input">{{ t('textStats.inputLabel') }}</label>
        <textarea
          id="text-stats-input"
          v-model="text"
          class="textarea"
          data-test="stats-input"
          :placeholder="t('textStats.inputPlaceholder')"
          rows="8"
          @input="onInput"
        />
        <p v-if="truncated" class="warning" data-test="limit-warning">{{ t('textStats.limitWarning') }}</p>
      </section>

      <!-- 指标：全部即时展示（字素为条件行，阅读时长空文本隐藏） -->
      <section class="panel">
        <div class="metrics">
          <div class="metric" data-test="stat-chars">
            <span class="metric-label">{{ t('textStats.chars') }}</span>
            <span class="metric-value">{{ stats.codePoints }}</span>
          </div>
          <div class="metric" data-test="stat-chars-ns">
            <span class="metric-label">{{ t('textStats.charsNoSpace') }}</span>
            <span class="metric-value">{{ stats.codePointsNoWhitespace }}</span>
          </div>
          <div v-if="stats.showGraphemes" class="metric" data-test="stat-graphemes">
            <span class="metric-label">{{ t('textStats.graphemes') }}</span>
            <span class="metric-value">{{ stats.graphemes }}</span>
          </div>
          <div class="metric" data-test="stat-bytes">
            <span class="metric-label">{{ t('textStats.bytes') }}</span>
            <span class="metric-value">{{ stats.bytes }}</span>
          </div>
          <div class="metric" data-test="stat-words">
            <span class="metric-label">{{ t('textStats.words') }}</span>
            <span class="metric-value">{{ stats.words }}</span>
          </div>
          <div class="metric" data-test="stat-lines">
            <span class="metric-label">{{ t('textStats.lines') }}</span>
            <span class="metric-value">{{ stats.lines }}</span>
          </div>
          <div class="metric" data-test="stat-paragraphs">
            <span class="metric-label">{{ t('textStats.paragraphs') }}</span>
            <span class="metric-value">{{ stats.paragraphs }}</span>
          </div>
          <div v-if="stats.reading" class="metric" data-test="stat-reading">
            <span class="metric-label">{{ t('textStats.reading') }}</span>
            <span class="metric-value">{{ readingLabel }}</span>
          </div>
        </div>
        <p class="hint">{{ t('textStats.wordsHint') }}</p>
        <div class="actions">
          <button class="btn" data-test="copy-summary" :disabled="!hasContent" @click="copySummary">
            <Copy :size="16" />
            {{ copied ? t('textStats.copied') : t('textStats.copySummary') }}
          </button>
          <button class="btn" data-test="clear" @click="clear">
            <Trash2 :size="16" />
            {{ t('textStats.clear') }}
          </button>
        </div>
      </section>

      <!-- 词频 Top-N（分词口径：按词 = Segmenter 词级；按字 = CJK 逐字） -->
      <section class="panel" data-test="freq-section">
        <div class="freq-head">
          <h2 class="section-title">{{ t('textStats.freqTitle') }}</h2>
          <div class="seg" role="group" :aria-label="t('textStats.freqModeLabel')" data-test="freq-mode">
            <button
              type="button"
              class="seg-btn"
              :class="{ active: freqMode === 'word' }"
              data-test="freq-mode-word"
              @click="freqMode = 'word'"
            >
              {{ t('textStats.freqModeWord') }}
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: freqMode === 'char' }"
              data-test="freq-mode-char"
              @click="freqMode = 'char'"
            >
              {{ t('textStats.freqModeChar') }}
            </button>
          </div>
          <div class="seg" role="group" :aria-label="t('textStats.freqTierLabel')" data-test="freq-tiers">
            <button
              v-for="n in TOP_N_TIERS"
              :key="n"
              type="button"
              class="seg-btn"
              :class="{ active: topN === n }"
              :data-test="`freq-tier-${n}`"
              @click="topN = n"
            >
              {{ n }}
            </button>
          </div>
        </div>
        <p class="hint">{{ t('textStats.freqHint') }}</p>
        <p class="hint">{{ t('textStats.freqLatinHint') }}</p>
        <table v-if="freqResult.entries.length > 0" class="freq-table">
          <thead>
            <tr>
              <th scope="col">{{ t('textStats.freqColWord') }}</th>
              <th scope="col" class="num">{{ t('textStats.freqColCount') }}</th>
              <th scope="col" class="num">{{ t('textStats.freqColShare') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in freqRows"
              :key="entry.token"
              class="freq-row"
              :class="{ copied: copiedToken === entry.token }"
              :title="t('textStats.freqCopyHint')"
              data-test="freq-row"
              @click="copyWord(entry.token)"
            >
              <td class="mono">{{ entry.token }}</td>
              <td class="num">{{ entry.count }}</td>
              <td class="num">{{ shareLabel(entry.count) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="hint" data-test="freq-empty">{{ t('textStats.freqEmpty') }}</p>
        <p v-if="freqResult.total > 0" class="hint" data-test="freq-total">
          {{ t('textStats.freqTotal', { total: String(freqResult.total) }) }}
        </p>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Copy, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import TextStats from './TextStats.vue'
import { computeStats, enforceInputLimit } from './stats'
import { DEFAULT_TOP_N, TOP_N_TIERS, computeWordFrequency, sharePercent } from './frequency'
import type { FrequencyMode } from './frequency'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'text-stats',
  name: '文本统计',
  description: '字符、字素、字节、词、行、段落与阅读时长统计',
  category: 'text',
  icon: 'ChartNoAxesColumn',
  component: TextStats,
  keywords: ['text', 'stats', 'word count', 'character', 'reading time', 'word frequency', 'top-n', '字数', '统计', '词频'],
}

// ---- 实时统计（防抖，延续平台联动惯例） ----

const DEBOUNCE_MS = 250

const text = ref('')
const debouncedText = ref('')
const truncated = ref(false)
const stats = computed(() => computeStats(debouncedText.value))

let timer: number | undefined
let copiedTimer: number | undefined

function flushStats(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }
  debouncedText.value = text.value
}

function onInput(): void {
  // 1 MiB 上限：超限在码点边界同步截断并提示（规格 §4）
  const res = enforceInputLimit(text.value)
  if (res.truncated) {
    text.value = res.text
    truncated.value = true
    flushStats()
    return
  }
  truncated.value = false
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    debouncedText.value = text.value
  }, DEBOUNCE_MS)
}

onUnmounted(() => {
  if (timer !== undefined) window.clearTimeout(timer)
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  if (copiedTokenTimer !== undefined) window.clearTimeout(copiedTokenTimer)
})

// ---- 展示 ----

const hasContent = computed(() => stats.value.codePoints > 0)

const readingLabel = computed(() => {
  const r = stats.value.reading
  if (!r) return ''
  return r.underOne
    ? t('textStats.readingUnderOne')
    : t('textStats.readingMinutes', { minutes: String(r.minutes) })
})

/** 单行统计摘要（规格 §4 示例格式：字符 N · 词 N · 行 N · 约 N 分钟） */
const summary = computed(() => {
  const s = stats.value
  const parts = [
    `${t('textStats.chars')} ${s.codePoints}`,
    `${t('textStats.words')} ${s.words}`,
    `${t('textStats.lines')} ${s.lines}`,
  ]
  if (s.reading) parts.push(readingLabel.value)
  return parts.join(' · ')
})

const copied = ref(false)

async function copySummary(): Promise<void> {
  if (!hasContent.value) return
  await navigator.clipboard.writeText(summary.value)
  copied.value = true
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copied.value = false
    copiedTimer = undefined
  }, 2000)
}

function clear(): void {
  text.value = ''
  truncated.value = false
  flushStats()
}

// ---- 词频 Top-N（跟随防抖后的文本实时联动） ----

/** 分词口径：按词（真词频）/ 按字（CJK 逐字）；默认按词。 */
const freqMode = ref<FrequencyMode>('word')
const topN = ref<number>(DEFAULT_TOP_N)

const freqResult = computed(() => computeWordFrequency(debouncedText.value, freqMode.value))
/** Top-N 截断只在展示层：total 不受影响（总数依据不丢失） */
const freqRows = computed(() => freqResult.value.entries.slice(0, topN.value))

function shareLabel(count: number): string {
  return `${sharePercent(count, freqResult.value.total).toFixed(1)}%`
}

const copiedToken = ref('')
let copiedTokenTimer: number | undefined

async function copyWord(token: string): Promise<void> {
  await navigator.clipboard.writeText(token)
  copiedToken.value = token
  if (copiedTokenTimer !== undefined) window.clearTimeout(copiedTokenTimer)
  copiedTokenTimer = window.setTimeout(() => {
    copiedToken.value = ''
    copiedTokenTimer = undefined
  }, 1500)
}
</script>

<style scoped>
.text-stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.textarea {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: var(--space-md);
  resize: vertical;
  outline: none;
  transition: border-color var(--transition-fast);
}

.textarea:focus {
  border-color: var(--border-focus);
}

.textarea::placeholder {
  color: var(--text-quaternary);
}

.warning {
  color: var(--error);
  font-size: 12px;
  margin: 0;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-sm);
}

.metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.metric-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 590;
  color: var(--text-primary);
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.section-title {
  font-size: 15px;
  font-weight: 590;
  color: var(--text-primary);
  margin: 0;
}

.freq-head {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.seg-btn {
  padding: 4px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.seg-btn + .seg-btn {
  border-left: 1px solid var(--border);
}

.seg-btn:hover {
  background: var(--bg-hover);
}

.seg-btn.active {
  background: var(--accent);
  color: #fff;
}

.freq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.freq-table th {
  text-align: left;
  font-weight: 510;
  color: var(--text-secondary);
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--border);
}

.freq-table th.num,
.freq-table td.num {
  text-align: right;
  width: 88px;
}

.freq-row {
  cursor: pointer;
  transition: background var(--transition-fast);
}

.freq-row:hover {
  background: var(--bg-hover);
}

.freq-row.copied td {
  color: var(--success);
}

.freq-table td {
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.mono {
  font-family: var(--font-mono);
  word-break: break-all;
}

.btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
