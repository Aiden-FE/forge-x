<template>
  <ToolLayout :tool="toolMeta">
    <div class="base64-tool">
      <!-- 13 票扩展：文本 / 图片 双模式页签；文本模式原样保留 -->
      <div class="tabs" role="tablist" data-test="b64-mode-tabs">
        <button
          role="tab"
          class="tab"
          :class="{ active: mode === 'text' }"
          :aria-selected="mode === 'text'"
          data-test="b64-mode-text"
          @click="mode = 'text'"
        >
          <Type :size="16" />
          {{ t('base64Codec.mode.text') }}
        </button>
        <button
          role="tab"
          class="tab"
          :class="{ active: mode === 'image' }"
          :aria-selected="mode === 'image'"
          data-test="b64-mode-image"
          @click="mode = 'image'"
        >
          <ImageIcon :size="16" />
          {{ t('base64Codec.mode.image') }}
        </button>
      </div>

      <div v-show="mode === 'text'" role="tabpanel" class="pane">
        <div class="panel">
          <label class="label">{{ t('base64Codec.label') }}</label>
          <textarea
            v-model="input"
            class="textarea"
            data-test="b64-input"
            :placeholder="t('base64Codec.placeholder')"
            rows="8"
          />
        </div>
        <div class="actions">
          <button class="btn primary" data-test="b64-encode" @click="encode">
            <ArrowUp :size="16" />
            {{ t('base64Codec.encode') }}
          </button>
          <button class="btn" data-test="b64-decode" @click="decode">
            <ArrowDown :size="16" />
            {{ t('base64Codec.decode') }}
          </button>
          <button class="btn" data-test="b64-copy" @click="copy">
            <Copy :size="16" />
            {{ t('base64Codec.copy') }}
          </button>
          <button class="btn" data-test="b64-clear" @click="clear">
            <Trash2 :size="16" />
            {{ t('base64Codec.clear') }}
          </button>
        </div>
        <div class="panel output">
          <label class="label">{{ t('base64Codec.output') }}</label>
          <textarea
            v-model="output"
            class="textarea"
            data-test="b64-output"
            readonly
            rows="8"
          />
          <p v-if="error" class="error" data-test="b64-error">{{ error }}</p>
        </div>
      </div>

      <div v-show="mode === 'image'" role="tabpanel" class="pane">
        <!-- 正向：图片 → Base64（拖拽 / 文件选择，批量 ≤20，单文件 ≤20 MiB） -->
        <div class="panel">
          <label class="label">{{ t('base64Codec.image.encodeLabel') }}</label>
          <div
            class="drop"
            data-test="b64-img-drop"
            role="button"
            tabindex="0"
            @click="fileInput?.click()"
            @keydown.enter.prevent="fileInput?.click()"
            @dragover.prevent
            @drop.prevent="onDrop"
          >
            <Upload :size="20" />
            <span>{{ t('base64Codec.image.dropHint') }}</span>
          </div>
          <input
            ref="fileInput"
            class="file-input"
            type="file"
            accept="image/*"
            multiple
            data-test="b64-img-picker"
            @change="onPick"
          />
          <p class="hint">{{ t('base64Codec.image.limits') }}</p>
          <ul v-if="encodeErrors.length > 0" class="errors" data-test="b64-img-errors">
            <li v-for="(entry, index) in encodeErrors" :key="index" class="error">
              {{ entry.name }} · {{ t(`base64Codec.image.errors.${entry.reason}`) }}
            </li>
          </ul>
        </div>

        <div v-if="imageItems.length > 0" class="panel">
          <div class="results-head">
            <label class="label">{{ t('base64Codec.image.results') }}</label>
            <button class="btn" data-test="b64-img-clear" @click="clearImages">
              <Trash2 :size="16" />
              {{ t('base64Codec.clear') }}
            </button>
          </div>
          <div
            v-for="(item, index) in imageItems"
            :key="`${item.name}-${index}`"
            class="image-result"
            data-test="b64-img-item"
          >
            <div class="img-head">
              <img class="thumb" :src="item.dataUri" alt="" />
              <span class="img-name">{{ item.name }}</span>
              <span class="img-meta" data-test="b64-img-mime">{{ item.mime }}</span>
              <span class="img-meta">{{ formatBytes(item.byteLength) }}</span>
            </div>
            <div v-for="form in COPY_FORMS" :key="form.key" class="copy-form">
              <label class="label small">{{ t(`base64Codec.image.forms.${form.key}`) }}</label>
              <textarea
                class="textarea fragment"
                :value="item[form.prop]"
                readonly
                rows="2"
              />
              <button class="btn" :data-test="`b64-img-copy-${form.key}`" @click="copyFragment(item, form.key)">
                <Check v-if="copiedKey === `${index}:${form.key}`" :size="16" />
                <Copy v-else :size="16" />
                {{ copiedKey === `${index}:${form.key}` ? t('base64Codec.image.copied') : t('base64Codec.image.copy') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 反向：data URI → 图片预览 + 下载（实时防抖 300ms） -->
        <div class="panel">
          <label class="label" for="b64-img-decode-input">{{ t('base64Codec.image.decodeLabel') }}</label>
          <textarea
            id="b64-img-decode-input"
            v-model="decodeInput"
            class="textarea"
            data-test="b64-img-decode-input"
            :placeholder="t('base64Codec.image.decodePlaceholder')"
            rows="6"
            spellcheck="false"
          />
          <p v-if="decodeError" class="error" data-test="b64-img-decode-error">
            {{ t(`base64Codec.image.errors.${decodeError}`) }}
          </p>
          <div v-if="decodedImage" class="decode-result" data-test="b64-img-decode-result">
            <img class="preview" data-test="b64-img-preview" :src="decodedImage.dataUri" alt="" />
            <div class="decode-meta">
              <span class="img-meta" data-test="b64-img-decode-mime">{{ decodedImage.mime }}</span>
              <span class="img-meta">{{ formatBytes(decodedImage.bytes.length) }}</span>
              <button class="btn primary" data-test="b64-img-download" @click="downloadDecoded">
                <Download :size="16" />
                {{ t('base64Codec.image.download') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { ArrowUp, ArrowDown, Check, Copy, Download, ImageIcon, Trash2, Type, Upload } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import Base64Codec from './Base64Codec.vue'
import {
  dedupeFileName,
  encodeImageFile,
  imageMimeExtension,
  parseImageDataUri,
  selectImageBatch,
} from './image'
import type { ImageEncodeItem } from './image'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'base64-codec',
  name: 'Base64 编解码',
  description: '文本/图片与 Base64 互相转换（data URI 三形态）',
  category: 'encode',
  icon: 'Binary',
  component: Base64Codec,
  keywords: ['base64', 'encode', 'decode', 'image', 'data uri', '编码', '解码', '图片']
}

/* ---- 文本模式（v0.3.0 语义原样保留） ---- */

const mode = ref<'text' | 'image'>('text')

const input = ref('')
const output = ref('')
const error = ref('')

function encode() {
  error.value = ''
  try {
    output.value = btoa(unescape(encodeURIComponent(input.value)))
  } catch (e: any) {
    error.value = `${t('base64Codec.errEncode')}: ${e.message}`
    output.value = ''
  }
}

function decode() {
  error.value = ''
  try {
    output.value = decodeURIComponent(escape(atob(input.value)))
  } catch (e: any) {
    error.value = t('base64Codec.errDecode')
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

/* ---- 图片模式（13 票扩展） ---- */

const COPY_FORMS = [
  { key: 'duri', prop: 'dataUri' },
  { key: 'img', prop: 'imgFragment' },
  { key: 'css', prop: 'cssFragment' },
] as const

const fileInput = ref<HTMLInputElement | null>(null)
const imageItems = ref<ImageEncodeItem[]>([])
const encodeErrors = ref<Array<{ name: string; reason: string }>>([])

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`
  return `${(size / (1024 * 1024)).toFixed(2)} MiB`
}

async function readAndEncode(files: File[]): Promise<void> {
  // 批量先筛（≤20 文件 / 单文件 ≤20 MiB）：超限明确报错、不入批，已有结果不动。
  const selection = selectImageBatch(files)
  for (const { file, reason } of selection.rejected) {
    encodeErrors.value.push({ name: file.name, reason })
  }

  for (const file of selection.accepted) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const outcome = encodeImageFile({ name: file.name, type: file.type, bytes })
      if (outcome.ok) {
        imageItems.value.push(outcome.item)
      } else {
        encodeErrors.value.push({ name: file.name, reason: outcome.reason })
      }
    } catch {
      encodeErrors.value.push({ name: file.name, reason: 'readError' })
    }
  }
}

function onPick(event: Event): void {
  const inputEl = event.target as HTMLInputElement
  const files = Array.from(inputEl.files ?? [])
  inputEl.value = '' // 允许重复选择同一文件
  void readAndEncode(files)
}

function onDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? [])
  void readAndEncode(files)
}

function clearImages(): void {
  imageItems.value = []
  encodeErrors.value = []
}

const copiedKey = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyFragment(item: ImageEncodeItem, formKey: string): Promise<void> {
  const value =
    formKey === 'duri' ? item.dataUri : formKey === 'img' ? item.imgFragment : item.cssFragment
  try {
    await navigator.clipboard.writeText(value)
    copiedKey.value = `${imageItems.value.indexOf(item)}:${formKey}`
    if (copiedTimer !== undefined) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedKey.value = ''
    }, 1500)
  } catch {
    // Clipboard unavailable — silently ignore.
  }
}

// 反向解码：转换类实时防抖 300ms（平台附录 §2）。
const decodeInput = ref('')
const decodedImage = ref<{ mime: string; dataUri: string; bytes: Uint8Array } | null>(null)
const decodeError = ref('')
let decodeTimer: ReturnType<typeof setTimeout> | undefined

watch(decodeInput, () => {
  clearTimeout(decodeTimer)
  decodeTimer = setTimeout(applyDecode, 300)
})

function applyDecode(): void {
  const result = parseImageDataUri(decodeInput.value)
  if (result.ok) {
    decodedImage.value = { mime: result.mime, dataUri: result.dataUri, bytes: result.bytes }
    decodeError.value = ''
  } else {
    decodedImage.value = null
    decodeError.value = result.reason === 'empty' ? '' : result.reason
  }
}

// 输出命名：basename + 扩展名，冲突追加 _1/_2。
const usedDownloadNames = new Set<string>()

function downloadDecoded(): void {
  if (!decodedImage.value) return
  const name = dedupeFileName(`image.${imageMimeExtension(decodedImage.value.mime)}`, usedDownloadNames)
  const blob = new Blob([decodedImage.value.bytes.slice()], { type: decodedImage.value.mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

onUnmounted(() => {
  clearTimeout(decodeTimer)
  if (copiedTimer !== undefined) clearTimeout(copiedTimer)
})
</script>

<style scoped>
.base64-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.tabs {
  display: flex;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--border);
}

.tab {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

.pane {
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

.label.small {
  font-size: 12px;
}

.results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
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

.textarea.fragment {
  font-size: 12px;
}

.drop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-lg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.drop:hover {
  border-color: var(--border-focus);
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.file-input {
  display: none;
}

.hint {
  margin: 0;
  font-size: 12px;
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

.image-result {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.img-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.thumb {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
}

.img-name {
  font-size: 13px;
  color: var(--text-primary);
}

.img-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.copy-form {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-sm);
}

.copy-form .textarea {
  grid-column: 2;
  margin: 0;
}

.copy-form .label {
  grid-row: 1;
  grid-column: 1;
}

.copy-form .btn {
  grid-row: 1;
  grid-column: 3;
  padding: var(--space-xs) var(--space-sm);
}

.decode-result {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.preview {
  max-width: 280px;
  max-height: 280px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.decode-meta {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.error {
  color: var(--error);
  font-size: 13px;
  margin-top: var(--space-sm);
}

.errors {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.errors .error {
  margin-top: 0;
}
</style>
