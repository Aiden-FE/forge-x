<template>
  <ToolLayout :tool="toolMeta">
    <div class="webp-tool">
      <!-- 添加入口：拖拽 + 点击选择 -->
      <div
        class="dropzone"
        :class="{ 'has-rows': rows.length > 0, 'drag-over': dragOver }"
        data-test="dropzone"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
      >
        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.bmp,.svg,.webp,image/png,image/jpeg,image/gif,image/bmp,image/svg+xml,image/webp"
          class="hidden-input"
          data-test="file-input"
          @change="onFilePicked"
        />
        <template v-if="rows.length === 0">
          <div class="dropzone-empty" data-test="empty-state">
            <ImageDown :size="36" class="dropzone-icon" />
            <p class="dropzone-title">{{ t('webpConverter.dropHint') }}</p>
            <p class="dropzone-choose">{{ t('webpConverter.chooseFiles') }}</p>
            <p class="dropzone-hint">{{ t('webpConverter.supportedFormats') }}</p>
            <p class="dropzone-hint">{{ t('webpConverter.limits') }}</p>
          </div>
        </template>
        <template v-else>
          <ImageDown :size="18" />
          <span>{{ t('webpConverter.addMore') }}</span>
        </template>
      </div>

      <!-- 质量（全局）+ 顶部操作 -->
      <div class="toolbar">
        <div class="quality" data-test="quality-control">
          <label for="webp-quality-slider">{{ t('webpConverter.quality') }}</label>
          <input
            id="webp-quality-slider"
            v-model.number="quality"
            type="range"
            min="0"
            max="100"
            step="1"
            data-test="quality-slider"
          />
          <input
            v-model.number="quality"
            type="number"
            min="0"
            max="100"
            step="1"
            class="quality-num"
            data-test="quality-input"
            :aria-label="t('webpConverter.quality')"
          />
        </div>
        <div class="toolbar-actions">
          <button
            class="btn primary"
            data-test="download-all-btn"
            :disabled="successCount === 0"
            @click="downloadAll"
          >
            <Archive :size="16" />
            {{ t('webpConverter.downloadAll') }}
          </button>
          <button class="btn" data-test="clear-btn" :disabled="rows.length === 0" @click="clearAll">
            <Trash2 :size="16" />
            {{ t('webpConverter.clear') }}
          </button>
        </div>
      </div>

      <!-- 设置已变更提示 -->
      <div v-if="pendingReconvert" class="banner" data-test="reconvert-banner">
        <AlertTriangle :size="16" />
        <span>{{ t('webpConverter.settingsChanged') }}</span>
        <button class="btn primary" data-test="reconvert-btn" :disabled="reconverting" @click="reconvert">
          <RotateCcw :size="16" />
          {{ t('webpConverter.reconvert') }}
        </button>
      </div>

      <!-- 结果列表 -->
      <div v-if="rows.length > 0" class="rows" data-test="rows">
        <div
          v-for="row in rows"
          :key="row.id"
          class="row"
          :class="`row-${row.status}`"
          data-test="row"
          :data-status="row.status"
        >
          <div class="thumb">
            <img
              v-if="row.status === 'success' && row.thumbnailUrl"
              :src="row.thumbnailUrl"
              :alt="row.outputName"
              data-test="row-thumb"
            />
            <div v-else class="thumb-placeholder" data-test="row-thumb-placeholder">
              <Loader2 v-if="row.status === 'converting'" :size="18" class="spin" />
              <ImageOff v-else :size="18" />
            </div>
          </div>
          <div class="row-main">
            <div class="row-name" :title="row.originalName">
              {{ row.outputName }}
              <span v-if="row.firstFrame" class="badge" data-test="row-first-frame">
                {{ t('webpConverter.firstFrame') }}
              </span>
            </div>
            <div v-if="row.status === 'success'" class="row-meta">
              <span class="sizes" data-test="row-sizes">
                {{ formatBytes(row.originalSize) }} → {{ formatBytes(row.convertedSize ?? 0) }}
              </span>
              <span class="ratio" :class="{ negative: (row.ratio ?? 0) < 0 }" data-test="row-ratio">
                {{ formatRatio(row.ratio ?? 0) }}
              </span>
              <span class="dims" data-test="row-dims">
                {{ formatDimensions(row.originalDims?.w ?? 0, row.originalDims?.h ?? 0) }} →
                {{ formatDimensions(row.convertedDims?.w ?? 0, row.convertedDims?.h ?? 0) }}
              </span>
            </div>
            <div v-else-if="row.status === 'converting'" class="row-status" data-test="row-status">
              {{ t('webpConverter.converting') }}
            </div>
            <div v-else class="row-error" data-test="row-error">{{ row.error }}</div>
          </div>
          <div class="row-actions">
            <button
              class="mini-btn"
              :aria-label="t('webpConverter.download')"
              data-test="row-download"
              :disabled="row.status !== 'success'"
              @click="downloadRow(row)"
            >
              <Download :size="14" />
            </button>
            <button
              class="mini-btn"
              :aria-label="t('webpConverter.remove')"
              data-test="row-remove"
              @click="removeRow(row)"
            >
              <X :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, reactive, ref } from 'vue'
