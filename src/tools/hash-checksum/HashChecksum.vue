<template>
  <ToolLayout :tool="toolMeta">
    <div class="hash-tool">
      <div class="panel">
        <label class="label" for="hash-text-input">{{ t('hashChecksum.text') }}</label>
        <textarea
          id="hash-text-input"
          v-model="textInput"
          class="textarea"
          data-test="hash-text-input"
          :placeholder="t('hashChecksum.textPlaceholder')"
          rows="7"
        />
      </div>

      <div class="algorithm-group" data-test="hash-algorithms">
        <span class="label">{{ t('hashChecksum.algorithmsLabel') }}</span>
        <div class="algorithm-list">
          <label v-for="id in HASH_ALGORITHM_IDS" :key="id" class="algorithm">
            <input v-model="selectedAlgorithms" type="checkbox" :value="id" />
            <span>{{ t(`hashChecksum.algorithms.${id}`) }}</span>
          </label>
        </div>
      </div>

      <div class="actions">
        <button
          class="btn primary"
          data-test="hash-text-compute"
          :disabled="textBusy"
          @click="computeText"
        >
          <Sparkles :size="16" />
          {{ textBusy ? t('hashChecksum.processing') : t('hashChecksum.computeText') }}
        </button>
        <button class="btn" data-test="hash-text-clear" @click="clearText">
          <Trash2 :size="16" />
          {{ t('hashChecksum.clear') }}
        </button>
      </div>

      <div
        class="dropzone"
        :class="{ 'drag-over': dragOver, 'has-file': selectedFile }"
        data-test="hash-dropzone"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
      >
        <input
          ref="fileInput"
          type="file"
          class="hidden-input"
          data-test="hash-file-input"
          @change="onFilePicked"
          @click.stop
        />
        <FileUp :size="28" class="dropzone-icon" />
        <template v-if="!selectedFile">
          <p class="dropzone-title">{{ t('hashChecksum.dropHint') }}</p>
          <p class="dropzone-action">{{ t('hashChecksum.chooseFile') }}</p>
        </template>
        <template v-else>
          <p class="dropzone-title" data-test="hash-file-name">{{ selectedFile.name }}</p>
          <p class="dropzone-action">{{ t('hashChecksum.changeFile') }}</p>
        </template>
      </div>

      <div class="actions">
        <button
          class="btn primary"
          data-test="hash-file-recompute"
          :disabled="!selectedFile || processing"
          @click="computeFile"
        >
          <RefreshCw :size="16" />
          {{ processing ? t('hashChecksum.processing') : t('hashChecksum.recompute') }}
        </button>
        <button
          class="btn"
          data-test="hash-file-clear"
          :disabled="processing"
          @click="clearFile"
        >
          <Trash2 :size="16" />
          {{ t('hashChecksum.clear') }}
        </button>
      </div>

      <div v-if="processing" class="progress" data-test="hash-progress">
        <div class="progress-track">
          <div class="progress-bar" :style="{ width: `${progressPercent}%` }" />
        </div>
        <span class="progress-text">{{ progressLabel }}</span>
      </div>

      <p v-if="localError" class="error" data-test="hash-error">{{ localError }}</p>

      <div class="panel output">
        <div class="output-header">
          <label class="label">{{ t('hashChecksum.results') }}</label>
          <span class="notice">{{ t('hashChecksum.localNotice') }}</span>
        </div>
        <div v-if="!hasResults" class="empty" data-test="hash-empty">
          {{ t('hashChecksum.empty') }}
        </div>
        <template v-if="hasResults">
          <div v-for="row in visibleResults" :key="row.id" class="result">
            <div class="result-name">{{ t(`hashChecksum.algorithms.${row.id}`) }}</div>
            <code class="result-value" data-test="hash-result">{{ row.value ?? '—' }}</code>
            <button
              class="btn icon"
              data-test="hash-result-copy"
              :disabled="!row.value"
              :aria-label="t('hashChecksum.copy')"
              @click="copyResult(row.id, row.value)"
            >
              <Check v-if="copiedKey === row.id" :size="15" />
              <Copy v-else :size="15" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, markRaw, ref } from 'vue'
import { Check, Copy, FileUp, RefreshCw, Sparkles, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import {
  computeFileHashes,
  computeTextHashes,
  HASH_ALGORITHM_IDS,
  type HashAlgorithmId,
} from './hashing'
import HashChecksum from './HashChecksum.vue'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'hash-checksum',
  name: '哈希/校验和',
  description: '本地计算文本与文件的 SHA、MD5 和 CRC32',
  category: 'encode',
  icon: 'Hash',
  component: HashChecksum,
  keywords: ['hash', 'sha', 'sha1', 'sha256', 'sha384', 'sha512', 'md5', 'crc32', 'checksum', '哈希', '校验和'],
}

