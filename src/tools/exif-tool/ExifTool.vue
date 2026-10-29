<template>
  <ToolLayout :tool="toolMeta">
    <div class="exif-tool">
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
          accept=".jpg,.jpeg,.png,.tif,.tiff,image/jpeg,image/png,image/tiff"
          class="hidden-input"
          data-test="file-input"
          @change="onFilePicked"
        />
        <template v-if="rows.length === 0">
          <div class="dropzone-empty" data-test="empty-state">
            <ScanLine :size="36" class="dropzone-icon" />
            <p class="dropzone-title">{{ t('exifTool.dropHint') }}</p>
            <p class="dropzone-choose">{{ t('exifTool.chooseFiles') }}</p>
            <p class="dropzone-hint">{{ t('exifTool.supportedFormats') }}</p>
            <p class="dropzone-hint">{{ t('exifTool.limits') }}</p>
            <p class="dropzone-hint">{{ t('exifTool.boundaryNote') }}</p>
            <p class="dropzone-hint">{{ t('exifTool.iphoneHint') }}</p>
          </div>
        </template>
        <template v-else>
          <ScanLine :size="18" />
          <span>{{ t('exifTool.addMore') }}</span>
        </template>
      </div>

      <!-- 顶部操作 -->
      <div class="toolbar">
        <div class="toolbar-hint">{{ t('exifTool.gpsNoMap') }}</div>
        <div class="toolbar-actions">
          <button
            class="btn primary"
            data-test="strip-all-btn"
            :disabled="stripPendingCount === 0"
            @click="stripAll"
          >
            <ShieldCheck :size="16" />
            {{ t('exifTool.stripAll') }}
          </button>
          <button
            class="btn"
            data-test="download-all-btn"
            :disabled="cleanedCount === 0"
            @click="downloadAll"
          >
            <Archive :size="16" />
            {{ t('exifTool.downloadAll') }}
          </button>
          <button class="btn" data-test="clear-btn" :disabled="rows.length === 0" @click="clearAll">
            <Trash2 :size="16" />
            {{ t('exifTool.clear') }}
          </button>
        </div>
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
          :data-format="row.format"
        >
          <button class="fold-btn" :aria-expanded="row.expanded" @click="row.expanded = !row.expanded">
            <ChevronDown :size="16" :class="{ folded: !row.expanded }" />
          </button>
          <div class="row-main">
            <div class="row-name" :title="row.name">
              {{ row.name }}
              <span class="badge" data-test="row-format">{{ row.format.toUpperCase() }}</span>
              <span v-if="!isStrippable(row.format)" class="badge" data-test="row-only-view">
                {{ t('exifTool.onlyView') }}
              </span>
            </div>
            <div v-if="row.status === 'inspecting' || row.status === 'stripping'" class="row-status" data-test="row-status">
              <Loader2 :size="14" class="spin" />
              {{ row.status === 'inspecting' ? t('exifTool.inspecting') : t('exifTool.stripping') }}
            </div>
            <div v-else-if="row.status === 'failed'" class="row-error" data-test="row-error">{{ row.error }}</div>
            <div v-else class="row-meta">
              <span
                class="entries"
                :class="{ zero: row.entryCount === 0 }"
                data-test="row-entries"
              >
                {{ t('exifTool.entryCount', { n: String(row.entryCount ?? 0) }) }}
              </span>
              <span v-if="row.hasIcc" class="badge icc" data-test="row-icc">
                <ShieldCheck :size="12" />
                {{ t('exifTool.iccKept') }}
              </span>
              <template v-if="row.status === 'cleaned'">
                <span class="sizes" data-test="row-sizes">
                  {{ formatBytes(row.size) }} → {{ formatBytes(row.cleanedSize ?? 0) }}
                </span>
                <span class="residual ok" data-test="row-residual">
                  {{ t('exifTool.residual', { n: String(row.residualCount ?? 0) }) }}
                </span>
              </template>
            </div>
          </div>
          <div class="row-actions">
            <button
              v-if="row.status === 'viewing' && isStrippable(row.format)"
              class="mini-btn primary"
              :aria-label="t('exifTool.strip')"
              data-test="row-strip"
              @click="void stripRow(row)"
            >
              <ShieldCheck :size="14" />
            </button>
            <button
              v-if="row.status === 'cleaned' && row.blob"
              class="mini-btn"
              :aria-label="t('exifTool.download')"
              data-test="row-download"
              @click="downloadRow(row)"
            >
              <Download :size="14" />
            </button>
            <button
              class="mini-btn"
              :aria-label="t('exifTool.remove')"
              data-test="row-remove"
              @click="removeRow(row)"
            >
              <X :size="14" />
            </button>
          </div>

          <!-- 展开面板：元数据视图 -->
          <div v-if="row.expanded && (row.status === 'viewing' || row.status === 'cleaned')" class="detail">
            <div v-if="row.entryCount === 0" class="empty-metadata" data-test="row-no-metadata">
              <FileSearch :size="20" />
              <span>{{ t('exifTool.noMetadata') }}</span>
            </div>
            <template v-else>
              <div v-if="row.status === 'cleaned'" class="orientation-warning" data-test="orientation-warning">
                <AlertTriangle :size="14" />
                <span>{{ t('exifTool.orientationWarning') }}</span>
              </div>
              <div class="view-toggle">
                <button
                  class="toggle-btn"
                  :class="{ active: !row.rawView }"
                  data-test="view-grouped-btn"
                  @click="row.rawView = false"
                >
                  {{ t('exifTool.viewGrouped') }}
                </button>
                <button
                  class="toggle-btn"
                  :class="{ active: row.rawView }"
                  data-test="view-raw-btn"
                  @click="row.rawView = true"
                >
                  {{ t('exifTool.viewRaw') }}
                </button>
              </div>

              <template v-if="!row.rawView">
                <!-- 分组可读视图 -->
                <div v-if="row.gps" class="gps-summary" data-test="gps-summary">
                  <MapPin :size="14" />
                  <div>
                    <div class="gps-coords">{{ row.gps.decimal }}</div>
                    <div class="gps-dms">{{ row.gps.dms }}</div>
                    <div class="gps-note">{{ t('exifTool.gpsNoMap') }}</div>
                  </div>
                </div>
                <div
                  v-for="group in row.groups"
                  :key="group.id"
                  class="group"
                  :data-group="group.id"
                  :data-test="`group-${group.id}`"
                >
                  <template v-if="group.entries.length > 0">
                    <div class="group-title">{{ t(`exifTool.group${capitalize(group.id)}`) }}</div>
                    <div v-for="entry in group.entries" :key="entry.key" class="entry">
                      <span class="entry-key">{{ tagLabel(entry.key) }}</span>
                      <span class="entry-value" :title="entry.value">{{ entry.value }}</span>
                    </div>
                  </template>
                </div>
              </template>
              <template v-else>
                <!-- 原始标签全量列表 -->
                <div class="raw-tags" data-test="raw-tags">
                  <div v-for="(tag, i) in row.rawTags" :key="`${tag.name}-${i}`" class="entry">
                    <span class="entry-key">
                      <span v-if="tag.id !== undefined" class="tag-id" data-test="raw-tag-id">{{ tag.id }}</span>
                      {{ tag.name }}
                    </span>
                    <span class="entry-value" :title="tag.value">{{ tag.value }}</span>
                  </div>
                </div>
              </template>
            </template>
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
  ChevronDown,
  Download,
  FileSearch,
  Loader2,
  MapPin,
  ScanLine,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import ExifToolComponent from './ExifTool.vue'
