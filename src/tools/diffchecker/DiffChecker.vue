<template>
  <ToolLayout :tool="toolMeta">
    <div class="diff-tool">
      <!-- 10 票扩展：「文本 / JSON 结构化」双模式 -->
      <div class="controls" data-test="diff-mode">
        <div class="segmented" role="group" :aria-label="t('diffchecker.modeLabel')">
          <button
            class="seg-btn"
            :class="{ active: mode === 'text' }"
            data-test="diff-mode-text"
            @click="setMode('text')"
          >
            {{ t('diffchecker.modeText') }}
          </button>
          <button
            class="seg-btn"
            :class="{ active: mode === 'json' }"
            data-test="diff-mode-json"
            @click="setMode('json')"
          >
            {{ t('diffchecker.modeJson') }}
          </button>
        </div>
        <span v-if="mode === 'json'" class="hint">{{ t('diffchecker.jsonHint') }}</span>
      </div>

      <div class="inputs">
        <div class="panel">
          <div class="panel-head">
            <label class="label">{{ t('diffchecker.labelOld') }}</label>
            <button class="mini-btn" :aria-label="t('diffchecker.copy')" @click="copyLeft">
              <Copy :size="14" />
            </button>
          </div>
          <textarea
            v-model="leftInput"
            class="textarea"
            data-test="left-input"
            :placeholder="t('diffchecker.placeholder')"
            rows="8"
          />
        </div>
        <div class="panel">
          <div class="panel-head">
            <label class="label">{{ t('diffchecker.labelNew') }}</label>
            <button class="mini-btn" :aria-label="t('diffchecker.copy')" @click="copyRight">
              <Copy :size="14" />
            </button>
          </div>
          <textarea
            v-model="rightInput"
            class="textarea"
            data-test="right-input"
            :placeholder="t('diffchecker.placeholder')"
            rows="8"
          />
        </div>
      </div>

      <div class="actions">
        <button class="btn primary" data-test="compare-btn" @click="compare">
          <GitCompare :size="16" />
          {{ t('diffchecker.compare') }}
        </button>
        <button class="btn" data-test="swap-btn" @click="swap">
          <ArrowLeftRight :size="16" />
          {{ t('diffchecker.swap') }}
        </button>
        <label v-if="mode === 'text'" class="toggle" data-test="ignore-ws">
          <input v-model="ignoreWs" type="checkbox" />
          {{ t('diffchecker.ignoreWhitespace') }}
        </label>
        <button v-if="mode === 'text'" class="btn" data-test="view-btn" @click="toggleView">
          <Columns v-if="viewMode === 'unified'" :size="16" />
          <Rows2 v-else :size="16" />
          {{ viewMode === 'side' ? t('diffchecker.viewUnified') : t('diffchecker.viewSide') }}
        </button>
        <button class="btn" data-test="clear-btn" @click="clear">
          <Trash2 :size="16" />
          {{ t('diffchecker.clear') }}
        </button>
      </div>

      <!-- 文本模式结果（既有行为不变） -->
      <div v-if="mode === 'text'" class="result" data-test="result">
        <div v-if="!result || result.status === 'both-empty'" class="result-placeholder" data-test="result-empty">
          {{ t('diffchecker.empty') }}
        </div>
        <div v-else-if="result.status === 'same'" class="result-same" data-test="result-same">
          <CheckCircle :size="18" />
          {{ t('diffchecker.resultSame') }}
        </div>
        <div v-else class="diff-view">
          <div v-if="viewMode === 'side'" class="diff-table" data-test="diff-rows">
            <div v-for="(row, i) in result.rows" :key="i" class="diff-row" :data-kind="row.kind">
              <div class="cell line">
                <span v-if="row.leftLine != null" class="line-num" data-test="left-line">{{ row.leftLine }}</span>
              </div>
              <div class="cell text left" :class="cellClass(row, 'left')">
                <span v-if="row.kind === 'modified'" v-for="(s, j) in row.leftSegments" :key="j" :class="segClass(s.type)">{{ s.text }}</span>
                <template v-else>{{ row.leftText }}</template>
              </div>
              <div class="cell line">
                <span v-if="row.rightLine != null" class="line-num" data-test="right-line">{{ row.rightLine }}</span>
              </div>
              <div class="cell text right" :class="cellClass(row, 'right')">
                <span v-if="row.kind === 'modified'" v-for="(s, j) in row.rightSegments" :key="j" :class="segClass(s.type)">{{ s.text }}</span>
                <template v-else>{{ row.rightText }}</template>
              </div>
            </div>
          </div>

          <div v-else class="diff-unified" data-test="diff-rows">
            <div v-for="(row, i) in result.rows" :key="i">
              <template v-if="row.kind === 'modified'">
                <div class="u-row del" :data-kind="row.kind">
                  <span class="prefix">-</span>
                  <span class="line-num">{{ row.leftLine }}</span>
                  <span v-for="(s, j) in row.leftSegments" :key="j" :class="segClass(s.type)">{{ s.text }}</span>
                </div>
                <div class="u-row add" :data-kind="row.kind">
                  <span class="prefix">+</span>
                  <span class="line-num">{{ row.rightLine }}</span>
                  <span v-for="(s, j) in row.rightSegments" :key="j" :class="segClass(s.type)">{{ s.text }}</span>
                </div>
              </template>
              <div v-else-if="row.kind === 'deleted'" class="u-row del" :data-kind="row.kind">
                <span class="prefix">-</span>
                <span class="line-num">{{ row.leftLine }}</span>
                <span>{{ row.leftText }}</span>
              </div>
              <div v-else-if="row.kind === 'added'" class="u-row add" :data-kind="row.kind">
                <span class="prefix">+</span>
                <span class="line-num">{{ row.rightLine }}</span>
                <span>{{ row.rightText }}</span>
              </div>
              <div v-else class="u-row" :data-kind="row.kind">
                <span class="prefix"> </span>
                <span class="line-num">{{ row.leftLine }}</span>
                <span>{{ row.leftText }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- JSON 结构化模式结果（10 票扩展） -->
      <div v-else class="result" data-test="json-diff-result">
        <!-- 解析错误按侧定位，互不掩盖 -->
        <template v-if="jsonIssues.length > 0">
          <div
            v-for="issue in jsonIssues"
            :key="issue.side"
            class="json-error"
            :data-test="`json-diff-error-${issue.side}`"
          >
            <span class="json-error-side">
              {{ issue.side === 'left' ? t('diffchecker.labelOld') : t('diffchecker.labelNew') }}：
            </span>
            {{ t('diffchecker.jsonErrParse') }}
            <template v-if="issue.line !== undefined && issue.column !== undefined">
              {{ t('diffchecker.jsonLineColumn', { line: String(issue.line), column: String(issue.column) }) }}
            </template>
            <span class="json-error-message">{{ issue.message }}</span>
          </div>
        </template>

        <div v-else-if="!jsonResult || jsonResult.status === 'both-empty'" class="result-placeholder" data-test="result-empty">
          {{ t('diffchecker.empty') }}
        </div>
        <div v-else-if="jsonResult.status === 'same'" class="result-same" data-test="result-same">
          <CheckCircle :size="18" />
          {{ t('diffchecker.resultSame') }}
        </div>
        <div v-else class="json-changes" data-test="json-diff-changes">
          <p class="json-summary" data-test="json-diff-summary">
            {{
              t('diffchecker.jsonSummary', {
                added: String(jsonResult.addedCount),
                removed: String(jsonResult.removedCount),
                changed: String(jsonResult.changedCount),
              })
            }}
          </p>
          <div
            v-for="(change, index) in jsonResult.changes"
            :key="`${change.type}:${change.path}:${index}`"
            class="json-change"
            :data-type="change.type"
            data-test="json-diff-row"
          >
            <span class="op-badge" :class="change.type">
              {{ change.type === 'added' ? t('diffchecker.opAdded') : change.type === 'removed' ? t('diffchecker.opRemoved') : t('diffchecker.opChanged') }}
            </span>
            <code class="json-path">{{ change.path === '' ? t('diffchecker.jsonRoot') : change.path }}</code>
            <span class="json-preview">
              <template v-if="change.type === 'added'">
                <span class="value new">{{ formatValuePreview(change.newValue) }}</span>
              </template>
              <template v-else-if="change.type === 'removed'">
                <span class="value old">{{ formatValuePreview(change.oldValue) }}</span>
              </template>
              <template v-else>
                <span class="value old">{{ formatValuePreview(change.oldValue) }}</span>
                <span class="arrow">→</span>
                <span class="value new">{{ formatValuePreview(change.newValue) }}</span>
              </template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { GitCompare, ArrowLeftRight, Copy, Trash2, Columns, Rows2, CheckCircle } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import type { DiffResult, RowKind } from './diff'
import { computeDiff } from './diff'
import type { JsonDiffResult, JsonParseIssue } from './jsonDiff'
import { computeJsonStructuredDiff, formatValuePreview } from './jsonDiff'
import DiffChecker from './DiffChecker.vue'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'diffchecker',
  name: '文本差异对比',
  description: '对比两份文本，高亮差异',
  category: 'format',
  icon: 'GitCompare',
  component: DiffChecker,
  keywords: ['diff', '对比', '差异', '文本差异', 'compare', 'diffchecker']
}