const textInput = ref('')
const selectedAlgorithms = ref<HashAlgorithmId[]>([...HASH_ALGORITHM_IDS])
const textResults = ref<Partial<Record<HashAlgorithmId, string>> | null>(null)
const fileResults = ref<Partial<Record<HashAlgorithmId, string>> | null>(null)
const selectedFile = ref<File | null>(null)
const processing = ref(false)
const progress = ref(0)
const dragOver = ref(false)
const textBusy = ref(false)
const localError = ref('')
const copiedKey = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

let textJob = 0
let fileJob = 0
let copiedTimer: number | undefined

const progressPercent = computed(() => Math.min(100, Math.max(0, Math.round(progress.value))))
const progressLabel = computed(() => t('hashChecksum.progress', { percent: String(progressPercent.value) }))

const visibleResults = computed(() => {
  const results = fileResults.value ?? textResults.value
  return HASH_ALGORITHM_IDS.map(id => ({
    id,
    value: selectedAlgorithms.value.includes(id) ? results?.[id] : undefined,
  }))
})

const hasResults = computed(() => Boolean(fileResults.value || textResults.value))

function setError(error: string) {
  localError.value = error
}

async function copyResult(id: HashAlgorithmId, value?: string) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copiedKey.value = id
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copiedKey.value = ''
    }, 1600)
  } catch {
    setError(t('hashChecksum.errors.copy'))
  }
}

async function computeText() {
  if (selectedAlgorithms.value.length === 0) {
    setError(t('hashChecksum.errors.noAlgorithms'))
    return
  }
  if (textInput.value.length === 0) {
    setError(t('hashChecksum.errors.noText'))
    return
  }

  const job = ++textJob
  textBusy.value = true
  setError('')
  textResults.value = null
  fileResults.value = null
  try {
    const result = await computeTextHashes(textInput.value, selectedAlgorithms.value)
    if (job === textJob) textResults.value = result
  } catch {
    if (job === textJob) setError(t('hashChecksum.errors.compute'))
  } finally {
    if (job === textJob) textBusy.value = false
  }
}

function clearText() {
  textJob += 1
  textBusy.value = false
  textInput.value = ''
  textResults.value = null
  setError('')
}

async function computeFile() {
  const file = selectedFile.value
  if (!file) return
  if (selectedAlgorithms.value.length === 0) {
    setError(t('hashChecksum.errors.noAlgorithms'))
    return
  }

  const job = ++fileJob
  processing.value = true
  progress.value = file.size === 0 ? 100 : 0
  setError('')
  fileResults.value = null
  textResults.value = null
  try {
    const result = await computeFileHashes(file, selectedAlgorithms.value, {
      onProgress(value) {
        if (job === fileJob) progress.value = value.total === 0 ? 100 : (value.loaded / value.total) * 100
      },
    })
    if (job === fileJob) {
      progress.value = 100
      fileResults.value = result
    }
  } catch {
    if (job === fileJob) setError(t('hashChecksum.errors.fileRead'))
  } finally {
    if (job === fileJob) processing.value = false
  }
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files[0]
  if (!file) return
  selectedFile.value = markRaw(file)
  void computeFile()
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  selectedFile.value = markRaw(file)
  void computeFile()
}

function clearFile() {
  fileJob += 1
  processing.value = false
  progress.value = 0
  selectedFile.value = null
  fileResults.value = null
  setError('')
}
</script>

<style scoped>
.hash-tool {
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

.algorithm-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.algorithm-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.algorithm {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
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

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn.icon {
  padding: var(--space-xs);
  flex-shrink: 0;
}

.dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 128px;
  padding: var(--space-lg);
  background: var(--bg-surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  text-align: center;
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.dropzone:hover,
.dropzone.drag-over,
.dropzone.has-file {
  border-color: var(--border-focus);
  background: var(--bg-hover);
}

.dropzone-icon {
  color: var(--accent);
  margin-bottom: var(--space-sm);
}

.dropzone-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.dropzone-action {
  margin: var(--space-xs) 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
}

.hidden-input {
  display: none;
}

.progress {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.progress-track {
  flex: 1;
  height: 6px;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.progress-bar {
  height: 100%;
  min-width: 2px;
  background: var(--accent);
  border-radius: 999px;
  transition: width 120ms ease;
}

.progress-text {
  min-width: 45px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
}

.output {
  gap: var(--space-md);
}

.output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.notice {
  color: var(--text-quaternary);
  font-size: 12px;
}

.empty {
  padding: var(--space-lg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
}

.result {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--border);
}

.result:last-child {
  border-bottom: 0;
}

.result-name {
  color: var(--text-secondary);
  font-size: 12px;
}

.result-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.error {
  color: var(--error);
  font-size: 13px;
  margin: 0;
}
</style>
