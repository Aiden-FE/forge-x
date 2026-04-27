<template>
  <ToolLayout :tool="toolMeta">
    <div class="json-tool">
      <div class="panel">
        <label class="label">{{ t('jsonFormatter.label') }}</label>
        <textarea
          v-model="input"
          class="textarea"
          :placeholder="t('jsonFormatter.placeholder')"
          rows="10"
        />
      </div>
      <div class="actions">
        <button class="btn primary" @click="format">
          <Sparkles :size="16" />
          {{ t('jsonFormatter.format') }}
        </button>
        <button class="btn" @click="minify">
          <Minimize2 :size="16" />
          {{ t('jsonFormatter.minify') }}
        </button>
        <button class="btn" @click="copy">
          <Copy :size="16" />
          {{ t('jsonFormatter.copy') }}
        </button>
        <button class="btn" @click="clear">
          <Trash2 :size="16" />
          {{ t('jsonFormatter.clear') }}
        </button>
      </div>
      <div class="panel output">
        <label class="label">{{ t('jsonFormatter.output') }}</label>
        <textarea
          v-model="output"
          class="textarea"
          readonly
          rows="10"
        />
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Sparkles, Minimize2, Copy, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import JsonFormatter from './JsonFormatter.vue'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'json-formatter',
  name: 'JSON 格式化',
  description: '格式化或压缩 JSON 数据，支持语法验证',
  category: 'format',
  icon: 'Braces',
  component: JsonFormatter,
  keywords: ['json', 'format', 'minify', 'validate']
}

const input = ref('')
const output = ref('')
const error = ref('')

function format() {
  error.value = ''
  try {
    const parsed = JSON.parse(input.value)
    output.value = JSON.stringify(parsed, null, 2)
  } catch (e: any) {
    error.value = `${t('jsonFormatter.errParse')}: ${e.message}`
    output.value = ''
  }
}

function minify() {
  error.value = ''
  try {
    const parsed = JSON.parse(input.value)
    output.value = JSON.stringify(parsed)
  } catch (e: any) {
    error.value = `${t('jsonFormatter.errParse')}: ${e.message}`
    output.value = ''
  }
}

function copy() {
  navigator.clipboard.writeText(output.value)
}

function clear() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<style scoped>
.json-tool {
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

.btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.error {
  color: var(--error);
  font-size: 13px;
  margin-top: var(--space-sm);
}
</style>
