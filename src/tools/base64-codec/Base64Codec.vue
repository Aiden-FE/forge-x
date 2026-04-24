<template>
  <ToolLayout :tool="toolMeta">
    <div class="base64-tool">
      <div class="panel">
        <label class="label">输入内容</label>
        <textarea
          v-model="input"
          class="textarea"
          placeholder="输入要编码或解码的内容..."
          rows="8"
        />
      </div>
      <div class="actions">
        <button class="btn primary" @click="encode">
          <ArrowUp :size="16" />
          编码 → Base64
        </button>
        <button class="btn" @click="decode">
          <ArrowDown :size="16" />
          解码 ← Base64
        </button>
        <button class="btn" @click="copy">
          <Copy :size="16" />
          复制
        </button>
        <button class="btn" @click="clear">
          <Trash2 :size="16" />
          清空
        </button>
      </div>
      <div class="panel output">
        <label class="label">输出结果</label>
        <textarea
          v-model="output"
          class="textarea"
          readonly
          rows="8"
        />
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowUp, ArrowDown, Copy, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import type { ToolMeta } from '@/types/tool'
import Base64Codec from './Base64Codec.vue'

const toolMeta: ToolMeta = {
  id: 'base64-codec',
  name: 'Base64 编解码',
  description: '文本与 Base64 互相转换',
  category: 'encode',
  icon: 'Binary',
  component: Base64Codec,
  keywords: ['base64', 'encode', 'decode', '编码', '解码']
}

const input = ref('')
const output = ref('')
const error = ref('')

function encode() {
  error.value = ''
  try {
    output.value = btoa(unescape(encodeURIComponent(input.value)))
  } catch (e: any) {
    error.value = `编码错误: ${e.message}`
    output.value = ''
  }
}

function decode() {
  error.value = ''
  try {
    output.value = decodeURIComponent(escape(atob(input.value)))
  } catch (e: any) {
    error.value = `解码错误: 请输入有效的 Base64 字符串`
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
.base64-tool {
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