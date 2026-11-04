<template>
  <div class="xml-json-tool">
    <ToolLayout :tool="toolMeta">
      <!-- 方向切换（镜像 markdown-html 的 segmented 形态）+ 交换按钮（双向双区块） -->
      <div class="controls" data-test="xml-json-direction">
        <div class="segmented" role="group" :aria-label="t('xmlJson.directionLabel')">
          <button
            class="seg-btn"
            :class="{ active: direction === 'xml-to-json' }"
            data-test="xml-json-dir-xml-json"
            @click="direction = 'xml-to-json'"
          >
            {{ t('xmlJson.directionXmlToJson') }}
          </button>
          <button
            class="seg-btn"
            :class="{ active: direction === 'json-to-xml' }"
            data-test="xml-json-dir-json-xml"
            @click="direction = 'json-to-xml'"
          >
            {{ t('xmlJson.directionJsonToXml') }}
          </button>
        </div>
        <button class="btn" data-test="xml-json-swap" :title="t('xmlJson.swap')" @click="swap">
          <ArrowLeftRight :size="16" />
          {{ t('xmlJson.swap') }}
        </button>
        <span class="hint">{{ t('xmlJson.inputHint') }}</span>
      </div>

      <div class="panel">
        <label class="label">{{ direction === 'xml-to-json' ? t('xmlJson.inputLabelXml') : t('xmlJson.inputLabelJson') }}</label>
        <textarea
          v-model="input"
          class="textarea"
          data-test="xml-json-src"
          :placeholder="direction === 'xml-to-json' ? t('xmlJson.placeholderXml') : t('xmlJson.placeholderJson')"
          rows="12"
        />
      </div>

      <div class="actions">
        <button class="btn" data-test="xml-json-copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('xmlJson.copied') : t('xmlJson.copy') }}
        </button>
        <button class="btn" data-test="xml-json-download" :disabled="!output" @click="download">
          <Download :size="16" />
          {{ t('xmlJson.download') }}
        </button>
        <button class="btn" data-test="xml-json-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('xmlJson.clear') }}
        </button>
      </div>

      <div class="panel">
        <label class="label">{{ direction === 'xml-to-json' ? t('xmlJson.outputLabelJson') : t('xmlJson.outputLabelXml') }}</label>
        <textarea
          v-model="output"
          class="textarea"
          data-test="xml-json-dst"
          readonly
          rows="12"
          :placeholder="input.trim() === '' ? t('xmlJson.outputEmpty') : ''"
        />
        <!-- 报错只错该处：输出保留上一次成功值（平台错误语义 §4） -->
        <p v-if="errorText" class="error" data-test="xml-json-error">{{ errorText }}</p>
      </div>

      <!-- 帮助区：映射约定速览表（规格要求） -->
      <div class="conventions" data-test="xml-json-conventions">
        <p class="label">{{ t('xmlJson.conventionsTitle') }}</p>
        <table class="table">
          <tbody>
            <tr>
              <th>{{ t('xmlJson.convAttrKey') }}</th>
              <td>{{ t('xmlJson.convAttrValue') }}</td>
            </tr>
            <tr>
              <th>{{ t('xmlJson.convTextKey') }}</th>
              <td>{{ t('xmlJson.convTextValue') }}</td>
            </tr>
            <tr>
              <th>{{ t('xmlJson.convRepeatKey') }}</th>
              <td>{{ t('xmlJson.convRepeatValue') }}</td>
            </tr>
            <tr>
              <th>{{ t('xmlJson.convCdataKey') }}</th>
              <td>{{ t('xmlJson.convCdataValue') }}</td>
            </tr>
            <tr>
              <th>{{ t('xmlJson.convDroppedKey') }}</th>
              <td>{{ t('xmlJson.convDroppedValue') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 语义保真声明（CONTEXT.md 术语）：逆向限制如实呈现 -->
      <p class="notice">{{ t('xmlJson.fidelityNotice') }}</p>
      <p class="notice">{{ t('xmlJson.localNotice') }}</p>
    </ToolLayout>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeftRight, Copy, Download, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import { CONVERT_DEBOUNCE_MS, convert } from './xmlJson'
import type { Direction, XmlJsonError } from './xmlJson'
import XmlJson from './XmlJson.vue'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'xml-json',
  name: 'XML↔JSON 互转',
  description: '在本地进行 XML 与 JSON 双向转换',
  category: 'convert',
  icon: 'ArrowLeftRight',
  component: XmlJson,
}

const direction = ref<Direction>('xml-to-json')
const input = ref('')
const output = ref('')
const error = ref<XmlJsonError | null>(null)
const copied = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let runToken = 0

// 实时防抖 300ms（转换类工具平台约定）；方向切换同样触发重转换。
watch([input, direction], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(convertNow, CONVERT_DEBOUNCE_MS)
})

async function convertNow() {
  const token = ++runToken
  const text = input.value

  // 空输入：清空输出、无报错（占位提示），不视为错误。
  if (text.trim() === '') {
    output.value = ''
    error.value = null
    return
  }

  const outcome = await convert(text, direction.value)
  if (token !== runToken) return // 过期结果丢弃（防抖竞态）

  if (outcome.ok) {
    output.value = outcome.value
    error.value = null
  } else {
    // 报错只错该处：错误区更新，输出保留上一次成功值。
    error.value = outcome.error
  }
}

function formatError(caught: XmlJsonError): string {
  const reason = t(`xmlJson.errors.${caught.code}`, {}, t('xmlJson.errors.unexpected'))
  const parts: string[] = []
  if (caught.line !== undefined && caught.column !== undefined) {
    parts.push(
      t('xmlJson.lineColumn', { line: String(caught.line), column: String(caught.column) }),
    )
  }
  if (caught.message) parts.push(caught.message)
  return parts.length > 0 ? `${reason}（${parts.join('，')}）` : reason
}

const errorText = computed(() => (error.value ? formatError(error.value) : ''))

/** 交换：切换方向并把当前输出带回源侧（可输出为空时仅切换方向）。 */
function swap() {
  if (output.value) input.value = output.value
  direction.value = direction.value === 'xml-to-json' ? 'json-to-xml' : 'xml-to-json'
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
  const toJson = direction.value === 'xml-to-json'
  const blob = new Blob([output.value], {
    type: toJson ? 'application/json' : 'text/xml',
  })
  triggerDownload(blob, toJson ? 'converted.json' : 'converted.xml')
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
  input.value = ''
  output.value = ''
  error.value = null
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
})
</script>

<style scoped>
.xml-json-tool {
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
  margin-top: var(--space-sm);
}

.conventions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.table {
  border-collapse: collapse;
  font-size: 12px;
  color: var(--text-secondary);
}

.table th,
.table td {
  border: 1px solid var(--border);
  padding: var(--space-xs) var(--space-sm);
  text-align: left;
  font-weight: 400;
}

.table th {
  color: var(--text-primary);
  white-space: nowrap;
}

.table td {
  font-family: var(--font-mono);
}

.notice {
  color: var(--text-quaternary);
  font-size: 12px;
}
</style>
