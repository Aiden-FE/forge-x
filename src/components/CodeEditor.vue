<template>
  <div class="editor" :class="{ error: errorMsg }">
    <textarea
      :value="value"
      :placeholder="placeholder"
      :readonly="readonly"
      class="textarea"
      @input="$emit('update:value', ($event.target as HTMLTextAreaElement).value)"
    />
    <div class="toolbar">
      <button class="copy-btn" @click="copy" :class="{ copied }">
        <Copy v-if="!copied" :size="16" />
        <Check v-else :size="16" />
        <span>{{ copied ? '已复制' : '复制' }}</span>
      </button>
      <span v-if="errorMsg" class="error-msg">{{ errorMsg }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check } from 'lucide-vue-next'

const props = defineProps<{
  value: string
  placeholder?: string
  readonly?: boolean
  errorMsg?: string
}>()

defineEmits(['update:value'])

const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<style scoped>
.editor {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor.error { border-color: var(--error); }

.textarea {
  flex: 1;
  min-height: 200px;
  padding: var(--space-md);
  background: transparent;
  border: none;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
}

.textarea::placeholder { color: var(--text-tertiary); }

.textarea[readonly] {
  background: rgba(0, 0, 0, 0.1);
  cursor: default;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
}

.copy-btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition-fast);
}

.copy-btn:hover { color: var(--text-primary); }
.copy-btn.copied { color: var(--success); border-color: var(--success); }

.error-msg {
  font-size: 13px;
  color: var(--error);
}
</style>
