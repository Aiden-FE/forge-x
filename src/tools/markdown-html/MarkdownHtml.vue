<template>
  <div class="markdown-html-tool">
    <ToolLayout :tool="toolMeta">
      <div class="controls" data-test="controls">
        <div class="segmented" role="group" :aria-label="t('markdownHtml.directionLabel')">
          <button
            class="seg-btn"
            :class="{ active: direction === 'md-to-html' }"
            data-test="direction-md-to-html"
            @click="direction = 'md-to-html'"
          >
            {{ t('markdownHtml.directionMdToHtml') }}
          </button>
          <button
            class="seg-btn"
            :class="{ active: direction === 'html-to-md' }"
            data-test="direction-html-to-md"
            @click="direction = 'html-to-md'"
          >
            {{ t('markdownHtml.directionHtmlToMd') }}
          </button>
        </div>
        <span class="hint">{{ t('markdownHtml.inputHint') }}</span>
      </div>

      <div class="panel">
        <label class="label">
          {{ direction === 'md-to-html' ? t('markdownHtml.inputLabelMd') : t('markdownHtml.inputLabelHtml') }}
        </label>
        <textarea
          v-model="input"
          class="textarea"
          data-test="markdown-html-input"
          :placeholder="direction === 'md-to-html' ? t('markdownHtml.inputPlaceholderMd') : t('markdownHtml.inputPlaceholderHtml')"
          rows="12"
        />
      </div>

      <div class="actions">
        <button class="btn" data-test="copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('markdownHtml.copied') : t('markdownHtml.copy') }}
        </button>
        <button class="btn" data-test="download" :disabled="!output" @click="download">
          <Download :size="16" />
          {{ t('markdownHtml.download') }}
        </button>
        <!-- 10 票扩展：带高亮导出（默认关——关闭时输出即语义不变，仍裸
             <pre><code>）；开启后复制/下载均为 hljs span + 自包含样式块。 -->
        <label
          v-if="direction === 'md-to-html'"
          class="toggle"
          data-test="hl-export-toggle"
        >
          <input v-model="hlExportOn" type="checkbox" />
          {{ t('markdownHtml.hlExport') }}
        </label>
        <button class="btn" data-test="clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('markdownHtml.clear') }}
        </button>
      </div>

      <div class="panel">
        <label class="label">
          {{ direction === 'md-to-html' ? t('markdownHtml.outputLabelHtml') : t('markdownHtml.outputLabelMd') }}
        </label>
        <textarea
          v-model="output"
          class="textarea"
          data-test="markdown-html-output"
          readonly
          rows="12"
          :placeholder="outputPlaceholder"
        />
        <ul v-if="errors.length > 0" class="errors" data-test="errors">
          <li v-for="(error, index) in errors" :key="index" class="error">{{ formatError(error) }}</li>
        </ul>
      </div>

      <!-- Preview (md→html only): collapsible, collapsed by default; while
           collapsed the iframe DOM does not exist. Fenced code blocks are
           syntax-highlighted in the preview only (load-on-touch: highlight.js
           is imported when — and only when — the output contains
           <pre><code>; see highlight.ts). The sandboxed iframe renders the
           sanitized preview HTML only — scripts are doubly blocked. -->
      <div v-if="direction === 'md-to-html'" class="preview" data-test="preview-section">
        <div class="preview-head">
          <button
            class="btn"
            data-test="preview-toggle"
            :aria-expanded="previewOpen"
            @click="previewOpen = !previewOpen"
          >
            <Eye v-if="!previewOpen" :size="16" />
            <EyeOff v-else :size="16" />
            {{ previewOpen ? t('markdownHtml.previewHide') : t('markdownHtml.previewShow') }}
          </button>
          <span v-if="hlExportOn" class="hint" data-test="hl-export-note">
            {{ t('markdownHtml.hlExportNotice') }}
          </span>
          <span v-else-if="highlightPreview" class="hint" data-test="hljs-note">
            {{ t('markdownHtml.highlightNotice') }}
          </span>
          <span v-else class="hint">{{ t('markdownHtml.previewHint') }}</span>
        </div>
        <iframe
          v-if="previewOpen && output"
          class="preview-frame"
          data-test="preview"
          sandbox=""
          :srcdoc="previewSrcdoc"
          title="markdown-html-preview"
        />
      </div>

      <p v-if="direction === 'html-to-md'" class="notice">{{ t('markdownHtml.structureNotice') }}</p>
      <p class="notice">{{ t('markdownHtml.sanitizeNotice') }}</p>
      <p class="notice">{{ t('markdownHtml.localNotice') }}</p>
    </ToolLayout>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Copy, Download, Eye, EyeOff, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import { useThemeStore } from '@/stores/theme'
import type { ToolMeta } from '@/types/tool'
import MarkdownHtml from './MarkdownHtml.vue'
import { convert, loadSanitizer } from './convert'
import type { Direction, MarkdownHtmlError } from './convert'
import { buildHighlightedPreview, buildStandaloneHighlightedDocument, outputHasCodeBlocks } from './highlight'
import type { HighlightedPreview } from './highlight'