import type { GpsSummary, InspectResult, MetadataGroup, RawTag } from './inspect'
import { inspectPhoto } from './inspect'
import { ExifError } from './errors'
import { allocateCleanedName } from './naming'
import { exifrInspector, stripAndVerify } from './pipeline'
import { formatBytes, zipFileName } from './stats'
import type { FailureReason, PhotoFormat } from './validate'
import { detectFormat, isStrippableFormat, validateBatchCapacity, validateFile } from './validate'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'exif-tool',
  name: 'EXIF 查看/清除',
  description: '查看 JPEG/PNG/TIFF 元数据，无损清除 JPEG/PNG 元数据（保留 ICC）',
  category: 'convert',
  icon: 'ScanLine',
  component: ExifToolComponent,
  keywords: ['exif', 'metadata', 'photo', 'jpeg', 'png', 'tiff', 'gps', '元数据', '隐私'],
}

type RowStatus = 'inspecting' | 'viewing' | 'stripping' | 'cleaned' | 'failed'

interface Row {
  id: number
  file: File
  name: string
  size: number
  format: PhotoFormat
  status: RowStatus
  error?: string
  expanded: boolean
  rawView: boolean
  entryCount?: number
  groups?: MetadataGroup[]
  rawTags?: RawTag[]
  gps?: GpsSummary | null
  hasIcc?: boolean
  outputName?: string
  cleanedSize?: number
  residualCount?: number
  blob?: Blob
}

