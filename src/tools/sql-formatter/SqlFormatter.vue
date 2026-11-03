<template>
  <ToolLayout :tool="toolMeta">
    <div class="sql-tool">
      <!-- 输入：1 MiB 粘贴上限 + 300ms 实时防抖（转换类约定） -->
      <section class="panel">
        <label class="label" for="sql-input">{{ t('sqlFormatter.inputLabel') }}</label>
        <textarea
          id="sql-input"
          v-model="input"
          class="textarea"
          data-test="sql-input"
          :placeholder="t('sqlFormatter.inputPlaceholder')"
          rows="8"
          @input="onInput"
        />
        <p v-if="truncated" class="warning" data-test="sql-limit-warning">
          {{ t('sqlFormatter.limitWarning') }}
        </p>
      </section>

      <!-- 控制区：方言 + 精选选项（identifierCase 无任何入口） -->
      <section class="panel">
        <div class="controls">
          <div class="control">
            <label class="label" for="sql-dialect">{{ t('sqlFormatter.dialect') }}</label>
            <select id="sql-dialect" v-model="options.dialect" class="select" data-test="sql-dialect">
              <option v-for="d in DIALECTS" :key="d" :value="d">
                {{ t(`sqlFormatter.dialects.${d}`) }}
              </option>
            </select>
          </div>
          <div class="control">
            <label class="label" for="sql-indent">{{ t('sqlFormatter.indent') }}</label>
            <select id="sql-indent" v-model="options.indent" class="select" data-test="sql-indent">
              <option v-for="c in INDENT_CHOICES" :key="c" :value="c">
                {{ t(`sqlFormatter.indentChoices.${c}`) }}
              </option>
            </select>
          </div>
          <div class="control">
            <label class="label" for="sql-keyword-case">{{ t('sqlFormatter.keywordCase') }}</label>
            <select
              id="sql-keyword-case"
              v-model="options.keywordCase"
              class="select"
              data-test="sql-keyword-case"
            >
              <option v-for="c in KEYWORD_CASES" :key="c" :value="c">
                {{ t(`sqlFormatter.keywordCases.${c}`) }}
              </option>
            </select>
          </div>
          <div class="control">
            <label class="label" for="sql-expression-width">
              {{ t('sqlFormatter.expressionWidth') }}
            </label>
            <input
              id="sql-expression-width"
              v-model="expressionWidthRaw"
              class="number-input"
              data-test="sql-expression-width"
              type="number"
              :min="MIN_EXPRESSION_WIDTH"
              :max="MAX_EXPRESSION_WIDTH"
            />
          </div>
          <div class="control">
            <label class="label" for="sql-lines-between">
              {{ t('sqlFormatter.linesBetweenQueries') }}
            </label>
            <input
              id="sql-lines-between"
              v-model="linesBetweenRaw"
              class="number-input"
              data-test="sql-lines-between"
              type="number"
              :min="LINES_BETWEEN_MIN"
              :max="LINES_BETWEEN_MAX"
            />
          </div>
          <div class="control">
            <label class="label checkbox-label" for="sql-dense">
              {{ t('sqlFormatter.denseOperators') }}
            </label>
            <input id="sql-dense" v-model="options.denseOperators" type="checkbox" data-test="sql-dense" />
          </div>
        </div>
        <p class="hint" data-test="sql-best-effort">{{ t('sqlFormatter.bestEffort') }}</p>
      </section>

      <div class="actions">
        <button class="btn" data-test="sql-copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('sqlFormatter.copied') : t('sqlFormatter.copy') }}
        </button>
        <button class="btn" data-test="sql-download" :disabled="!output" @click="download">
          <Download :size="16" />
          {{ t('sqlFormatter.download') }}
        </button>
        <button class="btn" data-test="sql-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('sqlFormatter.clear') }}
        </button>
      </div>

      <!-- 输出：报错时保留上一次输出（尽力而为格式化） -->
      <section class="panel">
        <label class="label" for="sql-output">{{ t('sqlFormatter.output') }}</label>
        <textarea
          id="sql-output"
          v-model="output"
          class="textarea"
          data-test="sql-output"
          readonly
          rows="10"
        />
        <p v-if="error" class="error" data-test="sql-error">{{ error }}</p>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref, watch } from 'vue'
