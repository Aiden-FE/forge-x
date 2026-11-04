<template>
  <ToolLayout :tool="toolMeta">
    <div class="json-repairer">
      <div class="controls">
        <span class="hint" data-test="repair-hint">{{ t('jsonRepairer.inputHint') }}</span>
      </div>

      <div class="panel">
        <label class="label" for="repair-input">{{ t('jsonRepairer.inputLabel') }}</label>
        <textarea
          id="repair-input"
          v-model="input"
          class="textarea"
          data-test="repair-input"
          :placeholder="t('jsonRepairer.inputPlaceholder')"
          rows="12"
        />
      </div>

      <div class="actions">
        <button class="btn" data-test="repair-copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('jsonRepairer.copied') : t('jsonRepairer.copy') }}
        </button>
        <button class="btn" data-test="repair-download" :disabled="!output" @click="download">
          <Download :size="16" />
          {{ t('jsonRepairer.download') }}
        </button>
        <button class="btn" data-test="repair-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('jsonRepairer.clear') }}
        </button>
      </div>

      <div class="panel">
        <label class="label" for="repair-output">{{ t('jsonRepairer.outputLabel') }}</label>
        <textarea
          id="repair-output"
          v-model="output"
          class="textarea"
          data-test="repair-output"
          readonly
          rows="12"
          :placeholder="outputPlaceholder"
        />
        <p v-if="errorText" class="error" data-test="repair-error">{{ errorText }}</p>
        <div v-if="statusText" class="status" :class="status?.ok ? 'ok' : 'fail'" data-test="repair-status">
          <CircleCheck v-if="status?.ok" :size="14" />
          <CircleX v-else :size="14" />
          <span>{{ statusText }}</span>
        </div>
      </div>

      <!-- 折叠帮助区（默认收起）：19 类可修清单 + 修复即规范化口径 + 导流。 -->
      <div class="help">
        <button
          class="btn"
          data-test="repair-help-toggle"
          :aria-expanded="helpOpen"
          @click="helpOpen = !helpOpen"
        >
          <CircleHelp :size="16" />
          {{ helpOpen ? t('jsonRepairer.help.hide') : t('jsonRepairer.help.show') }}
        </button>
        <div v-if="helpOpen" class="help-body" data-test="repair-help">
          <p class="notice">{{ t('jsonRepairer.help.normalize') }}</p>
          <p class="help-title">{{ t('jsonRepairer.help.title') }}</p>
          <ul class="help-list">
            <li v-for="key in HELP_ITEM_KEYS" :key="key" :data-test="`repair-help-item-${key}`">
              {{ t(`jsonRepairer.help.items.${key}`) }}
            </li>
          </ul>
          <p class="notice">{{ t('jsonRepairer.help.localNotice') }}</p>
          <p class="related">
            {{ t('jsonRepairer.help.relatedTitle') }}
            <a href="#/tool/json-formatter">{{ t('jsonRepairer.help.relatedFormat') }}</a>
            <span class="dot">·</span>
            <a href="#/tool/diffchecker">{{ t('jsonRepairer.help.relatedDiff') }}</a>
            <span class="dot">·</span>
            <a href="#/tool/ai-text-ops">{{ t('jsonRepairer.help.relatedPolish') }}</a>
          </p>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CircleCheck, CircleHelp, CircleX, Copy, Download, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import JsonRepairer from './JsonRepairer.vue'
import {
  DEBOUNCE_MS,
  DOWNLOAD_FILENAME,
  positionToLineColumn,
  repairJson,
  utf8ByteLength,
} from './repair'
import type { RepairError } from './repair'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'json-repairer',
  name: 'JSON 修复器',
  description: '修复不完整、截断、非规范的 JSON（典型如 LLM 输出）',
  category: 'ai',
  icon: 'Wrench',
  component: JsonRepairer,
  keywords: ['json', 'repair', 'fix', 'llm', 'ai', '修复', '截断'],
}

