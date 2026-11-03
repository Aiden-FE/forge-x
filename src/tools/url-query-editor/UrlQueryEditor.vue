<template>
  <ToolLayout :tool="toolMeta">
    <div class="uqe-tool">
      <!-- 输入：自动识别 URL 模式 / 参数串模式；1 MiB 粘贴上限 -->
      <section class="panel">
        <label class="label" for="uqe-input">{{ t('urlQueryEditor.inputLabel') }}</label>
        <textarea
          id="uqe-input"
          v-model="input"
          class="textarea"
          data-test="uqe-input"
          :placeholder="t('urlQueryEditor.inputPlaceholder')"
          rows="4"
          @input="onInput"
        />
        <p v-if="truncated" class="warning" data-test="uqe-limit-warning">
          {{ t('urlQueryEditor.limitWarning') }}
        </p>
      </section>

      <!-- URL 模式：protocol/host/path 与 hash 只读展示（只编辑 query） -->
      <section v-if="isUrlMode" class="panel">
        <div class="readonly-grid">
          <label class="readonly-item">
            <span class="label">{{ t('urlQueryEditor.urlPart') }}</span>
            <input :value="headDisplay" class="input" data-test="uqe-url-head" readonly />
          </label>
          <label v-if="tailDisplay !== ''" class="readonly-item">
            <span class="label">{{ t('urlQueryEditor.fragment') }}</span>
            <input :value="tailDisplay" class="input" data-test="uqe-url-tail" readonly />
          </label>
        </div>
      </section>

      <!-- 参数实例表：一行 = 一次出现，同名键不合并，行序 = 输出顺序 -->
      <section class="panel">
        <div class="table-head">
          <span class="label">{{ t('urlQueryEditor.paramsLabel') }}</span>
          <label class="sort-toggle">
            <input v-model="sortOn" type="checkbox" data-test="uqe-sort" />
            {{ t('urlQueryEditor.sortToggle') }}
          </label>
          <button type="button" class="btn small" data-test="uqe-add-row" @click="addRow">
            <Plus :size="14" />
            {{ t('urlQueryEditor.addRow') }}
          </button>
        </div>
        <p v-if="rows.length === 0" class="empty" data-test="uqe-empty">
          {{ t('urlQueryEditor.empty') }}
        </p>
        <div v-else class="table-wrap">
          <table class="table" data-test="uqe-table">
            <thead>
              <tr>
                <th class="col-idx">#</th>
                <th>{{ t('urlQueryEditor.keyColumn') }}</th>
                <th>{{ t('urlQueryEditor.valueColumn') }}</th>
                <th class="col-actions">{{ t('urlQueryEditor.actionsColumn') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in viewRows" :key="row.uid" data-test="uqe-row">
                <td class="col-idx">{{ i + 1 }}</td>
                <td>
                  <input
                    :value="row.key"
                    class="input"
                    :class="{ invalid: row.keyError }"
                    :data-test="`uqe-key-${i}`"
                    @input="editKey(row, ($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td>
                  <input
                    :value="row.value"
                    class="input"
                    :class="{ invalid: row.valueError }"
                    :data-test="`uqe-value-${i}`"
                    :placeholder="row.rawValue === null ? t('urlQueryEditor.keyOnlyHint') : undefined"
                    @input="editValue(row, ($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td class="col-actions">
                  <button
                    type="button"
                    class="icon-btn"
                    :disabled="i === 0"
                    :data-test="`uqe-up-${i}`"
                    :title="t('urlQueryEditor.moveUp')"
                    @click="moveRow(row, -1)"
                  >
                    <ChevronUp :size="14" />
                  </button>
                  <button
                    type="button"
                    class="icon-btn"
                    :disabled="i === viewRows.length - 1"
                    :data-test="`uqe-down-${i}`"
                    :title="t('urlQueryEditor.moveDown')"
                    @click="moveRow(row, 1)"
                  >
                    <ChevronDown :size="14" />
                  </button>
                  <button
                    type="button"
                    class="icon-btn danger"
                    :data-test="`uqe-delete-${i}`"
                    :title="t('urlQueryEditor.deleteRow')"
                    @click="deleteRow(row)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="errorRows.length > 0" class="error" data-test="uqe-row-errors">
          {{ rowErrorsText }}
        </p>
      </section>

      <div class="actions">
        <button class="btn" data-test="uqe-copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('urlQueryEditor.copied') : t('urlQueryEditor.copy') }}
        </button>
        <button class="btn" data-test="uqe-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('urlQueryEditor.clear') }}
        </button>
      </div>

      <!-- 输出：实时防抖（转换类）+ 原样保真 -->
      <section class="panel">
        <label class="label" for="uqe-output">{{ t('urlQueryEditor.output') }}</label>
        <textarea
          id="uqe-output"
          v-model="output"
          class="textarea"
          data-test="uqe-output"
          readonly
          rows="4"
        />
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import UrlQueryEditor from './UrlQueryEditor.vue'
import { buildOutput, nextRowUid, parseQueryInput } from './queryEngine'
import type { DocMeta, ParamRow } from './queryEngine'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'url-query-editor',
  name: 'URL 查询编辑器',
  description: '以表格编辑 URL 查询参数，未编辑参数按原始字节保真输出',
  category: 'encode',
  icon: 'Link2',
  component: UrlQueryEditor,
  keywords: ['url', 'query', '查询参数', '参数编辑', 'querystring', '查询字符串'],
}

// ---- 1 MiB 输入上限（平台惯例；UTF-8 字节，码点边界截断） ----

const MAX_INPUT_BYTES = 1024 * 1024

function utf8ByteLen(cp: number): number {
  if (cp <= 0x7f) return 1
  if (cp <= 0x7ff) return 2
  if (cp <= 0xffff) return 3
  return 4
}

function enforceInputLimit(text: string): { text: string; truncated: boolean } {
  if (text.length * 3 <= MAX_INPUT_BYTES) return { text, truncated: false }
  let bytes = 0
  let end = 0
  for (const ch of text) {
    const b = utf8ByteLen(ch.codePointAt(0)!)
    if (bytes + b > MAX_INPUT_BYTES) return { text: text.slice(0, end), truncated: true }
    bytes += b
    end += ch.length
  }
  return { text, truncated: false }
}

// ---- 状态 ----

const input = ref('')
const truncated = ref(false)
const docMeta = ref<DocMeta>({ mode: 'query', head: '', tail: '' })
const rows = ref<ParamRow[]>([])
const sortOn = ref(false) // 保真是默认态：排序开关默认关
const output = ref('')

const isUrlMode = computed(() => docMeta.value.mode === 'url')
/** URL 骨架只读展示：query 前（含尾随 ?）与 fragment。 */
const headDisplay = computed(() =>
  docMeta.value.mode === 'url' ? docMeta.value.head.replace(/\?$/, '') : '',
)
const tailDisplay = computed(() => docMeta.value.tail)

/** 排序开启按 key 字典序（稳定），关闭恢复原始行序；表格与输出共用同一视图。 */
const viewRows = computed(() => {
  if (!sortOn.value) return rows.value
  return [...rows.value].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
})

const errorRows = computed(() =>
  rows.value
    .map((row, index) => ({ row, line: index + 1 }))
    .filter(({ row }) => row.keyError || row.valueError),
)

const rowErrorsText = computed(() =>
  t('urlQueryEditor.rowErrors', { rows: errorRows.value.map((e) => String(e.line)).join(', ') }),
)

// ---- 300ms 实时防抖（转换类：输入解析与表格编辑共用节奏） ----

const DEBOUNCE_MS = 300

let timer: number | undefined
let copiedTimer: number | undefined

function scheduleRebuild(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    output.value = buildOutput(docMeta.value, rows.value, sortOn.value)
  }, DEBOUNCE_MS)
}