import { Copy, Download, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import SqlFormatter from './SqlFormatter.vue'
import {
  DIALECTS,
  DEFAULT_OPTIONS,
  INDENT_CHOICES,
  KEYWORD_CASES,
  LINES_BETWEEN_MAX,
  LINES_BETWEEN_MIN,
  MAX_EXPRESSION_WIDTH,
  MIN_EXPRESSION_WIDTH,
  clampExpressionWidth,
  clampLinesBetween,
} from './sqlEngine'
import type { SqlFormatOptions } from './sqlEngine'
import { FormatClient } from './format-client'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'sql-formatter',
  name: 'SQL 格式化',
  description: '15 种方言的 SQL 排版美化，实时防抖，只管排版不管对错',
  category: 'format',
  icon: 'Database',
  component: SqlFormatter,
  keywords: ['sql', 'format', '格式化', '美化', 'beautify', 'mysql', 'postgresql'],
}

// ---- 1 MiB 输入上限（平台惯例；UTF-8 字节，码点边界截断） ----

const MAX_INPUT_BYTES = 1024 * 1024

function utf8ByteLen(cp: number): number {
  if (cp <= 0x7f) return 1
  if (cp <= 0x7ff) return 2
  if (cp <= 0xffff) return 3
  return 4
}

function enforceInputLimit(text: string): { text: string; truncated: boolean } {
  if (text.length * 3 <= MAX_INPUT_BYTES) return { text, truncated: false }
  let bytes = 0
  let end = 0
  for (const ch of text) {
    const b = utf8ByteLen(ch.codePointAt(0)!)
    if (bytes + b > MAX_INPUT_BYTES) return { text: text.slice(0, end), truncated: true }
    bytes += b
    end += ch.length
  }
  return { text, truncated: false }
}

// ---- 状态 ----

const input = ref('')
const truncated = ref(false)
const options = reactive<SqlFormatOptions>({ ...DEFAULT_OPTIONS })
const expressionWidthRaw = ref(String(DEFAULT_OPTIONS.expressionWidth))
const linesBetweenRaw = ref(String(DEFAULT_OPTIONS.linesBetweenQueries))
const output = ref('')
const error = ref('')

// ---- 300ms 实时防抖（输入与全部选项共用一个节奏） ----

const DEBOUNCE_MS = 300

let timer: number | undefined
let copiedTimer: number | undefined
const client = new FormatClient()

function onInput(): void {
  const res = enforceInputLimit(input.value)
  if (res.truncated) {
    input.value = res.text
    truncated.value = true
  } else {
    truncated.value = false
  }
  scheduleFormat()
}

function scheduleFormat(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    runFormat()
  }, DEBOUNCE_MS)
}

function runFormat(): void {
  const snapshot: SqlFormatOptions = {
    ...options,
    expressionWidth: clampExpressionWidth(Number(expressionWidthRaw.value)),
    linesBetweenQueries: clampLinesBetween(Number(linesBetweenRaw.value)),
  }
  // 一律 Worker 执行（规格 §3）：词法崩溃 → 错误态 + 保留上一次输出（尽力而为格式化）
  client.run({ input: input.value, options: snapshot }, (res) => {
    if (res.ok) {
      output.value = res.sql
      error.value = ''
    } else {
      error.value = `${t('sqlFormatter.errFormat')}: ${res.error}`
    }
  })
}

watch(
  [() => options.dialect, () => options.indent, () => options.keywordCase, () => options.denseOperators],
  scheduleFormat,
)
watch([expressionWidthRaw, linesBetweenRaw], scheduleFormat)

onUnmounted(() => {
  if (timer !== undefined) window.clearTimeout(timer)
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  client.dispose()
})

// ---- 输出动作 ----

const copied = ref(false)

async function copy(): Promise<void> {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  copied.value = true
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copied.value = false
    copiedTimer = undefined
  }, 1500)
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function download(): void {
  if (!output.value) return
  const blob = new Blob([output.value], { type: 'text/sql;charset=utf-8' })
  triggerDownload(blob, 'formatted.sql')
}

function clear(): void {
  input.value = ''
  truncated.value = false
  output.value = ''
  error.value = ''
}
</script>

<style scoped>
.sql-tool {
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

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.control {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.select,
.number-input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-xs) var(--space-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.select:focus,
.number-input:focus {
  border-color: var(--border-focus);
}

.number-input {
  width: 90px;
  font-family: var(--font-mono);
}

.checkbox-label {
  font-weight: 400;
}

.checkbox-label + input {
  align-self: flex-start;
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.warning {
  color: var(--error);
  font-size: 12px;
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

.error {
  color: var(--error);
  font-size: 13px;
  margin-top: var(--space-sm);
}
</style>