const rows = ref<Row[]>([])
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const usedNames = new Set<string>()
let nextId = 1
let disposed = false

const stripPendingCount = computed(
  () => rows.value.filter((r) => r.status === 'viewing' && isStrippableFormat(r.format)).length,
)
const cleanedCount = computed(() => rows.value.filter((r) => r.status === 'cleaned').length)

const REASON_KEYS: Record<FailureReason, string> = {
  'unsupported-format': 'exifTool.errUnsupported',
  'file-too-large': 'exifTool.errTooLarge',
  'too-many-files': 'exifTool.errTooMany',
  'view-failed': 'exifTool.errViewFailed',
  'strip-failed': 'exifTool.errStripFailed',
  'corrupt-file': 'exifTool.errCorrupt',
  'format-not-strippable': 'exifTool.errNotStrippable',
  'residual-not-clean': 'exifTool.errResidual',
}

const MIME_BY_FORMAT: Record<PhotoFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  tiff: 'image/tiff',
}

function reasonToMessage(reason: FailureReason): string {
  return t(REASON_KEYS[reason])
}

function isStrippable(format: PhotoFormat): boolean {
  return isStrippableFormat(format)
}

function capitalize(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/** 标签可读名：有译文用译文，否则回落到原始键名。 */
function tagLabel(key: string): string {
  return t(`exifTool.tag.${key}`, {}, key)
}

function makeRow(file: File, format: PhotoFormat): Row {
  // 行对象必须是响应式代理：完成后直接改字段，UI 才能触发更新（同 WebP 转换器）
  return reactive({
    id: nextId++,
    file: markRaw(file),
    name: file.name,
    size: file.size,
    format,
    status: 'inspecting' as const,
    expanded: true,
    rawView: false,
  }) as Row
}

function markFailed(row: Row, reason: FailureReason) {
  row.status = 'failed'
  row.error = reasonToMessage(reason)
}

async function inspectRow(row: Row) {
  try {
    const bytes = new Uint8Array(await row.file.arrayBuffer())
    const result: InspectResult = await inspectPhoto(bytes, row.format)
    if (disposed) return
    row.entryCount = result.entryCount
    row.groups = result.groups
    row.rawTags = result.rawTags
    row.gps = result.gps
    row.hasIcc = result.hasIcc
    row.status = 'viewing'
  } catch {
    if (disposed) return
    markFailed(row, 'view-failed')
  }
}

async function addFiles(files: ArrayLike<File>) {
  for (const file of Array.from(files)) {
    const row = makeRow(file, detectFormat(file) ?? 'jpeg')
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
    void inspectRow(row)
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

/**
 * 清除单文件：剥除 → 自动重解析闭环验证。
 * 验证不过 → 标错误态（errResidual），不静默通过（规格 §5）。
 */
async function stripRow(row: Row) {
  row.status = 'stripping'
  try {
    const bytes = new Uint8Array(await row.file.arrayBuffer())
    const outcome = await stripAndVerify(exifrInspector, bytes, row.format)
    if (disposed) return
    if (!outcome.verified) {
      markFailed(row, 'residual-not-clean')
      return
    }
    if (row.outputName === undefined) {
      row.outputName = allocateCleanedName(row.name, usedNames)
      usedNames.add(row.outputName)
    }
    // 拷贝到独立 ArrayBuffer 视图（BlobPart 类型要求非 SharedArrayBuffer 后备）
    const blobBytes = new Uint8Array(outcome.output.length)
    blobBytes.set(outcome.output)
    row.blob = markRaw(new Blob([blobBytes], { type: MIME_BY_FORMAT[row.format] }))
    row.cleanedSize = outcome.cleanedSize
    row.residualCount = outcome.residualCount
    row.hasIcc = outcome.hasIcc
    row.status = 'cleaned'
    row.error = undefined
  } catch (e) {
    if (disposed) return
    const reason = e instanceof ExifError ? e.reason : 'strip-failed'
    markFailed(row, reason)
  }
}

/** 全部清除：逐行清除当前「已查看且可剥除」的文件（串行，避免大文件并发内存峰值）。 */
async function stripAll() {
  const targets = rows.value.filter((r) => r.status === 'viewing' && isStrippableFormat(r.format))
  for (const row of targets) {
    await stripRow(row)
  }
}

function removeRow(row: Row) {
  if (row.outputName) usedNames.delete(row.outputName)
  const i = rows.value.findIndex((r) => r.id === row.id)
  if (i >= 0) rows.value.splice(i, 1)
}

function clearAll() {
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
  if (row.status === 'cleaned' && row.blob && row.outputName) triggerDownload(row.blob, row.outputName)
}

async function downloadAll() {
  const zip = new JSZip()
  for (const row of rows.value) {
    if (row.status === 'cleaned' && row.blob && row.outputName) zip.file(row.outputName, row.blob)
  }
  if (Object.keys(zip.files).length === 0) return
  triggerDownload(await zip.generateAsync({ type: 'blob' }), zipFileName())
}

onBeforeUnmount(() => {
  disposed = true
})
</script>

<style scoped>
.exif-tool {
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

.toolbar-hint {
  font-size: 12px;
  color: var(--text-quaternary);
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

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.fold-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 2px;
  color: var(--text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
}

.fold-btn .folded {
  transform: rotate(-90deg);
}

.row-main {
  flex: 1;
  min-width: 240px;
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
  display: inline-flex;
  align-items: center;
  gap: 3px;
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

.badge.icc {
  color: var(--success, var(--accent));
}

.row-meta {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-size: 13px;
  color: var(--text-tertiary);
  flex-wrap: wrap;
}

.entries.zero {
  color: var(--text-quaternary);
}

.sizes {
  font-variant-numeric: tabular-nums;
}

.residual.ok {
  color: var(--success, var(--accent));
  font-weight: 510;
}

.row-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  margin-top: 2px;
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

.mini-btn.primary {
  color: var(--accent);
}

.spin {
  animation: exif-spin 1s linear infinite;
}

@keyframes exif-spin {
  to {
    transform: rotate(360deg);
  }
}

.detail {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  border-top: 1px solid var(--border);
  padding-top: var(--space-sm);
}

.empty-metadata {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-md) 0;
  font-size: 14px;
  color: var(--text-quaternary);
}

.orientation-warning {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  font-size: 13px;
  color: var(--warning);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  width: fit-content;
}

.toggle-btn {
  padding: 3px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.toggle-btn.active {
  color: #fff;
  background: var(--accent);
}

.gps-summary {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.gps-summary > svg {
  margin-top: 2px;
  color: var(--accent);
  flex-shrink: 0;
}

.gps-coords {
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.gps-dms {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.gps-note {
  font-size: 12px;
  color: var(--text-quaternary);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-title {
  font-size: 12px;
  font-weight: 510;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 2px;
}

.raw-tags {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entry {
  display: flex;
  gap: var(--space-md);
  font-size: 13px;
  line-height: 1.6;
}

.entry-key {
  flex-shrink: 0;
  width: 180px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-id {
  display: inline-block;
  min-width: 34px;
  margin-right: 6px;
  font-size: 11px;
  color: var(--text-quaternary);
  font-variant-numeric: tabular-nums;
}

.entry-value {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