const { t } = useI18n()
const themeStore = useThemeStore()

const toolMeta: ToolMeta = {
  id: 'markdown-html',
  name: 'Markdown↔HTML 转换',
  description: 'GFM 全套双向转换，输出一律经 DOMPurify 净化；围栏代码预览高亮',
  category: 'text',
  icon: 'FileCode2',
  component: MarkdownHtml,
}

const direction = ref<Direction>('md-to-html')
const input = ref('')
const output = ref('')
const errors = ref<MarkdownHtmlError[]>([])
const copied = ref(false)
const previewOpen = ref(false) // collapsed by default (spec §4)
// 13 票扩展：预览路径专用高亮结果（触达加载——仅在输出含 <pre><code> 时产生）。
const highlightPreview = ref<HighlightedPreview | null>(null)
// 10 票扩展：带高亮导出开关，默认关（关闭时复制/下载输出即语义，仍裸
// <pre><code>；开启且存在高亮片段时输出为自包含文档）。
const hlExportOn = ref(false)

/**
 * 自包含高亮导出文档：仅当开关开启且高亮片段存在（md→html 且输出含代码
 * 块）时产生；主体为已净化片段，样式块为模块自有 github 单主题（净化后
 * 注入，见 highlight.ts）。无代码块/未开启/HTML→MD 方向 → null（复制与
 * 下载回退为语义输出，行为与开关引入前完全一致）。
 */
const hlExportDoc = computed(() =>
  hlExportOn.value && highlightPreview.value && highlightPreview.value.html
    ? buildStandaloneHighlightedDocument(highlightPreview.value)
    : null,
)

/** 复制/下载实际内容：带高亮导出开启且有片段时用导出文档，否则语义输出。 */
function effectiveOutput(): string {
  return hlExportDoc.value?.html ?? output.value
}

const outputPlaceholder = computed(() =>
  input.value.trim() === '' ? t('markdownHtml.outputEmpty') : '',
)

/**
 * 预览 iframe 的 srcdoc：输出含代码块时用高亮版（hljs span 仅在此 DOM），
 * 否则原样输出；主题样式跟随应用明暗（两套样式触达时都已加载，这里响应式
 * 切换注入哪一套）。
 */
const previewSrcdoc = computed(() => {
  const body = highlightPreview.value?.html || output.value
  const styles = highlightPreview.value?.styles
  const themeCss = styles ? (themeStore.theme === 'dark' ? styles.dark : styles.light) : ''
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>',
    themeCss,
    'body{margin:16px;}',
    '</style></head><body>',
    body,
    '</body></html>',
  ].join('')
})

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let runToken = 0

watch([input, direction], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(convertNow, 200)
})

async function convertNow() {
  const token = ++runToken
  const text = input.value
  output.value = ''
  errors.value = []
  highlightPreview.value = null

  if (text.trim() === '') return

  let outcome
  try {
    // No sanitize argument: convert() loads the shared DOMPurify-based step
    // on first use (dynamic import) and routes every output through it.
    outcome = await convert(text, direction.value)
  } catch (caught) {
    if (token !== runToken) return
    errors.value = [{ code: 'convert', message: caught instanceof Error ? caught.message : String(caught) }]
    return
  }
  if (token !== runToken) return
  if (outcome.ok) {
    output.value = outcome.value
  } else {
    errors.value = outcome.errors
    return
  }

  // 触达加载闸门：只有 md→html 且输出含围栏代码块时才拉起 highlight.js；
  // 无代码块的文档到此为止，零 hljs 成本。
  if (direction.value === 'md-to-html' && outputHasCodeBlocks(output.value)) {
    try {
      const preview = await buildHighlightedPreview(text, {
        sanitize: await loadSanitizer(),
        noHighlightLabel: t('markdownHtml.noHighlight'),
      })
      if (token !== runToken) return
      highlightPreview.value = preview.html ? preview : null
    } catch {
      // 高亮是附加层：任何加载失败都回退为裸输出预览。
      highlightPreview.value = null
    }
  }
}

function formatError(error: MarkdownHtmlError): string {
  const reason = t(`markdownHtml.errors.${error.code}`, {}, t('markdownHtml.errors.unexpected'))
  if (error.message && error.code === 'convert') {
    return `${reason}: ${error.message}`
  }
  return reason
}

/* ---------------- output actions ---------------- */

function copy() {
  if (!output.value) return
  void navigator.clipboard.writeText(effectiveOutput())
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}

function download() {
  if (!output.value) return
  const toHtml = direction.value === 'md-to-html'
  // 带高亮导出开启时同为 HTML 文档（自包含样式块），文件名不变。
  const blob = new Blob([effectiveOutput()], {
    type: toHtml ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8',
  })
  triggerDownload(blob, toHtml ? 'converted.html' : 'converted.md')
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
  errors.value = []
  highlightPreview.value = null
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
})
</script>

<style scoped>
.markdown-html-tool {
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

.toggle {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.preview-head {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.preview-frame {
  width: 100%;
  height: 360px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: #ffffff;
  color-scheme: light;
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