import JSZip from 'jszip'
import {
  AlertTriangle,
  Archive,
  Download,
  ImageDown,
  ImageOff,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import WebpConverter from './WebpConverter.vue'
import { decodeImage } from './decode'
import { encodeToWebp } from './encode'
import { ConversionError } from './errors'
import { allocateOutputName } from './naming'
import { compressionRatio, formatBytes, formatDimensions, formatRatio, zipFileName } from './stats'
import type { FailureReason } from './validate'
import { validateBatchCapacity, validateDimensions, validateFile } from './validate'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'webp-converter',
  name: 'WebP 转换器',
  description: '批量将图片转换为 WebP 格式',
  category: 'convert',
  icon: 'ImageDown',
  component: WebpConverter,
  keywords: ['webp', '转换', '压缩', '图片', 'batch', 'convert', 'image'],
}

interface Row {
  id: number
  file: File
  originalName: string
  /** 加入批次时确定的输出名；重新转换不改变 */
  outputName: string
  status: 'converting' | 'success' | 'failed'
  error?: string
  originalSize: number
  convertedSize?: number
  ratio?: number
  originalDims?: { w: number; h: number }
  convertedDims?: { w: number; h: number }
  firstFrame?: boolean
  appliedQuality?: number
  blob?: Blob
  thumbnailUrl?: string
  /** 保留解码产物供重新转换 */
  source?: HTMLCanvasElement
}

const rows = ref<Row[]>([])
const quality = ref(80)
const dragOver = ref(false)
const reconverting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const usedNames = new Set<string>()
let nextId = 1
let disposed = false

const successCount = computed(() => rows.value.filter((r) => r.status === 'success').length)

/** 存在「已成功但质量已变更」的行 → 显示「设置已变更」提示 */
const pendingReconvert = computed(() =>
  rows.value.some((r) => r.status === 'success' && r.appliedQuality !== quality.value),
)

const REASON_KEYS: Record<FailureReason, string> = {
  'unsupported-format': 'webpConverter.errUnsupported',
  'file-too-large': 'webpConverter.errTooLarge',
  'too-many-files': 'webpConverter.errTooMany',
  'image-too-large': 'webpConverter.errTooBig',
  'svg-no-size': 'webpConverter.errSvgNoSize',
  'decode-failed': 'webpConverter.errDecode',
  'encode-failed': 'webpConverter.errEncode',
}

function reasonToMessage(reason: FailureReason): string {
  return t(REASON_KEYS[reason])
}

function makeRow(file: File, outputName: string): Row {
  // 行对象必须是响应式代理：转换完成后直接改字段，UI 才能触发更新
  // （若推入 ref 数组后仍持有原始对象引用去改，会绕过 set 陷阱，视图永卡 converting）
  return reactive({
    id: nextId++,
    file: markRaw(file),
    originalName: file.name,
    outputName,
    status: 'converting' as const,
    originalSize: file.size,
  }) as Row
}

function markFailed(row: Row, reason: FailureReason) {
  row.status = 'failed'
  row.error = reasonToMessage(reason)
}

function applySuccess(row: Row, blob: Blob, decoded: { width: number; height: number; firstFrame: boolean }, canvas: HTMLCanvasElement) {
  if (row.thumbnailUrl) URL.revokeObjectURL(row.thumbnailUrl)
  row.blob = blob
  row.thumbnailUrl = URL.createObjectURL(blob)
  row.convertedSize = blob.size
  row.ratio = compressionRatio(row.originalSize, blob.size)
  row.convertedDims = { w: decoded.width, h: decoded.height }
  row.appliedQuality = quality.value
  row.source = markRaw(canvas)
  row.firstFrame = decoded.firstFrame
  row.status = 'success'
  row.error = undefined
}

async function convertRow(row: Row) {
  row.status = 'converting'
  try {
    const decoded = await decodeImage(row.file)
    const dimCheck = validateDimensions(decoded.width, decoded.height)
    if (!dimCheck.ok) throw new ConversionError('image-too-large')
    row.originalDims = { w: decoded.width, h: decoded.height }
    row.firstFrame = decoded.firstFrame
    const blob = await encodeToWebp(decoded.canvas, decoded.width, decoded.height, quality.value)
    if (disposed) return
    applySuccess(row, blob, decoded, decoded.canvas)
  } catch (e) {
    if (disposed) return
    const reason = e instanceof ConversionError ? e.reason : 'decode-failed'
    markFailed(row, reason)
  }
}

