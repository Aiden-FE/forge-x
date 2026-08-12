<template>
  <ToolLayout :tool="toolMeta">
    <div class="diff-tool">
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
        <label class="toggle" data-test="ignore-ws">
          <input v-model="ignoreWs" type="checkbox" />
          {{ t('diffchecker.ignoreWhitespace') }}
        </label>
        <button class="btn" data-test="view-btn" @click="toggleView">
          <Columns v-if="viewMode === 'unified'" :size="16" />
          <Rows2 v-else :size="16" />
          {{ viewMode === 'side' ? t('diffchecker.viewUnified') : t('diffchecker.viewSide') }}
        </button>
        <button class="btn" data-test="clear-btn" @click="clear">
          <Trash2 :size="16" />
          {{ t('diffchecker.clear') }}
        </button>
      </div>

      <div class="result" data-test="result">
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
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { GitCompare, ArrowLeftRight, Copy, Trash2, Columns, Rows2, CheckCircle } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import type { DiffResult, RowKind } from './diff'
import { computeDiff } from './diff'
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

function compare() {
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
  ignoreWs.value = false
  viewMode.value = 'side'
}

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