const leftInput = ref('')
const rightInput = ref('')
const ignoreWs = ref(false)
const viewMode = ref<'side' | 'unified'>('side')
// 大文本结果用 shallowRef，避免深响应式开销
const result = shallowRef<DiffResult | null>(null)

// ---- 10 票扩展：JSON 结构化模式（双模式信息架构，文本模式行为不变） ----

type DiffMode = 'text' | 'json'

const mode = ref<DiffMode>('text')
const jsonResult = shallowRef<JsonDiffResult | null>(null)
const jsonIssues = shallowRef<JsonParseIssue[]>([])

/** JSON 模式实时防抖 300ms（转换/校验类平台约定，附录 §2）；文本模式保持显式按钮。 */
const JSON_DEBOUNCE_MS = 300
let jsonDebounceTimer: ReturnType<typeof setTimeout> | undefined

function runJsonCompare(): void {
  const outcome = computeJsonStructuredDiff(leftInput.value, rightInput.value)
  if (outcome.ok) {
    jsonResult.value = outcome.result
    jsonIssues.value = []
  } else {
    // 解析错误按侧呈现：结果保留上一次成功值（平台附录 §4）。
    jsonIssues.value = outcome.issues
  }
}

watch([leftInput, rightInput], () => {
  if (mode.value !== 'json') return
  clearTimeout(jsonDebounceTimer)
  jsonDebounceTimer = setTimeout(runJsonCompare, JSON_DEBOUNCE_MS)
})

