<template>
  <ToolLayout :tool="toolMeta">
    <div class="case-tool">
      <section class="panel">
        <label class="label" for="text-case-input">{{ t('textCase.inputLabel') }}</label>
        <textarea
          id="text-case-input"
          v-model="input"
          class="textarea"
          data-test="text-case-input"
          rows="6"
          spellcheck="false"
          :placeholder="t('textCase.inputPlaceholder')"
          @input="onInput"
        />
        <div class="control">
          <span class="label">{{ t('textCase.styleLabel') }}</span>
          <div class="style-group" role="radiogroup" data-test="text-case-style" :aria-label="t('textCase.styleLabel')">
            <label
              v-for="option in STYLE_OPTIONS"
              :key="option.value"
              class="style-option"
              :class="{ active: style === option.value }"
            >
              <input v-model="style" type="radio" name="text-case-style" :value="option.value" />
              <code>{{ option.label }}</code>
            </label>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="output-head">
          <label class="label" for="text-case-output">{{ t('textCase.outputLabel') }}</label>
          <div class="actions">
            <button class="btn primary" data-test="text-case-copy" :disabled="!result.text" @click="copy">
              <Check v-if="copied" :size="15" />
              <Copy v-else :size="15" />
              {{ copied ? t('textCase.copied') : t('textCase.copy') }}
            </button>
            <button class="btn" data-test="text-case-clear" @click="clear">
              <Trash2 :size="15" />
              {{ t('textCase.clear') }}
            </button>
          </div>
        </div>
        <p v-if="result.truncated" class="notice" data-test="text-case-truncated">
          {{ t('textCase.truncated') }}
        </p>
        <p v-if="copyError" class="notice error" data-test="text-case-copy-error">{{ copyError }}</p>
        <textarea
          id="text-case-output"
          class="textarea output"
          data-test="text-case-output"
          rows="6"
          readonly
          spellcheck="false"
          :value="result.text"
          :placeholder="t('textCase.outputPlaceholder')"
        />
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Check, Copy, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import TextCase from './TextCase.vue'
import { CASE_STYLES, convertCase, truncateInput } from './casing'
import type { CaseStyle } from './casing'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'text-case',
  name: '文本大小写转换',
  description: '七种大小写样式互转，CJK 透传',
  category: 'text',
  icon: 'CaseSensitive',
  component: TextCase,
  keywords: ['case', 'camelcase', 'pascalcase', 'snake', 'kebab', 'title', '大小写', '命名'],
}

// 样式名称（camelCase 等）按规格不翻译，仅 UI 说明双语。
const STYLE_OPTIONS: Array<{ value: CaseStyle; label: string }> = CASE_STYLES.map((value) => ({
  value,
  label: {
    camel: 'camelCase',
    pascal: 'PascalCase',
    snake: 'snake_case',
    constant: 'CONSTANT_CASE',
    kebab: 'kebab-case',
    title: 'Title Case',
    sentence: 'sentence case',
  }[value],
}))

const input = ref('')
const source = ref('')
const style = ref<CaseStyle>('camel')
const copied = ref(false)
const copyError = ref('')

/** 转换实时（防抖）：输入停顿后应用到输出（延续进制/颜色确立的联动惯例）。 */
const DEBOUNCE_MS = 250
let debounceTimer: number | undefined
let copiedTimer: number | undefined

function onInput(): void {
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    source.value = input.value
  }, DEBOUNCE_MS)
}

onUnmounted(() => {
  window.clearTimeout(debounceTimer)
  window.clearTimeout(copiedTimer)
})

const result = computed(() => {
  const { text, truncated } = truncateInput(source.value)
  return { text: convertCase(text, style.value), truncated }
})

async function copy(): Promise<void> {
  if (!result.value.text) return
  try {
    await navigator.clipboard.writeText(result.value.text)
    copyError.value = ''
    copied.value = true
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    copyError.value = t('textCase.copyError')
  }
}

function clear(): void {
  window.clearTimeout(debounceTimer)
  input.value = ''
  source.value = ''
  copyError.value = ''
}
</script>

<style scoped>
.case-tool {
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

.textarea.output {
  background: var(--bg-card);
}

.control {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
}

.style-group {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.style-option {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.style-option.active {
  border-color: var(--accent);
  color: var(--text-primary);
}

.style-option input {
  accent-color: var(--accent);
}

.style-option code {
  font-family: var(--font-mono);
  font-size: 12px;
}

.output-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
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

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.notice {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

.notice.error {
  color: var(--error);
}
</style>
