<template>
  <ToolLayout :tool="toolMeta">
    <div class="url-codec-tool">
      <div class="panel">
        <label class="label">{{ t('urlCodec.label') }}</label>
        <textarea
          v-model="input"
          class="textarea"
          data-test="url-input"
          :placeholder="t('urlCodec.placeholder')"
          rows="8"
        />
      </div>
      <div class="actions">
        <button class="btn primary" data-test="url-encode" @click="encode">
          <ArrowUp :size="16" />
          {{ t('urlCodec.encode') }}
        </button>
        <button class="btn" data-test="url-decode" @click="decode">
          <ArrowDown :size="16" />
          {{ t('urlCodec.decode') }}
        </button>
        <button class="btn" data-test="url-copy" @click="copy">
          <Copy :size="16" />
          {{ t('urlCodec.copy') }}
        </button>
        <button class="btn" data-test="url-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('urlCodec.clear') }}
        </button>
      </div>
      <div class="panel output">
        <label class="label">{{ t('urlCodec.output') }}</label>
        <textarea
          v-model="output"
          class="textarea"
          data-test="url-output"
          readonly
          rows="8"
        />
        <p v-if="error" class="error" data-test="url-error">{{ error }}</p>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowUp, ArrowDown, Copy, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import UrlCodec from './UrlCodec.vue'
import { decodeUrlText, encodeUrlText } from './urlCodec'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'url-codec',
  name: 'URL 编解码',
  description: '文本与 URL 编码互相转换',
  category: 'encode',
  icon: 'Link',
  component: UrlCodec,
  keywords: ['url', 'encode', 'decode', 'uri', 'percent', '编码', '解码']
}

const input = ref('')
const output = ref('')
const error = ref('')

function encode() {
  error.value = ''
  try {
    output.value = encodeUrlText(input.value)
  } catch {
    error.value = t('urlCodec.errEncode')
    output.value = ''
  }
}

function decode() {
  error.value = ''
  try {
    output.value = decodeUrlText(input.value)
  } catch {
    error.value = t('urlCodec.errDecode')
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
.url-codec-tool {
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