function setMode(next: DiffMode): void {
  if (mode.value === next) return
  mode.value = next
  clearTimeout(jsonDebounceTimer)
  // 切入 JSON 模式时对现有输入立即对比（文本模式结果不动）。
  if (next === 'json') runJsonCompare()
}

function compare() {
  if (mode.value === 'json') {
    clearTimeout(jsonDebounceTimer)
    runJsonCompare()
    return
  }
  result.value = computeDiff({
    left: leftInput.value,
    right: rightInput.value,
    ignoreWhitespace: ignoreWs.value,
  })
}

function swap() {
  const tmp = leftInput.value
  leftInput.value = rightInput.value
  rightInput.value = tmp
  compare()
}

function toggleView() {
  viewMode.value = viewMode.value === 'side' ? 'unified' : 'side'
}

function copyLeft() {
  navigator.clipboard.writeText(leftInput.value)
}

function copyRight() {
  navigator.clipboard.writeText(rightInput.value)
}

function clear() {
  leftInput.value = ''
  rightInput.value = ''
  result.value = null
  jsonResult.value = null
  jsonIssues.value = []
  ignoreWs.value = false
  viewMode.value = 'side'
}

onBeforeUnmount(() => {
  clearTimeout(jsonDebounceTimer)
})

function cellClass(row: { kind: RowKind }, side: 'left' | 'right'): string {
  if (row.kind === 'deleted' && side === 'left') return 'del'
  if (row.kind === 'added' && side === 'right') return 'add'
  if (row.kind === 'modified') return 'mod'
  return ''
}

