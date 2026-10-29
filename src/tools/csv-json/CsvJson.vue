<template>
  <div class="csv-json-tool">
    <ToolLayout :tool="toolMeta">
      <div class="controls" data-test="controls">
        <div class="segmented" role="group" :aria-label="t('csvJson.directionLabel')">
          <button
            class="seg-btn"
            :class="{ active: direction === 'csv-to-json' }"
            data-test="direction-csv-to-json"
            @click="direction = 'csv-to-json'"
          >
            {{ t('csvJson.directionCsvToJson') }}
          </button>
          <button
            class="seg-btn"
            :class="{ active: direction === 'json-to-csv' }"
            data-test="direction-json-to-csv"
            @click="direction = 'json-to-csv'"
          >
            {{ t('csvJson.directionJsonToCsv') }}
          </button>
        </div>

        <label v-if="direction === 'csv-to-json'" class="control">
          <span class="control-label">{{ t('csvJson.delimiterLabel') }}</span>
          <select v-model="delimiter" class="select" data-test="delimiter-select">
            <option v-for="choice in delimiterChoices" :key="choice.value" :value="choice.value">
              {{ t(choice.labelKey) }}
            </option>
          </select>
        </label>

        <label v-if="direction === 'csv-to-json'" class="toggle" data-test="header-toggle">
          <input v-model="header" type="checkbox" />
          <span>{{ t('csvJson.headerLabel') }}</span>
        </label>
      </div>

      <div class="panel">
        <div class="panel-head">
          <label class="label">{{ direction === 'csv-to-json' ? t('csvJson.inputLabelCsv') : t('csvJson.inputLabelJson') }}</label>
          <span class="hint">{{ t('csvJson.inputHint') }}</span>
        </div>
        <textarea
          v-model="input"
          class="textarea"
          data-test="csv-json-input"
          :placeholder="direction === 'csv-to-json' ? t('csvJson.inputPlaceholderCsv') : t('csvJson.inputPlaceholderJson')"
          rows="10"
          @input="source = 'paste'"
        />
        <div class="file-row">
          <button class="btn" data-test="file-import" @click="fileInput?.click()">
            <Upload :size="16" />
            {{ t('csvJson.fileImport') }}
          </button>
          <input
            ref="fileInput"
            class="file-input"
            type="file"
            accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,application/json"
            data-test="file-input"
            @change="importFile"
          />
          <div v-if="progressPercent !== null" class="progress" data-test="progress">
            <div class="progress-track">
              <div class="progress-bar" :style="{ width: `${progressPercent}%` }" />
            </div>
            <span class="progress-text">{{ t('csvJson.progressLabel') }} {{ progressPercent }}%</span>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn" data-test="copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('csvJson.copied') : t('csvJson.copy') }}
        </button>
        <button class="btn" data-test="download" :disabled="!output" @click="download">
          <Download :size="16" />
          {{ t('csvJson.download') }}
        </button>
        <button class="btn" data-test="clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('csvJson.clear') }}
        </button>
      </div>

      <div class="panel">
        <label class="label">{{ t('csvJson.outputLabel') }}</label>
        <textarea
          v-model="output"
          class="textarea"
          data-test="csv-json-output"
          readonly
          rows="10"
          :placeholder="outputPlaceholder"
        />
        <ul v-if="errors.length > 0" class="errors" data-test="errors">
          <li v-for="(error, index) in errors" :key="index" class="error">{{ formatError(error) }}</li>
        </ul>
      </div>

      <p class="notice">{{ t('csvJson.localNotice') }}</p>
    </ToolLayout>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Copy, Download, Trash2, Upload } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import CsvJson from './CsvJson.vue'
import {
  csvToJson,
  jsonToCsv,
  isFileWithinLimit,
  isPasteWithinLimit,
} from './csvJson'
import type {
  CsvJsonError,
  DelimiterChoice,
} from './csvJson'
import type { WorkerRequest, WorkerOutcome, WorkerResponse } from './csvWorker'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'csv-json',
  name: 'CSV↔JSON 转换',
  description: 'CSV/TSV 与 JSON 双向转换，RFC 4180 严格解析',
  category: 'convert',
  icon: 'FileSpreadsheet',
  component: CsvJson,
}

type Direction = 'csv-to-json' | 'json-to-csv'

const delimiterChoices: Array<{ value: DelimiterChoice; labelKey: string }> = [
  { value: 'auto', labelKey: 'csvJson.delimiterAuto' },
  { value: ',', labelKey: 'csvJson.delimiterComma' },
  { value: ';', labelKey: 'csvJson.delimiterSemicolon' },
  { value: '\t', labelKey: 'csvJson.delimiterTab' },
  { value: '|', labelKey: 'csvJson.delimiterPipe' },
  { value: ' ', labelKey: 'csvJson.delimiterSpace' },
]

