<template>
  <ToolLayout :tool="toolMeta">
    <div class="resize-tool">
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
            <Scaling :size="36" class="dropzone-icon" />
            <p class="dropzone-title">{{ t('imageResize.dropHint') }}</p>
            <p class="dropzone-choose">{{ t('imageResize.chooseFiles') }}</p>
            <p class="dropzone-hint">{{ t('imageResize.supportedFormats') }}</p>
            <p class="dropzone-hint">{{ t('imageResize.limits') }}</p>
            <p class="dropzone-hint">{{ t('imageResize.boundaryNote') }}</p>
          </div>
        </template>
        <template v-else>
          <Scaling :size="18" />
          <span>{{ t('imageResize.addMore') }}</span>
        </template>
      </div>

      <!-- 设置面板：输出格式 + 缩放模式 + 质量（管线后段：批量级参数） -->
      <div class="settings" data-test="settings">
        <p class="notice pipeline-hint" data-test="pipeline-hint">{{ t('imageResize.pipelineHint') }}</p>
        <div class="setting-row">
          <span class="setting-label">{{ t('imageResize.outputFormat') }}</span>
          <div class="seg" role="group">
            <button
              type="button"
              class="seg-btn"
              :class="{ active: outputFormat === 'png' }"
              data-test="format-png"
              @click="outputFormat = 'png'"
            >
              PNG
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: outputFormat === 'jpeg' }"
              data-test="format-jpeg"
              @click="outputFormat = 'jpeg'"
            >
              JPEG
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: outputFormat === 'webp' }"
              data-test="format-webp"
              @click="outputFormat = 'webp'"
            >
              WebP
            </button>
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">{{ t('imageResize.modeLabel') }}</span>
          <div class="seg" role="group">
            <button
              type="button"
              class="seg-btn"
              :class="{ active: mode === 'longest-edge' }"
              data-test="mode-longest"
              @click="mode = 'longest-edge'"
            >
              {{ t('imageResize.modeLongest') }}
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: mode === 'dimensions' }"
              data-test="mode-dims"
              @click="mode = 'dimensions'"
            >
              {{ t('imageResize.modeDims') }}
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: mode === 'percentage' }"
              data-test="mode-percent"
              @click="mode = 'percentage'"
            >
              {{ t('imageResize.modePercent') }}
            </button>
          </div>

          <div v-if="mode === 'longest-edge'" class="mode-inputs">
            <input
              v-model.number="edgeInput"
              type="number"
              min="1"
              :max="MAX_OUTPUT_DIMENSION"
              class="num-input wide"
              data-test="longest-edge-input"
              :aria-label="t('imageResize.longestEdge')"
            />
            <span class="unit">px</span>
          </div>

          <div v-else-if="mode === 'dimensions'" class="mode-inputs">
            <input
              v-model.number="widthInput"
              type="number"
              min="1"
              :max="MAX_OUTPUT_DIMENSION"
              class="num-input"
              data-test="width-input"
              :aria-label="t('imageResize.widthLabel')"
              @input="onWidthEdited"
            />
            <span class="unit">×</span>
            <input
              v-model.number="heightInput"
              type="number"
              min="1"
              :max="MAX_OUTPUT_DIMENSION"
              class="num-input"
              data-test="height-input"
              :aria-label="t('imageResize.heightLabel')"
              @input="onHeightEdited"
            />
            <span class="unit">px</span>
            <label class="lock">
              <input v-model="lockRatio" type="checkbox" data-test="ratio-lock" />
              {{ t('imageResize.ratioLock') }}
            </label>
          </div>

          <div v-else class="mode-inputs">
            <input
              v-model.number="percentInput"
              type="number"
              min="1"
              class="num-input"
              data-test="percent-input"
              :aria-label="t('imageResize.percentLabel')"
            />
            <span class="unit">%</span>
          </div>
        </div>

        <!-- 质量：仅 JPEG/WebP 输出时显示（PNG 无质量概念） -->
        <div v-if="outputFormat !== 'png'" class="setting-row" data-test="quality-control">
          <label class="setting-label" for="resize-quality-slider">{{ t('imageResize.quality') }}</label>
          <input
            id="resize-quality-slider"
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
            class="num-input quality-num"
            data-test="quality-input"
            :aria-label="t('imageResize.quality')"
          />
        </div>

        <p class="notice" data-test="metadata-notice">{{ t('imageResize.metadataNotice') }}</p>
      </div>

      <!-- 目标尺寸非法：错误态，不动已转换结果 -->
      <div v-if="planInvalid" class="banner error" data-test="target-error">
        <AlertTriangle :size="16" />
        <span>{{ t('imageResize.targetError') }}</span>
      </div>

      <!-- 顶部操作 -->
      <div class="toolbar">
        <div class="toolbar-actions">
          <button
            class="btn primary"
            data-test="download-all-btn"
            :disabled="successCount === 0"
            @click="downloadAll"
          >
            <Archive :size="16" />
            {{ t('imageResize.downloadAll') }}
          </button>
          <button class="btn" data-test="clear-btn" :disabled="rows.length === 0" @click="clearAll">
            <Trash2 :size="16" />
            {{ t('imageResize.clear') }}
          </button>
        </div>
      </div>

      <!-- 设置已变更提示：手动重新转换，不自动触发 -->
      <div v-if="pendingReconvert && !planInvalid" class="banner" data-test="reconvert-banner">
        <AlertTriangle :size="16" />
        <span>{{ t('imageResize.settingsChanged') }}</span>
        <button class="btn primary" data-test="reconvert-btn" :disabled="reconverting" @click="reconvert">
          <RotateCcw :size="16" />
          {{ t('imageResize.reconvert') }}
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
                {{ t('imageResize.firstFrame') }}
              </span>
              <span v-if="row.stretch" class="badge" data-test="row-stretch">
                {{ t('imageResize.stretchBadge', { sx: String(row.stretch.x), sy: String(row.stretch.y) }) }}
              </span>
              <span v-if="row.crop" class="badge" data-test="row-cropped">
                {{ t('imageResize.croppedBadge', { w: String(row.crop.width), h: String(row.crop.height) }) }}
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
              {{ t('imageResize.converting') }}
            </div>
            <div v-else class="row-error" data-test="row-error">{{ row.error }}</div>
            <!-- 管线前段（文件级）：裁剪 → 旋转；缩放/质量为批量级参数（上方设置面板） -->
            <div class="row-stage" data-test="row-stage">
              <button class="stage-btn" type="button" data-test="row-crop-btn" @click="openCropper(row)">
                <Crop :size="14" />
                {{ row.crop ? t('imageResize.editCrop') : t('imageResize.cropBtn') }}
              </button>
              <button
                v-if="row.crop"
                class="stage-btn danger"
                type="button"
                data-test="row-clear-crop"
                @click="clearCrop(row)"
              >
                <X :size="14" />
                {{ t('imageResize.clearCrop') }}
              </button>
              <span class="stage-label">{{ t('imageResize.rotateLabel') }}</span>
              <div class="rot-group" role="group" :aria-label="t('imageResize.rotateLabel')" :data-test="`rot-${row.id}`">
                <button
                  v-for="r in ROTATIONS"
                  :key="r"
                  type="button"
                  class="rot-btn"
                  :class="{ active: (row.rotation ?? 0) === r }"
                  :data-test="`row-rot-${r}`"
                  @click="setRotation(row, r)"
                >
                  {{ r }}°
                </button>
              </div>
            </div>
          </div>
          <div class="row-actions">
            <button
              class="mini-btn"
              :aria-label="t('imageResize.download')"
              data-test="row-download"
              :disabled="row.status !== 'success'"
              @click="downloadRow(row)"
            >
              <Download :size="14" />
            </button>
            <button
              class="mini-btn"
              :aria-label="t('imageResize.remove')"
              data-test="row-remove"
              @click="removeRow(row)"
            >
              <X :size="14" />
            </button>
          </div>
        </div>
      </div>
      <!-- 裁剪器（触达加载：打开才 import cropperjs） -->
      <div v-if="cropperState" class="crop-overlay" data-test="crop-overlay">
        <div class="crop-modal">
          <p class="crop-title" data-test="crop-title">
            {{ t('imageResize.cropTitle', { name: cropperState.row.originalName }) }}
          </p>
          <div class="crop-container">
            <img ref="cropperImg" :src="cropperState.url" :alt="cropperState.row.originalName" data-test="crop-image" />
          </div>
          <div class="crop-actions">
            <button class="btn primary" type="button" data-test="crop-confirm" :disabled="!cropperReady" @click="confirmCrop">
              <Check :size="16" />
              {{ t('imageResize.cropConfirm') }}
            </button>
            <button class="btn" type="button" data-test="crop-cancel" @click="closeCropper">
              <X :size="16" />
              {{ t('imageResize.cropCancel') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import type JSZipType from 'jszip'
import {
  AlertTriangle,
  Archive,
  Check,
  Crop,
  Download,
  ImageOff,
  Loader2,
  RotateCcw,
  Scaling,
  Trash2,
  X,
} from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import ImageResize from './ImageResize.vue'
import type { OutputFormat } from './encode'
import { OUTPUT_EXT, needsQuality } from './encode'
import { ConversionError } from './errors'
import type { CropRect, ImageEdit, Rotation } from './edit'
import { ROTATIONS, hasEdit } from './edit'
import { allocateOutputName } from './naming'
import type { ConvertOutcome } from './pipeline'
import { browserCodec, convertImage } from './pipeline'
import type { ResizeMode, ResizePlan } from './resize'
import { MAX_OUTPUT_DIMENSION, computeTargetSize, linkPair, validatePlan } from './resize'
import {
  collectZipEntries,
  compressionRatio,
  formatBytes,
  formatDimensions,
  formatRatio,
  zipFileName,
} from './stats'
import type { FailureReason } from './validate'
import { validateBatchCapacity, validateFile } from './validate'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'image-resize',
  name: '图片压缩/缩放',
  description: '批量缩放并重编码为 PNG/JPEG/WebP',
  category: 'convert',
  icon: 'Scaling',
  component: ImageResize,
  keywords: ['image', 'resize', 'compress', 'scale', 'png', 'jpeg', 'webp', 'crop', 'rotate', '图片', '缩放', '压缩', '裁剪', '旋转'],
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
  /** 本次成功所用的设置快照（批量参数 + 本行文件级编辑），变更后提示重新转换 */
  appliedSettings?: string
  /** 解锁非等比拉伸时的尺寸变化比（x = 宽变化，y = 高变化） */
  stretch?: { x: number; y: number } | null
  /** 文件级裁剪框（解码原图像素坐标）；undefined = 未裁剪 */
  crop?: CropRect
  /** 文件级旋转（90° 步进，顺时针） */
  rotation: Rotation
  blob?: Blob
  thumbnailUrl?: string
  /** 保留解码原图供重新转换（编辑段按最新参数重新应用） */
  source?: HTMLCanvasElement
}

const rows = ref<Row[]>([])
const outputFormat = ref<OutputFormat>('webp')
const mode = ref<ResizeMode>('longest-edge')
const edgeInput = ref<number>(2048)
const widthInput = ref<number>(1920)
const heightInput = ref<number>(1440)
const lockRatio = ref(true)
const percentInput = ref<number>(100)
const quality = ref(80)
const dragOver = ref(false)
const reconverting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const usedNames = new Set<string>()
let nextId = 1
let disposed = false

const successCount = computed(() => rows.value.filter((r) => r.status === 'success').length)

/** 比例锁联动的参考比例：批内首个成功解码文件的原始尺寸；无文件时为 4:3（与规格示例一致） */
const referenceDims = computed(() => {
  const first = rows.value.find((r) => r.status === 'success' && r.originalDims)
  return first?.originalDims ?? { w: 4, h: 3 }
})

function currentPlan(): ResizePlan {
  switch (mode.value) {
    case 'longest-edge':
      return { mode: 'longest-edge', edge: Number(edgeInput.value) || 0 }
    case 'dimensions':
      return {
        mode: 'dimensions',
        width: Number(widthInput.value) || 0,
        height: Number(heightInput.value) || 0,
        lock: lockRatio.value,
      }
    case 'percentage':
      return { mode: 'percentage', percent: Number(percentInput.value) || 0 }
  }
}

/** 目标尺寸非法（0/负/超 65500 单边）→ 错误态 */
const planInvalid = computed(() => !validatePlan(currentPlan()).ok)

/** 批量参数快照（输出格式 + 质量 + 缩放计划）。 */
function batchSettingsSnapshot(plan: ResizePlan, format: OutputFormat, q: number): string {
  return JSON.stringify({ f: format, q: needsQuality(format) ? q : null, p: plan })
}

/** 行级生效参数快照：批量参数 + 本行文件级编辑（裁剪/旋转）。 */
function rowSnapshot(row: Row, batch: string): string {
  return JSON.stringify({ b: batch, c: row.crop ?? null, r: row.rotation })
}

/** 存在「已成功但设置（批量或本行文件级）已变更」的行 → 显示重新转换提示（手动，不自动触发） */
const pendingReconvert = computed(() => {
  const batch = batchSettingsSnapshot(currentPlan(), outputFormat.value, quality.value)
  return rows.value.some((r) => r.status === 'success' && r.appliedSettings !== rowSnapshot(r, batch))
})

const REASON_KEYS: Record<FailureReason, string> = {
  'unsupported-format': 'imageResize.errUnsupported',
  'file-too-large': 'imageResize.errTooLarge',
  'too-many-files': 'imageResize.errTooMany',
  'svg-no-size': 'imageResize.errSvgNoSize',
  'decode-failed': 'imageResize.errDecode',
  'encode-failed': 'imageResize.errEncode',
  'invalid-target-size': 'imageResize.errTarget',
}

function reasonToMessage(reason: FailureReason): string {
  return t(REASON_KEYS[reason])
}

function makeRow(file: File, outputName: string): Row {
  // 行对象必须是响应式代理：转换完成后直接改字段，UI 才能触发更新（同 WebP 转换器）
  return reactive({
    id: nextId++,
    file: markRaw(file),
    originalName: file.name,
    outputName,
    status: 'converting' as const,
    originalSize: file.size,
    rotation: 0 as Rotation,
  }) as Row
}

function markFailed(row: Row, reason: FailureReason) {
  row.status = 'failed'
  row.error = reasonToMessage(reason)
}

function applySuccess(row: Row, outcome: ConvertOutcome, plan: ResizePlan, applied: string) {
  if (row.thumbnailUrl) URL.revokeObjectURL(row.thumbnailUrl)
  row.blob = outcome.blob
  row.thumbnailUrl = URL.createObjectURL(outcome.blob)
  row.convertedSize = outcome.blob.size
  row.ratio = compressionRatio(row.originalSize, outcome.blob.size)
  row.originalDims = { w: outcome.sourceWidth, h: outcome.sourceHeight }
  row.convertedDims = { w: outcome.width, h: outcome.height }
  row.firstFrame = outcome.firstFrame
  row.appliedSettings = applied
  // 解锁非等比拉伸 → 标注尺寸变化比
  if (plan.mode === 'dimensions' && !plan.lock) {
    const x = outcome.width / outcome.sourceWidth
    const y = outcome.height / outcome.sourceHeight
    row.stretch = Math.abs(x - y) > 0.001 ? { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) } : null
  } else {
    row.stretch = null
  }
  // 保留解码产物供重新转换（outcome.source 来自 convertImage，避免二次解码）
  if (outcome.source instanceof HTMLCanvasElement) row.source = markRaw(outcome.source)
  row.status = 'success'
  row.error = undefined
}