function segClass(type: 'unchanged' | 'changed'): string {
  return type === 'changed' ? 'seg-changed' : 'seg-unchanged'
}
</script>

<style scoped>
.diff-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.controls {
  display: flex;
  align-items: center;
  gap: var(--space-md);
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

.json-error {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
  color: var(--error);
  font-size: 13px;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--error);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}

.json-error-side {
  font-weight: 510;
}

.json-error-message {
  color: var(--text-quaternary);
  font-size: 12px;
  font-family: var(--font-mono);
}

.json-changes {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.json-summary {
  margin: 0 0 var(--space-xs);
  font-size: 12px;
  color: var(--text-secondary);
}

.json-change {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 13px;
}

.op-badge {
  flex: none;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
}

.op-badge.added {
  color: var(--success);
  border-color: var(--success);
}

.op-badge.removed {
  color: var(--error);
  border-color: var(--error);
}

.op-badge.changed {
  color: #7170ff;
  border-color: #7170ff;
}

.json-path {
  color: var(--text-primary);
  word-break: break-all;
}

.json-preview {
  color: var(--text-secondary);
  word-break: break-all;
}

.json-preview .value.old {
  color: var(--error);
}

.json-preview .value.new {
  color: var(--success);
}

.json-preview .arrow {
  color: var(--text-quaternary);
}

.inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.mini-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.mini-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
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
  align-items: center;
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

.result {
  min-height: 160px;
}

.result-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-quaternary);
  font-size: 13px;
}

.result-same {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--success);
  font-weight: 510;
  background: var(--bg-card);
}

.diff-view {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* 左右分栏 */
.diff-table {
  display: flex;
  flex-direction: column;
}

.diff-row {
  display: grid;
  grid-template-columns: 44px 1fr 44px 1fr;
}

.cell {
  padding: 2px 8px;
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: pre;
  min-height: 22px;
}

.cell.line {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  color: var(--text-quaternary);
  border-right: 1px solid var(--border-subtle);
  user-select: none;
}

.cell.text {
  color: var(--text-primary);
}

.cell.text.right {
  border-left: 1px solid var(--border-subtle);
}

.diff-row[data-kind="added"] .cell.text.right {
  background: rgba(16, 185, 129, 0.14);
  color: var(--text-primary);
}

.diff-row[data-kind="deleted"] .cell.text.left {
  background: rgba(248, 113, 113, 0.14);
  color: var(--text-primary);
}

.diff-row[data-kind="modified"] .cell.text {
  background: rgba(113, 112, 255, 0.08);
}

.seg-changed {
  background: rgba(248, 113, 113, 0.35);
  color: var(--text-primary);
  border-radius: 2px;
}

.diff-row[data-kind="modified"] .cell.text.right .seg-changed {
  background: rgba(16, 185, 129, 0.35);
}

/* 统一视图 */
.diff-unified {
  display: flex;
  flex-direction: column;
  font-family: var(--font-mono);
  font-size: 13px;
}

.u-row {
  display: flex;
  gap: 8px;
  padding: 2px 8px;
  white-space: pre;
  color: var(--text-primary);
}

.u-row .prefix {
  width: 14px;
  text-align: right;
  user-select: none;
  color: var(--text-quaternary);
}

.u-row .line-num {
  width: 44px;
  text-align: right;
  color: var(--text-quaternary);
  user-select: none;
  border-right: 1px solid var(--border-subtle);
  padding-right: 6px;
}

.u-row.add {
  background: rgba(16, 185, 129, 0.14);
}

.u-row.del {
  background: rgba(248, 113, 113, 0.14);
}

.u-row .seg-changed {
  background: rgba(248, 113, 113, 0.35);
  border-radius: 2px;
}

.u-row.add .seg-changed {
  background: rgba(16, 185, 129, 0.35);
}

@media (max-width: 768px) {
  .inputs {
    grid-template-columns: 1fr;
  }
}
</style>
