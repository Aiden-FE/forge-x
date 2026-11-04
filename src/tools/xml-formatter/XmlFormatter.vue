<template>
  <ToolLayout :tool="toolMeta">
    <div class="xml-tool">
      <div class="controls" data-test="xml-controls">
        <div class="control-group">
          <span class="control-label">{{ t('xmlFormatter.modeLabel') }}</span>
          <div class="segmented" role="group" :aria-label="t('xmlFormatter.modeLabel')">
            <button
              class="seg-btn"
              :class="{ active: mode === 'format' }"
              data-test="xml-format"
              @click="mode = 'format'"
            >
              {{ t('xmlFormatter.modeFormat') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: mode === 'minify' }"
              data-test="xml-minify"
              @click="mode = 'minify'"
            >
              {{ t('xmlFormatter.modeMinify') }}
            </button>
          </div>
        </div>
        <div class="control-group" data-test="xml-indent">
          <span class="control-label">{{ t('xmlFormatter.indentLabel') }}</span>
          <div class="segmented" role="group" :aria-label="t('xmlFormatter.indentLabel')">
            <button
              class="seg-btn"
              :class="{ active: indent === '2' }"
              data-test="xml-indent-2"
              @click="indent = '2'"
            >
              {{ t('xmlFormatter.indent2') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: indent === '4' }"
              data-test="xml-indent-4"
              @click="indent = '4'"
            >
              {{ t('xmlFormatter.indent4') }}
            </button>
            <button
              class="seg-btn"
              :class="{ active: indent === 'tab' }"
              data-test="xml-indent-tab"
              @click="indent = 'tab'"
            >
              {{ t('xmlFormatter.indentTab') }}
            </button>
          </div>
        </div>
        <span class="hint">{{ t('xmlFormatter.inputHint') }}</span>
      </div>

      <div class="panel">
        <label class="label">{{ t('xmlFormatter.inputLabel') }}</label>
        <textarea
          v-model="input"
          class="textarea"
          data-test="xml-input"
          :placeholder="t('xmlFormatter.placeholder')"
          rows="12"
        />
      </div>

      <div class="actions">
        <button class="btn" data-test="xml-copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('xmlFormatter.copied') : t('xmlFormatter.copy') }}
        </button>
        <button class="btn" data-test="xml-download" :disabled="!output" @click="download">
          <Download :size="16" />
          {{ t('xmlFormatter.download') }}
        </button>
        <button class="btn" data-test="xml-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('xmlFormatter.clear') }}
        </button>
      </div>

      <div class="panel">
        <label class="label">
          {{ mode === 'format' ? t('xmlFormatter.outputLabelFormat') : t('xmlFormatter.outputLabelMinify') }}
        </label>
        <textarea
          v-model="output"
          class="textarea"
          data-test="xml-output"
          readonly
          rows="12"
          :placeholder="input.trim() === '' ? t('xmlFormatter.outputEmpty') : ''"
        />
        <!-- 校验状态行：良构 ✓ 或 行/列错误（提取失败降级原文） -->
        <p v-if="valid" class="status ok" data-test="xml-status">{{ t('xmlFormatter.statusOk') }}</p>
        <p v-else-if="errorText" class="status error" data-test="xml-error">{{ errorText }}</p>
      </div>

      <p class="notice" data-test="xml-notice-xxe">{{ t('xmlFormatter.xxeNotice') }}</p>
      <p class="notice">{{ t('xmlFormatter.fidelityNotice') }}</p>
      <p class="notice">{{ t('xmlFormatter.localNotice') }}</p>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Copy, Download, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import XmlFormatter from './XmlFormatter.vue'
import { runXmlTool } from './xmlFormat'
import type { IndentChoice, XmlToolError, XmlToolMode, XmlToolOutcome } from './xmlFormat'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'xml-formatter',
  name: 'XML 格式化',
  description: '格式化或压缩 XML 数据，支持语法验证',
  category: 'format',
  icon: 'CodeXml',
  component: XmlFormatter,
  keywords: ['xml', 'format', 'minify', 'validate', '格式化', '压缩']
}

const input = ref('')
const output = ref('')
const mode = ref<XmlToolMode>('format')
const indent = ref<IndentChoice>('2')
const valid = ref(false)
const errorText = ref('')
const copied = ref(false)

/** 实时防抖 300ms（转换/校验类节奏，票据 04 §交互）。 */
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let runToken = 0

watch([input, mode, indent], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runNow, 300)
})

async function runNow() {
  const token = ++runToken
  const text = input.value
  if (text.trim() === '') {
    output.value = ''
    errorText.value = ''
    valid.value = false
    return
  }

  let outcome: XmlToolOutcome
  try {
    outcome = await runXmlTool(text, mode.value, indent.value)
  } catch {
    if (token !== runToken) return
    valid.value = false
    errorText.value = t('xmlFormatter.errors.unexpected')
    return
  }
  if (token !== runToken) return

  if (outcome.ok) {
    output.value = outcome.value
    errorText.value = ''
    valid.value = true
  } else {
    // 非法输入只错该处：报错时输出保留旧值（平台约定 §4）。
    valid.value = false
    errorText.value = outcome.errors[0] ? formatErrorText(outcome.errors[0]) : t('xmlFormatter.errors.unexpected')
  }
}

function formatErrorText(error: XmlToolError): string {
  switch (error.code) {
    case 'empty':
      return t('xmlFormatter.errors.empty')
    case 'pasteTooLarge':
      return t('xmlFormatter.errors.pasteTooLarge')
    case 'notWellFormed': {
      if (error.position) {
        const head = t('xmlFormatter.errors.notWellFormed')
        const pos = t('xmlFormatter.lineColumn', {
          line: String(error.position.line),
          column: String(error.position.column),
        })
        return error.position.message ? `${head} · ${pos}：${error.position.message}` : `${head} · ${pos}`
      }
      // 提取失败降级：parsererror 原文压平展示
      const raw = (error.message ?? '').replace(/\s+/g, ' ').trim()
      return raw
        ? `${t('xmlFormatter.errors.notWellFormed')}：${raw}`
        : t('xmlFormatter.errors.notWellFormed')
    }
    case 'convert':
      return error.message
        ? `${t('xmlFormatter.errors.convert')}: ${error.message}`
        : t('xmlFormatter.errors.convert')
    default:
      return t('xmlFormatter.errors.unexpected')
  }
}

/* ---------------- 输出动作 ---------------- */

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
  const blob = new Blob([output.value], { type: 'application/xml;charset=utf-8' })
  triggerDownload(blob, mode.value === 'minify' ? 'minified.xml' : 'formatted.xml')
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
  errorText.value = ''
  valid.value = false
  copied.value = false
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
})
</script>

<style scoped>
.xml-tool {
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

.control-group {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.control-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
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

.status {
  font-size: 13px;
  margin-top: var(--space-sm);
}

.status.ok {
  color: var(--text-tertiary);
}

.status.error {
  color: var(--error);
}

.notice {
  color: var(--text-quaternary);
  font-size: 12px;
}
</style>