/** 帮助区 19 类可修清单（顺序即 locale items 键序，票据 Answer 全清单）。 */
const HELP_ITEM_KEYS = [
  'unquotedKeys',
  'missingEscapes',
  'missingCommas',
  'missingBrackets',
  'truncated',
  'singleQuotes',
  'smartQuotes',
  'specialWhitespace',
  'pythonConstants',
  'trailingCommas',
  'comments',
  'codeFences',
  'ellipsis',
  'jsonp',
  'escapedStrings',
  'mongoTypes',
  'stringConcat',
  'ndjson',
  'validPassthrough',
] as const

const input = ref('')
const output = ref('')
const status = ref<{ ok: boolean } | null>(null)
const repairErrors = ref<RepairError[]>([])
/** 报错时的输入快照：错误位置 → 行/列 的换算依据。 */
let failedInput = ''
const copied = ref(false)
const helpOpen = ref(false) // 帮助区默认折叠

const outputPlaceholder = computed(() =>
  input.value.trim() === '' ? t('jsonRepairer.outputEmpty') : '',
)

/** 状态条：成功/失败 + 输入/输出字节数（无修复处数计数——票据口径）。 */
const statusText = computed(() => {
  if (status.value === null) return ''
  const state = status.value.ok
    ? t('jsonRepairer.status.success')
    : t('jsonRepairer.status.failed')
  return `${state} · ${t('jsonRepairer.status.bytes', {
    in: String(utf8ByteLength(input.value)),
    out: String(utf8ByteLength(output.value)),
  })}`
})

const errorText = computed(() => {
  const error = repairErrors.value[0]
  if (!error) return ''
  const prefix = t(`jsonRepairer.errors.${error.code}`, {}, t('jsonRepairer.errors.unexpected'))
  if (error.code !== 'repair' || !error.message) return prefix
  let where = ''
  if (typeof error.position === 'number') {
    const { line, column } = positionToLineColumn(failedInput, error.position)
    where = ` ${t('jsonRepairer.errors.atPosition', {
      line: String(line),
      column: String(column),
      position: String(error.position),
    })}`
  }
  return `${prefix}: ${error.message}${where}`
})

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let runToken = 0

watch(input, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runRepair, DEBOUNCE_MS)
})

async function runRepair() {
  const token = ++runToken
  const text = input.value

  // 空输入是中性态：清输出、清错误、无状态条（非报错）。
  if (text.trim() === '') {
    output.value = ''
    repairErrors.value = []
    status.value = null
    return
  }

  const outcome = await repairJson(text)
  if (token !== runToken) return

  if (outcome.ok) {
    output.value = outcome.value
    repairErrors.value = []
    status.value = { ok: true }
  } else {
    // 只错该处：不可修复/超限时输出保留旧值，仅行内报错 + 状态条失败。
    failedInput = text
    repairErrors.value = outcome.errors
    status.value = { ok: false }
  }
}

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
  const blob = new Blob([output.value], { type: 'application/json;charset=utf-8' })
  triggerDownload(blob, DOWNLOAD_FILENAME)
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
  clearTimeout(debounceTimer)
  input.value = ''
  output.value = ''
  repairErrors.value = []
  status.value = null
  failedInput = ''
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
})
</script>

<style scoped>
.json-repairer {
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

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
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

.btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  color: var(--error);
  font-size: 13px;
  margin: 0;
}

.status {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 12px;
  margin: 0;
}

.status.ok {
  color: var(--success);
}

.status.fail {
  color: var(--error);
}

.help {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.help-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.help-title {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
  margin: 0;
}

.help-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  color: var(--text-tertiary);
  font-size: 13px;
}

.notice {
  color: var(--text-quaternary);
  font-size: 12px;
  margin: 0;
}

.related {
  color: var(--text-tertiary);
  font-size: 12px;
  margin: 0;
}

.related a {
  color: var(--accent);
  text-decoration: none;
}

.related a:hover {
  text-decoration: underline;
}

.dot {
  color: var(--text-quaternary);
  margin: 0 var(--space-xs);
}
</style>