const direction = ref<Direction>('csv-to-json')
const delimiter = ref<DelimiterChoice>('auto')
const header = ref(true)
const source = ref<'paste' | 'file'>('paste')
const input = ref('')
const output = ref('')
const errors = ref<CsvJsonError[]>([])
const progressPercent = ref<number | null>(null)
const copied = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const outputPlaceholder = computed(() =>
  input.value.trim() === '' ? t('csvJson.outputEmpty') : '',
)

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let runToken = 0

watch([input, direction, delimiter, header], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(convertNow, 200)
})

async function convertNow() {
  const token = ++runToken
  output.value = ''
  errors.value = []
  progressPercent.value = null

  const text = input.value
  if (text.trim() === '') return

  if (direction.value === 'csv-to-json' && source.value === 'paste' && !isPasteWithinLimit(text)) {
    errors.value = [{ code: 'pasteTooLarge' }]
    return
  }

  const outcome = await runConversion(text)
  if (token !== runToken) return
  progressPercent.value = null
  if (outcome.ok) {
    output.value = 'json' in outcome ? outcome.json : outcome.csv
  } else {
    errors.value = outcome.errors
  }
}

async function runConversion(text: string): Promise<WorkerOutcome> {
  // Inputs larger than the paste limit only arrive via file import; parse
  // them in the worker so the UI stays responsive, with progress.
  if (!isPasteWithinLimit(text)) {
    if (direction.value === 'csv-to-json') {
      return runInWorker({
        kind: 'csv-to-json',
        text,
        options: { delimiter: delimiter.value, header: header.value },
      })
    }
    return runInWorker({ kind: 'json-to-csv', text, options: {} })
  }
  return direction.value === 'csv-to-json'
    ? csvToJson(text, { delimiter: delimiter.value, header: header.value })
    : jsonToCsv(text)
}

async function importFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  if (!isFileWithinLimit(file.size)) {
    runToken += 1
    output.value = ''
    errors.value = [{ code: 'fileTooLarge' }]
    progressPercent.value = null
    return
  }
  const text = await file.text()
  source.value = 'file'
  input.value = text
}

function formatError(error: CsvJsonError): string {
  const reason = t(`csvJson.errors.${error.code}`, {}, t('csvJson.errors.unexpected'))
  if (error.line !== undefined && error.column !== undefined) {
    return t('csvJson.errorAtLineColumn', {
      line: String(error.line),
      column: String(error.column),
      reason,
    })
  }
  if (error.row !== undefined && error.key !== undefined) {
    return t('csvJson.errorAtRowKey', { row: String(error.row), key: error.key, reason })
  }
  if (error.row !== undefined) {
    return t('csvJson.errorAtRow', { row: String(error.row), reason })
  }
  return reason
}

/* ---------------- worker (large file path) ---------------- */

let worker: Worker | null = null
let workerToken = 0

function runInWorker(request: Omit<WorkerRequest, 'id'>): Promise<WorkerOutcome> {
  worker?.terminate()
  const created = new Worker(new URL('./csvWorker.ts', import.meta.url), { type: 'module' })
  worker = created
  const id = ++workerToken
  return new Promise((resolve) => {
    created.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.id !== id) return
      if (message.type === 'progress') {
        progressPercent.value = message.total > 0
          ? Math.min(100, Math.round((message.bytes / message.total) * 100))
          : null
        return
      }
      if (worker === created) stopWorker()
      resolve(message.outcome)
    }
    created.onerror = () => {
      if (worker === created) stopWorker()
      resolve({ ok: false, errors: [{ code: 'csvParse', message: 'worker failed' }] })
    }
    created.postMessage({ id, ...request } satisfies WorkerRequest)
  })
}

function stopWorker() {
  worker?.terminate()
  worker = null
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  stopWorker()
})

/* ---------------- output actions ---------------- */

function copy() {
  if (!output.value) return
  void navigator.clipboard.writeText(output.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}

function download() {
  if (!output.value) return
  const toJson = direction.value === 'csv-to-json'
  const blob = new Blob([output.value], {
    type: toJson ? 'application/json' : 'text/csv',
  })
  triggerDownload(blob, toJson ? 'converted.json' : 'converted.csv')
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function clear() {
  runToken += 1
  source.value = 'paste'
  input.value = ''
  output.value = ''
  errors.value = []
  progressPercent.value = null
}
</script>

<style scoped>
.csv-json-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.controls {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.segmented {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.seg-btn {
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.seg-btn + .seg-btn {
  border-left: 1px solid var(--border);
}

.seg-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.seg-btn.active {
  background: var(--accent);
  color: white;
}

.control {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.control-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.select {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-sm) var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.select:focus {
  border-color: var(--border-focus);
}

.toggle {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
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

.file-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.file-input {
  display: none;
}

.progress {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  min-width: 160px;
}

.progress-track {
  flex: 1;
  height: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--accent);
  transition: width var(--transition-fast);
}

.progress-text {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
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

.errors {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.error {
  color: var(--error);
  font-size: 13px;
}

.notice {
  color: var(--text-quaternary);
  font-size: 12px;
}
</style>