function onInput(): void {
  const res = enforceInputLimit(input.value)
  if (res.truncated) {
    input.value = res.text
    truncated.value = true
  } else {
    truncated.value = false
  }
  // 输入是 source of truth：重新解析覆盖表格（未落盘的表格编辑被新输入取代）
  reparse()
  scheduleRebuild()
}

function reparse(): void {
  const parsed = parseQueryInput(input.value)
  docMeta.value = { mode: parsed.mode, head: parsed.head, tail: parsed.tail }
  rows.value = parsed.rows
}

// 排序开关即时反映到输出（表格视图经 viewRows 即时反映）
watch(sortOn, scheduleRebuild)

// ---- 表格编辑（行序 = 输出顺序；未编辑行保持原始字节） ----

function editKey(row: ParamRow, value: string): void {
  row.key = value
  row.keyEdited = true
  row.keyError = false
  scheduleRebuild()
}

function editValue(row: ParamRow, value: string): void {
  row.value = value
  row.valueEdited = true
  row.valueError = false
  if (row.rawValue === null) row.rawValue = '' // key-only 行填值 → 输出带 =
  scheduleRebuild()
}

function addRow(): void {
  const row: ParamRow = {
    uid: nextRowUid(),
    rawKey: '',
    rawValue: '',
    key: '',
    value: '',
    keyEdited: true,
    valueEdited: true,
    keyError: false,
    valueError: false,
  }
  rows.value.push(row)
  scheduleRebuild()
}

function deleteRow(row: ParamRow): void {
  rows.value = rows.value.filter((r) => r.uid !== row.uid)
  scheduleRebuild()
}

function moveRow(row: ParamRow, direction: -1 | 1): void {
  const index = rows.value.findIndex((r) => r.uid === row.uid)
  const target = index + direction
  if (index === -1 || target < 0 || target >= rows.value.length) return
  const [moved] = rows.value.splice(index, 1)
  rows.value.splice(target, 0, moved!)
  scheduleRebuild()
}

onUnmounted(() => {
  if (timer !== undefined) window.clearTimeout(timer)
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
})

// ---- 输出动作 ----

const copied = ref(false)

async function copy(): Promise<void> {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  copied.value = true
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copied.value = false
    copiedTimer = undefined
  }, 1500)
}

function clear(): void {
  input.value = ''
  truncated.value = false
  docMeta.value = { mode: 'query', head: '', tail: '' }
  rows.value = []
  output.value = ''
}
</script>

<style scoped>
.uqe-tool {
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

.input {
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: var(--space-xs) var(--space-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.input:focus {
  border-color: var(--border-focus);
}

.input:read-only {
  color: var(--text-tertiary);
}

.input.invalid {
  border-color: var(--error);
}

.readonly-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}

.readonly-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.table-head {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.sort-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.table-head .btn.small {
  margin-left: auto;
}

.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  margin: 0;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th,
.table td {
  text-align: left;
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--border);
}

.table th {
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 510;
}

.col-idx {
  width: 36px;
  color: var(--text-quaternary);
  font-family: var(--font-mono);
}

.col-actions {
  width: 120px;
  white-space: nowrap;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xs);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.icon-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.icon-btn.danger:hover:not(:disabled) {
  color: var(--error);
}

.warning {
  color: var(--error);
  font-size: 12px;
  margin: 0;
}

.error {
  color: var(--error);
  font-size: 13px;
  margin: 0;
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

.btn.small {
  padding: var(--space-xs) var(--space-sm);
  font-size: 12px;
}
</style>