async function convertRow(row: Row) {
  row.status = 'converting'
  const plan = currentPlan()
  const format = outputFormat.value
  const edit: ImageEdit = { crop: row.crop, rotation: row.rotation }
  try {
    const outcome = await convertImage(browserCodec, row.file, plan, format, quality.value, edit)
    if (disposed) return
    applySuccess(row, outcome, plan, rowSnapshot(row, batchSettingsSnapshot(plan, format, quality.value)))
  } catch (e) {
    if (disposed) return
    const reason = e instanceof ConversionError ? e.reason : 'decode-failed'
    markFailed(row, reason)
  }
}

async function addFiles(files: ArrayLike<File>) {
  const plan = currentPlan()
  const planOk = validatePlan(plan).ok
  for (const file of Array.from(files)) {
    // 输出名在加入批次时确定并占用（含被拒绝/失败行）：与批内已有名称避重，移除时释放
    const outputName = allocateOutputName(file.name, OUTPUT_EXT[outputFormat.value], usedNames)
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
    // 目标尺寸非法 → 错误态，不入转换（已转换结果不受影响）
    if (!planOk) {
      markFailed(row, 'invalid-target-size')
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

/* 比例锁联动：编辑宽/高任一侧，另一侧按参考比例自动联动 */
function onWidthEdited() {
  if (!lockRatio.value) return
  const w = Number(widthInput.value)
  if (!Number.isFinite(w) || w <= 0) return
  heightInput.value = linkPair(referenceDims.value.w, referenceDims.value.h, 'width', w).height
}

function onHeightEdited() {
  if (!lockRatio.value) return
  const h = Number(heightInput.value)
  if (!Number.isFinite(h) || h <= 0) return
  widthInput.value = linkPair(referenceDims.value.w, referenceDims.value.h, 'height', h).width
}

/** 重新转换：仅重编码当前成功的文件，名称不变；失败文件不动。编辑段按本行最新裁剪/旋转重新应用。 */
async function reconvert() {
  const plan = currentPlan()
  if (!validatePlan(plan).ok) return
  const format = outputFormat.value
  const q = needsQuality(format) ? quality.value : null
  const batch = batchSettingsSnapshot(plan, format, quality.value)
  const targets = rows.value.filter(
    (r): r is Row & { source: HTMLCanvasElement; originalDims: { w: number; h: number } } =>
      r.status === 'success' && !!r.source && !!r.originalDims,
  )
  if (targets.length === 0) return
  reconverting.value = true
  for (const row of targets) {
    row.status = 'converting'
    const firstFrame = row.firstFrame ?? false
    try {
      // 编辑段（管线前段）：按本行最新的文件级参数，从解码原图重新应用
      const edit: ImageEdit = { crop: row.crop, rotation: row.rotation }
      let workSource: CanvasImageSource = row.source
      let dims = { width: row.originalDims.w, height: row.originalDims.h }
      if (hasEdit(edit)) {
        const edited = await browserCodec.edit!(workSource, dims.width, dims.height, edit)
        workSource = edited.source
        dims = { width: edited.width, height: edited.height }
      }
      const target = computeTargetSize(dims, plan)
      if (!target.ok) throw new ConversionError('invalid-target-size')
      const blob = await browserCodec.encode(workSource, target.width, target.height, format, q)
      if (disposed) return
      applySuccess(
        row,
        {
          blob,
          width: target.width,
          height: target.height,
          sourceWidth: row.originalDims.w,
          sourceHeight: row.originalDims.h,
          source: row.source,
          firstFrame,
        },
        plan,
        rowSnapshot(row, batch),
      )
    } catch (e) {
      if (disposed) return
      markFailed(row, e instanceof ConversionError ? e.reason : 'encode-failed')
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

/* ---------- 文件级编辑：裁剪（cropperjs 触达加载）与旋转 ---------- */

function setRotation(row: Row, rotation: Rotation): void {
  // 只改参数不动已展示结果（生成/转换非实时惯例）；重新转换提示按快照失配出现
  row.rotation = rotation
}

function clearCrop(row: Row): void {
  row.crop = undefined
}

/** 打开的裁剪器会话：目标行 + 原图 object URL（关闭时回收）。 */
const cropperState = ref<{ row: Row; url: string } | null>(null)
const cropperImg = ref<HTMLImageElement | null>(null)
const cropperReady = ref(false)
/** cropperjs v1 实例类型：从动态 import 的默认导出类取实例类型（触达加载，不静态 import 值）。 */
type CropperInstance = InstanceType<(typeof import('cropperjs'))['default']>
let cropperInstance: CropperInstance | null = null

/** 打开裁剪器：此时才 dynamic import cropperjs 与其 CSS（触达加载，13 票口径）。 */
async function openCropper(row: Row): Promise<void> {
  if (cropperState.value) return
  cropperState.value = { row, url: URL.createObjectURL(row.file) }
  cropperReady.value = false
  await nextTick()
  const [{ default: Cropper }] = await Promise.all([
    import('cropperjs'),
    import('cropperjs/dist/cropper.css'),
  ])
  // 会话可能在加载期间被关闭/组件卸载
  if (cropperState.value === null || disposed || !cropperImg.value) return
  const existing = cropperState.value.row.crop
  cropperInstance = new Cropper(cropperImg.value, {
    viewMode: 1,
    autoCropArea: 1,
    background: false,
    ready() {
      cropperReady.value = true
      // 重开编辑：恢复已有裁剪框（setData = 原图像素坐标的裁剪框数据，v1 API）
      if (existing) cropperInstance?.setData(existing)
    },
  })
}

/** 确认裁剪：裁剪参数挂到该文件（已裁剪徽标），不立即重转换（非实时）。 */
function confirmCrop(): void {
  const state = cropperState.value
  if (!state || !cropperInstance) return
  const data = cropperInstance.getData(true) // 取整后的原图像素坐标
  state.row.crop = { x: data.x, y: data.y, width: data.width, height: data.height }
  closeCropper()
}

function closeCropper(): void {
  cropperInstance?.destroy()
  cropperInstance = null
  cropperReady.value = false
  if (cropperState.value) {
    URL.revokeObjectURL(cropperState.value.url)
    cropperState.value = null
  }
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
  // zip 前条目构造（纯函数）：仅收集成功产物，名称为加入批次时确定的输出名
  const entries = collectZipEntries(rows.value)
  if (entries.length === 0) return
  const JSZip = (await import('jszip')).default as typeof JSZipType
  const zip = new JSZip()
  for (const entry of entries) zip.file(entry.name, entry.blob)
  triggerDownload(await zip.generateAsync({ type: 'blob' }), zipFileName())
}

onBeforeUnmount(() => {
  disposed = true
  for (const row of rows.value) revokeRow(row)
  closeCropper()
})
</script>

<style scoped>
.resize-tool {
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

.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.setting-label {
  font-size: 14px;
  color: var(--text-secondary);
  min-width: 64px;
}

.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.seg-btn {
  padding: 5px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.seg-btn + .seg-btn {
  border-left: 1px solid var(--border);
}

.seg-btn:hover {
  background: var(--bg-hover);
}

.seg-btn.active {
  background: var(--accent);
  color: #fff;
}

.mode-inputs {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.num-input {
  width: 84px;
  padding: 4px 8px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.num-input.wide {
  width: 110px;
}

.num-input:invalid {
  border-color: var(--error);
}

.unit {
  font-size: 13px;
  color: var(--text-tertiary);
}

.lock {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.lock input {
  accent-color: var(--accent);
}

.settings input[type='range'] {
  width: 160px;
  accent-color: var(--accent);
}

.quality-num {
  width: 64px;
}

.notice {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-quaternary);
}

.pipeline-hint {
  padding-bottom: var(--space-xs);
  border-bottom: 1px solid var(--border-subtle);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-md);
  flex-wrap: wrap;
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

.banner.error {
  color: var(--error);
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
  animation: resize-spin 1s linear infinite;
}

@keyframes resize-spin {
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

/* 管线前段（文件级）：裁剪 → 旋转 */
.row-stage {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.stage-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
}

.stage-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.stage-btn.danger:hover {
  color: var(--error);
}

.stage-label {
  font-size: 12px;
  color: var(--text-quaternary);
  margin-left: var(--space-xs);
}

.rot-group {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.rot-btn {
  padding: 3px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.rot-btn + .rot-btn {
  border-left: 1px solid var(--border);
}

.rot-btn:hover {
  background: var(--bg-hover);
}

.rot-btn.active {
  background: var(--accent);
  color: #fff;
}

/* 裁剪器弹层 */
.crop-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: var(--space-lg);
}

.crop-modal {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: min(860px, 100%);
  max-height: 90vh;
  padding: var(--space-lg);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.crop-title {
  margin: 0;
  font-size: 15px;
  font-weight: 510;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crop-container {
  min-height: 320px;
  max-height: 60vh;
  overflow: hidden;
}

.crop-container img {
  display: block;
  max-width: 100%;
}

.crop-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
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

