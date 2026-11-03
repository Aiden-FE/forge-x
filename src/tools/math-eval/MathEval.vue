<template>
  <ToolLayout :tool="toolMeta">
    <div class="math-eval">
      <section class="panel">
        <label class="label" for="math-input">{{ t('mathEval.inputLabel') }}</label>
        <textarea
          id="math-input"
          v-model="text"
          class="textarea mono"
          data-test="math-input"
          :placeholder="t('mathEval.inputPlaceholder')"
          rows="10"
          spellcheck="false"
          autocomplete="off"
          @input="onInput"
        />
        <p v-if="truncated" class="error" data-test="limit-warning">{{ t('mathEval.limitWarning') }}</p>
        <p class="hint">{{ t('mathEval.functionsHint') }}</p>
      </section>

      <!-- 逐行求值：结果行内右对齐；定义行回显绑定名；错误只红该行 -->
      <section v-if="rows.length > 0" class="panel" data-test="math-rows">
        <div
          v-for="(row, i) in rows"
          :key="i"
          class="row"
          :class="{ invalid: !row.ok }"
          :data-test="`math-row-${i}`"
        >
          <template v-if="row.type === 'definition'">
            <span class="mark" :class="row.ok ? 'ok' : 'bad'">{{ row.ok ? '✓' : '✗' }}</span>
            <span class="source mono">{{ row.name }}</span>
            <span class="echo" data-test="def-name">{{ t('mathEval.definitionEcho') }}: {{ row.name }}</span>
            <span v-if="row.error" class="error line-error" :data-test="`math-error-${i}`">
              {{ errorText(row.error) }}
            </span>
          </template>
          <template v-else>
            <span class="mark" :class="row.ok ? 'ok' : 'bad'">{{ row.ok ? '=' : '✗' }}</span>
            <span class="result mono" :class="row.special" :data-test="`math-result-${i}`">
              {{ row.ok ? row.text : '' }}
              <span v-if="row.ok && row.special" class="special-name">{{ specialName(row.special) }}</span>
            </span>
            <span v-if="row.error" class="error line-error" :data-test="`math-error-${i}`">
              {{ errorText(row.error) }}
            </span>
          </template>
        </div>
      </section>
      <p v-else class="empty" data-test="math-empty">{{ t('mathEval.inputPlaceholder').split('\n')[0] }}</p>

      <!-- 历史：最近 20 个多行块，点击回填 -->
      <section class="panel">
        <h2 class="section-title">{{ t('mathEval.historyTitle') }}</h2>
        <ul v-if="history.length > 0" class="history" data-test="history-list">
          <li
            v-for="(item, i) in history"
            :key="i"
            class="history-item"
            :data-test="`history-item-${i}`"
            @click="restore(item)"
          >
            <pre class="history-preview mono">{{ item.text }}</pre>
          </li>
        </ul>
        <p v-else class="empty" data-test="history-empty">{{ t('mathEval.historyEmpty') }}</p>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import MathEval from './MathEval.vue'
import { evaluateScratchpad, pushHistory } from './eval-engine'
import type { EvalError, HistoryEntry, SpecialValue, ScratchRow } from './eval-engine'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'math-eval',
  name: '数学表达式求值',
  description: '逐行求值数学表达式，双精度浮点如实呈现',
  category: 'debug',
  icon: 'Calculator',
  component: MathEval,
  keywords: ['math', '计算', '表达式', '求值', 'calculator', 'evaluate', '公式'],
}

// ---- 输入：转换类实时防抖 300ms ----

const DEBOUNCE_MS = 300

const text = ref('')
const debouncedText = ref('')
const truncated = ref(false)

let timer: number | undefined
function onInput(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    debouncedText.value = text.value
  }, DEBOUNCE_MS)
}
onUnmounted(() => {
  if (timer !== undefined) window.clearTimeout(timer)
})

// ---- 逐行求值（异步 dynamic import expr-eval） ----

const rows = ref<ScratchRow[]>([])

watch(debouncedText, async (input) => {
  const snapshot = input
  const result = await evaluateScratchpad(input)
  // 竞态守卫：仅当输入未变时采纳
  if (debouncedText.value === snapshot) {
    rows.value = result.rows
    truncated.value = result.truncated
  }
})

function errorText(error: EvalError): string {
  switch (error.kind) {
    case 'undefinedVar':
      return t('mathEval.errUndefinedVar', { name: error.name ?? '' })
    case 'syntax':
      return t('mathEval.errSyntax', { message: error.message ?? '' })
    case 'runtime':
      return t('mathEval.errRuntime', { message: error.message ?? '' })
    case 'emptyValue':
      return t('mathEval.errEmptyValue')
  }
}

function specialName(special: SpecialValue): string {
  switch (special) {
    case 'inf':
      return t('mathEval.specialInf')
    case 'neginf':
      return t('mathEval.specialNeginf')
    case 'nan':
      return t('mathEval.specialNan')
    default:
      return ''
  }
}

// ---- 历史：会话内最近 20 个多行块，点击回填输入区 ----

const history = ref<HistoryEntry[]>([])
// 回填不重复入史（点击回填已存在于历史中）
let restoring = false

// 防抖落定且非空时入史（连续相同的块不重复记录）
const lastCommitted = computed(() => debouncedText.value)
watch(lastCommitted, (value) => {
  if (restoring) {
    restoring = false
    return
  }
  history.value = pushHistory(history.value, value)
})

function restore(item: HistoryEntry): void {
  if (item.text === debouncedText.value) {
    text.value = item.text
    return
  }
  restoring = true
  text.value = item.text
  debouncedText.value = item.text
}
</script>

<style scoped>
.math-eval {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.section-title {
  font-size: 15px;
  font-weight: 590;
  color: var(--text-primary);
  margin: 0;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
  padding: var(--space-sm) var(--space-md);
  outline: none;
  resize: vertical;
  transition: border-color var(--transition-fast);
}

.textarea:focus {
  border-color: var(--border-focus);
}

.mono {
  font-family: var(--font-mono);
}

.error {
  color: var(--error);
  font-size: 12px;
  margin: 0;
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.row {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.row.invalid {
  border-color: var(--error);
}

.mark {
  flex: 0 0 auto;
  width: 1.2em;
  text-align: center;
  font-size: 12px;
}

.mark.ok {
  color: var(--text-tertiary);
}

.mark.bad {
  color: var(--error);
}

.source {
  font-size: 13px;
  color: var(--text-primary);
}

.echo {
  font-size: 12px;
  color: var(--text-quaternary);
}

.result {
  margin-left: auto;
  font-size: 14px;
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;
}

.result.inf,
.result.neginf,
.result.nan {
  color: var(--warning, #b8860b);
}

.special-name {
  margin-left: var(--space-sm);
  font-size: 11px;
  color: var(--text-quaternary);
  font-family: var(--font-ui, inherit);
}

.line-error {
  margin-left: auto;
  text-align: right;
}

.empty {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.history-item {
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: var(--space-xs) var(--space-sm);
  transition: border-color var(--transition-fast);
}

.history-item:hover {
  border-color: var(--border-focus);
}

.history-preview {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 5.2em;
  overflow: hidden;
}
</style>