async function addFiles(files: ArrayLike<File>) {
  for (const file of Array.from(files)) {
    // 输出名在加入批次时确定并占用（含被拒绝/失败行）：与批内已有名称避重，移除时释放
    const outputName = allocateOutputName(file.name, usedNames)
    usedNames.add(outputName)
    const row = makeRow(file, outputName)
    rows.value.push(row)
    if (!validateBatchCapacity(rows.value.length - 1, 1).ok) {
      markFailed(row, 'too-many-files')
      continue
    }
    const check = validateFile(file)
    if (!check.ok) {
      markFailed(row, check.reason)
      continue
    }
    void convertRow(row)
  }
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) void addFiles(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files)
}

/** 重新转换：仅重编码当前成功的文件，名称不变；失败文件不动 */
async function reconvert() {
  const targets = rows.value.filter(
    (r): r is Row & { source: HTMLCanvasElement; originalDims: { w: number; h: number } } =>
      r.status === 'success' && !!r.source && !!r.originalDims,
  )
  if (targets.length === 0) return
  reconverting.value = true
  for (const row of targets) {
    row.status = 'converting'
    const source = row.source
    const dims = row.originalDims
    const firstFrame = row.firstFrame ?? false
    try {
      const blob = await encodeToWebp(source, dims.w, dims.h, quality.value)
      if (disposed) return
      applySuccess(row, blob, { width: dims.w, height: dims.h, firstFrame }, source)
    } catch {
      if (disposed) return
      markFailed(row, 'encode-failed')
    }
  }
  reconverting.value = false
}

function revokeRow(row: Row) {
  if (row.thumbnailUrl) {
    URL.revokeObjectURL(row.thumbnailUrl)
    row.thumbnailUrl = undefined
  }
}

function removeRow(row: Row) {
  revokeRow(row)
  usedNames.delete(row.outputName)
  const i = rows.value.findIndex((r) => r.id === row.id)
  if (i >= 0) rows.value.splice(i, 1)
}

function clearAll() {
  for (const row of rows.value) revokeRow(row)
  rows.value = []
  usedNames.clear()
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟释放：确保下载已启动
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadRow(row: Row) {
  if (row.status === 'success' && row.blob) triggerDownload(row.blob, row.outputName)
}

async function downloadAll() {
  const zip = new JSZip()
  for (const row of rows.value) {
    if (row.status === 'success' && row.blob) zip.file(row.outputName, row.blob)
  }
  if (Object.keys(zip.files).length === 0) return
  triggerDownload(await zip.generateAsync({ type: 'blob' }), zipFileName())
}

onBeforeUnmount(() => {
  disposed = true
  for (const row of rows.value) revokeRow(row)
})
</script>

<style scoped>
.webp-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--space-lg);
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.dropzone:hover,
.dropzone.drag-over {
  border-color: var(--accent);
  background: var(--bg-card-hover);
}

.dropzone.has-rows {
  padding: var(--space-md);
  font-size: 14px;
  color: var(--text-tertiary);
}

.dropzone-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xl) 0;
  text-align: center;
}

.dropzone-icon {
  color: var(--accent);
  margin-bottom: var(--space-xs);
}

.dropzone-title {
  font-size: 15px;
  color: var(--text-primary);
}

.dropzone-choose {
  font-size: 14px;
  color: var(--accent);
}

.dropzone-hint {
  font-size: 12px;
  color: var(--text-quaternary);
}

.hidden-input {
  display: none;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.quality {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
  color: var(--text-secondary);
}

.quality :deep(input[type='range']) {
  width: 160px;
  accent-color: var(--accent);
}

.quality-num {
  width: 64px;
  padding: 4px 8px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.toolbar-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.banner {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  font-size: 14px;
  color: var(--warning);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.banner .btn {
  margin-left: auto;
  padding: 4px 12px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.thumb {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-quaternary);
}

.spin {
  animation: webp-spin 1s linear infinite;
}

@keyframes webp-spin {
  to {
    transform: rotate(360deg);
  }
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row-name {
  font-size: 14px;
  font-weight: 510;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge {
  display: inline-block;
  margin-left: var(--space-xs);
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  vertical-align: middle;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-size: 13px;
  color: var(--text-tertiary);
  flex-wrap: wrap;
}

.ratio.negative {
  color: var(--error);
  font-weight: 510;
}

.row-status {
  font-size: 13px;
  color: var(--text-tertiary);
}

.row-error {
  font-size: 13px;
  color: var(--error);
}

.row-actions {
  display: flex;
  gap: var(--space-xs);
  flex-shrink: 0;
}

.mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.mini-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.mini-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
