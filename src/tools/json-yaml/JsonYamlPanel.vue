<template>
  <div class="json-yaml-tool">
      <div class="panel">
        <label class="label">{{ t('jsonYaml.inputLabel') }}</label>
        <textarea
          v-model="input"
          class="textarea"
          data-test="json-yaml-input"
          :placeholder="t('jsonYaml.placeholder')"
          rows="10"
        />
      </div>
      <div class="actions">
        <button class="btn primary" data-test="json-yaml-to-yaml" @click="convert('json-to-yaml')">
          <FileJson2 :size="16" />
          {{ t('jsonYaml.toYaml') }}
        </button>
        <button class="btn" data-test="json-yaml-to-json" @click="convert('yaml-to-json')">
          <FileCode2 :size="16" />
          {{ t('jsonYaml.toJson') }}
        </button>
        <button class="btn" data-test="json-yaml-copy" @click="copy">
          <Copy :size="16" />
          {{ t('jsonYaml.copy') }}
        </button>
        <button class="btn" data-test="json-yaml-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('jsonYaml.clear') }}
        </button>
      </div>
      <div class="panel output">
        <label class="label">{{ t('jsonYaml.output') }}</label>
        <textarea
          v-model="output"
          class="textarea"
          data-test="json-yaml-output"
          readonly
          rows="10"
        />
        <p v-if="error" class="error" data-test="json-yaml-error">{{ error }}</p>
      </div>
      <p class="notice">{{ t('jsonYaml.localNotice') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Copy, FileCode2, FileJson2, Trash2 } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import {
  ConversionSyntaxError,
  jsonToYaml,
  yamlToJson,
} from './jsonYaml'

const { t } = useI18n()

const input = ref('')
const output = ref('')
const error = ref('')

function convert(direction: 'json-to-yaml' | 'yaml-to-json') {
  error.value = ''
  try {
    output.value = direction === 'json-to-yaml'
      ? jsonToYaml(input.value)
      : yamlToJson(input.value)
  } catch (caught) {
    error.value = formatError(caught)
    output.value = ''
  }
}

function formatError(caught: unknown): string {
  if (!(caught instanceof ConversionSyntaxError)) {
    return t('jsonYaml.errUnexpected')
  }
  if (caught.line === undefined || caught.column === undefined) {
    return t('jsonYaml.errParse')
  }

  return `${t('jsonYaml.errParse')} ${t('jsonYaml.lineColumn', {
    column: String(caught.column),
    line: String(caught.line),
  })}`
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
.json-yaml-tool {
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

.notice {
  color: var(--text-quaternary);
  font-size: 12px;
}
</style>
