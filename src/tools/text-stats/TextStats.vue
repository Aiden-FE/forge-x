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

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'text-stats',
  name: '文本统计',
  description: '字符、字素、字节、词、行、段落与阅读时长统计',
  category: 'text',
  icon: 'ChartNoAxesColumn',
  component: TextStats,
  keywords: ['text', 'stats', 'word count', 'character', 'reading time', '字数', '统计'],
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
