<template>
  <ToolLayout :tool="toolMeta">
    <div class="he-tool">
      <!-- 双向模式（encode 家族交互形态对齐 url-codec） -->
      <section class="panel">
        <span class="label">{{ t('htmlEntity.mode') }}</span>
        <div class="segment" role="group" data-test="he-mode-group">
          <button
            type="button"
            class="segment-btn"
            :class="{ active: mode === 'escape' }"
            data-test="he-mode-escape"
            @click="setMode('escape')"
          >
            {{ t('htmlEntity.escape') }}
          </button>
          <button
            type="button"
            class="segment-btn"
            :class="{ active: mode === 'unescape' }"
            data-test="he-mode-unescape"
            @click="setMode('unescape')"
          >
            {{ t('htmlEntity.unescape') }}
          </button>
        </div>
        <p class="safety" data-test="he-safety-note">{{ t('htmlEntity.safetyNote') }}</p>
      </section>

      <!-- 输入：1 MiB 粘贴上限 + 300ms 实时防抖（转换类约定） -->
      <section class="panel">
        <label class="label" for="he-input">{{ t('htmlEntity.inputLabel') }}</label>
        <textarea
          id="he-input"
          v-model="input"
          class="textarea"
          data-test="he-input"
          :placeholder="mode === 'escape' ? t('htmlEntity.escapePlaceholder') : t('htmlEntity.unescapePlaceholder')"
          rows="8"
          @input="onInput"
        />
        <p v-if="overLimit" class="error" data-test="he-limit-error">
          {{ t('htmlEntity.limitError') }}
        </p>
      </section>

      <div class="actions">
        <button class="btn" data-test="he-copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('htmlEntity.copied') : t('htmlEntity.copy') }}
        </button>
        <button class="btn" data-test="he-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('htmlEntity.clear') }}
        </button>
      </div>

      <!-- 输出：未知命名实体行级错误，其余行照常（非法输入只错该处） -->
      <section class="panel">
        <label class="label" for="he-output">{{ t('htmlEntity.output') }}</label>
        <textarea
          id="he-output"
          v-model="output"
          class="textarea"
          data-test="he-output"
          readonly
          rows="8"
        />
        <p v-if="errorSummary !== ''" class="error" data-test="he-error">{{ errorSummary }}</p>
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
import HtmlEntity from './HtmlEntity.vue'
import { escapeHtml, isOverLimit, unescapeHtml } from './htmlEntity'
import type { UnescapeResult } from './htmlEntity'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'html-entity',
  name: 'HTML 实体转义',
  description: '文本与 HTML 字符引用双向转换：五个必需实体转义，解码原生全表',
  category: 'encode',
  icon: 'Code2',
  component: HtmlEntity,
  keywords: ['html', 'entity', '实体', '转义', 'escape', 'unescape', 'html entities'],
}

type Mode = 'escape' | 'unescape'

const mode = ref<Mode>('escape')
const input = ref('')
const overLimit = ref(false)
const output = ref('')
const unescapeResult = ref<UnescapeResult | null>(null)

// ---- 300ms 实时防抖（转换类：DOMParser 主线程执行） ----

const DEBOUNCE_MS = 300

let timer: number | undefined
let copiedTimer: number | undefined

function onInput(): void {
  // 超限明确报错、不触发计算；既有输出原样保留（非法输入只错该处）
  if (isOverLimit(input.value)) {
    overLimit.value = true
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
    return
  }
  overLimit.value = false
  scheduleConvert()
}

function scheduleConvert(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    convert()
  }, DEBOUNCE_MS)
}

function convert(): void {
  if (mode.value === 'escape') {
    output.value = escapeHtml(input.value)
    unescapeResult.value = null
    return
  }
  const result = unescapeHtml(input.value)
  unescapeResult.value = result
  output.value = result.text
}

/** 模式切换即时重算（不等待防抖，输入内容未变）。 */
function setMode(next: Mode): void {
  mode.value = next
  convert()
}

const errorSummary = computed(() => {
  const result = unescapeResult.value
  if (mode.value !== 'unescape' || !result || result.ok) return ''
  const badLines = result.lines
    .filter((l) => l.unknownEntities.length > 0)
    .map((l) => `${l.line}: ${l.unknownEntities.join(' ')}`)
  return `${t('htmlEntity.unknownEntities')}\n${badLines.join('\n')}`
})

onUnmounted(() => {
  if (timer !== undefined) window.clearTimeout(timer)
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
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

function clear(): void {
  input.value = ''
  overLimit.value = false
  output.value = ''
  unescapeResult.value = null
}
</script>

<style scoped>
.he-tool {
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

.segment {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
}

.segment-btn {
  padding: var(--space-sm) var(--space-lg);
  background: var(--bg-card);
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.segment-btn + .segment-btn {
  border-left: 1px solid var(--border);
}

.segment-btn.active {
  background: var(--accent);
  color: white;
}

.safety {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
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

.warning {
  color: var(--error);
  font-size: 12px;
  margin: 0;
}

.error {
  color: var(--error);
  font-size: 13px;
  margin: 0;
  white-space: pre-wrap;
}
</style>
