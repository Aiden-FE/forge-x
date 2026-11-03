<template>
  <ToolLayout :tool="toolMeta">
    <div class="tdg-tool">
      <!-- 常驻声明：结构真实 + 非真实数据（规格 §1 缓解三件套①） -->
      <p class="notice" data-test="tdg-notice">{{ t('testDataGenerator.notice') }}</p>

      <section class="panel">
        <!-- 数据语言：与界面语言独立（CONTEXT.md 数据语言） -->
        <div class="control">
          <span class="label">{{ t('testDataGenerator.dataLocale') }}</span>
          <div class="segment" role="group" data-test="tdg-locale-group">
            <button
              type="button"
              class="segment-btn"
              :class="{ active: dataLocale === 'zh' }"
              data-test="tdg-locale-zh"
              @click="dataLocale = 'zh'"
            >
              中文
            </button>
            <button
              type="button"
              class="segment-btn"
              :class="{ active: dataLocale === 'en' }"
              data-test="tdg-locale-en"
              @click="dataLocale = 'en'"
            >
              English
            </button>
          </div>
        </div>

        <!-- 字段目录：规格 11 项 + Lorem 段落（并入本工具） -->
        <div class="control">
          <span class="label">{{ t('testDataGenerator.fieldsLabel') }}</span>
          <div class="field-grid" data-test="tdg-fields">
            <label v-for="f in FIELDS" :key="f.id" class="field-option">
              <input v-model="checked[f.id]" type="checkbox" :data-test="`tdg-field-${f.id}`" />
              {{ t(`testDataGenerator.fields.${f.id}`) }}
            </label>
          </div>
        </div>

        <!-- 可选范围：日期时间 / 整数 -->
        <div v-if="checked.datetime" class="range-row">
          <label class="range-item">
            <span class="label">{{ t('testDataGenerator.datetimeFrom') }}</span>
            <input v-model="datetimeFrom" type="date" class="input" data-test="tdg-dt-from" />
          </label>
          <label class="range-item">
            <span class="label">{{ t('testDataGenerator.datetimeTo') }}</span>
            <input v-model="datetimeTo" type="date" class="input" data-test="tdg-dt-to" />
          </label>
        </div>
        <div v-if="checked.integer" class="range-row">
          <label class="range-item">
            <span class="label">{{ t('testDataGenerator.integerMin') }}</span>
            <input v-model="integerMinRaw" type="number" class="input" data-test="tdg-int-min" />
          </label>
          <label class="range-item">
            <span class="label">{{ t('testDataGenerator.integerMax') }}</span>
            <input v-model="integerMaxRaw" type="number" class="input" data-test="tdg-int-max" />
          </label>
        </div>

        <div class="controls-row">
          <label class="range-item">
            <span class="label" for="tdg-count">{{ t('testDataGenerator.countLabel') }}</span>
            <input
              id="tdg-count"
              v-model="countRaw"
              type="number"
              class="input count-input"
              :min="MIN_COUNT"
              :max="MAX_COUNT"
              data-test="tdg-count"
            />
          </label>
          <button
            type="button"
            class="btn primary"
            data-test="tdg-generate"
            :disabled="selectedFields.length === 0 || generating"
            @click="generate"
          >
            <Sparkles :size="16" />
            {{ t('testDataGenerator.generate') }}
          </button>
        </div>
        <p v-if="error" class="error" data-test="tdg-error">{{ error }}</p>
        <p v-if="selectedFields.length === 0" class="hint" data-test="tdg-no-fields">
          {{ t('testDataGenerator.noFields') }}
        </p>
      </section>

      <template v-if="generatedFields.length > 0">
        <div class="actions">
          <button type="button" class="btn" data-test="tdg-export-json" @click="exportJson">
            <Download :size="16" />
            {{ t('testDataGenerator.exportJson') }}
          </button>
          <button type="button" class="btn" data-test="tdg-export-csv" @click="exportCsv">
            <Download :size="16" />
            {{ t('testDataGenerator.exportCsv') }}
          </button>
          <button type="button" class="btn" data-test="tdg-clear" @click="clearResults">
            <Trash2 :size="16" />
            {{ t('testDataGenerator.clear') }}
          </button>
        </div>

        <section class="panel">
          <span class="label" data-test="tdg-rows-note">{{ rowsNote }}</span>
          <div class="table-wrap" data-test="tdg-table-wrap">
            <table class="table" data-test="tdg-table">
              <thead>
                <tr>
                  <th v-for="col in columns" :key="col">{{ col }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in previewRows" :key="i" data-test="tdg-row">
                  <td v-for="id in generatedFields" :key="id">{{ row[id] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Download, Sparkles, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import TestDataGenerator from './TestDataGenerator.vue'
import {
  DEFAULT_DATA_LOCALE,
  FIELDS,
  MAX_COUNT,
  MIN_COUNT,
  generateRows,
  rowsToCsv,
  toRecords,
  validateCount,
} from './generator'
import type { DataLocale, FieldId, GenerateError } from './generator'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'test-data-generator',
  name: '测试数据生成器',
  description: '批量生成结构真实的软件测试假数据，纯本地，仅供测试',
  category: 'generate',
  icon: 'FlaskConical',
  component: TestDataGenerator,
  keywords: ['测试数据', '假数据', 'mock', 'faker', '占位数据', 'test data', 'mock data', 'lorem'],
}

const dataLocale = ref<DataLocale>(DEFAULT_DATA_LOCALE)
const checked = reactive(
  Object.fromEntries(FIELDS.map((f) => [f.id, false])) as Record<FieldId, boolean>,
)
const datetimeFrom = ref('')
const datetimeTo = ref('')
const integerMinRaw = ref('')
const integerMaxRaw = ref('')
const countRaw = ref('10')

const selectedFields = computed<FieldId[]>(() => FIELDS.filter((f) => checked[f.id]).map((f) => f.id))

const generating = ref(false)
const error = ref('')
const rows = ref<Record<FieldId, string>[]>([])
const generatedFields = ref<FieldId[]>([])

/** 列名 = 字段名（当前界面语言标签）。 */
const columns = computed(() => generatedFields.value.map((id) => t(`testDataGenerator.fields.${id}`)))

/** 表格为预览：最多渲染前 100 行，导出始终含全部（规格 §4「结果表格预览」）。 */
const PREVIEW_LIMIT = 100
const previewRows = computed(() => rows.value.slice(0, PREVIEW_LIMIT))

const rowsNote = computed(() =>
  rows.value.length > PREVIEW_LIMIT
    ? t('testDataGenerator.rowsNote', { shown: String(PREVIEW_LIMIT), total: String(rows.value.length) })
    : t('testDataGenerator.rowsCount', { total: String(rows.value.length) }),
)

function errorText(code: GenerateError): string {
  return t(`testDataGenerator.errors.${code}`)
}

async function generate(): Promise<void> {
  const count = validateCount(Number(countRaw.value))
  if (count === null) {
    error.value = errorText('invalid-count')
    return
  }
  error.value = ''
  generating.value = true
  try {
    const outcome = await generateRows({
      fields: selectedFields.value,
      count,
      locale: dataLocale.value,
      datetimeFrom: checked.datetime ? datetimeFrom.value : undefined,
      datetimeTo: checked.datetime ? datetimeTo.value : undefined,
      integerMin: checked.integer && integerMinRaw.value.trim() !== '' ? Number(integerMinRaw.value) : undefined,
      integerMax: checked.integer && integerMaxRaw.value.trim() !== '' ? Number(integerMaxRaw.value) : undefined,
    })
    if (outcome.ok) {
      rows.value = outcome.rows
      generatedFields.value = [...selectedFields.value]
    } else {
      error.value = errorText(outcome.error)
    }
  } finally {
    generating.value = false
  }
}

// ---- 导出：输出命名 basename + 扩展名（无文件输入，固定基名） ----

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportJson(): void {
  if (rows.value.length === 0) return
  const json = JSON.stringify(toRecords(generatedFields.value, columns.value, rows.value), null, 2)
  triggerDownload(new Blob([json], { type: 'application/json;charset=utf-8' }), 'test-data.json')
}

async function exportCsv(): Promise<void> {
  if (rows.value.length === 0) return
  const csv = await rowsToCsv(generatedFields.value, columns.value, rows.value)
  triggerDownload(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), 'test-data.csv')
}

function clearResults(): void {
  rows.value = []
  generatedFields.value = []
  error.value = ''
}
</script>

<style scoped>
.tdg-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.notice {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.control {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.segment {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
}

.segment-btn {
  padding: var(--space-sm) var(--space-lg);
  background: var(--bg-card);
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.segment-btn + .segment-btn {
  border-left: 1px solid var(--border);
}

.segment-btn.active {
  background: var(--accent);
  color: white;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-sm);
}

.field-option {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.range-row {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.range-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-xs) var(--space-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.input:focus {
  border-color: var(--border-focus);
}

.count-input {
  width: 110px;
  font-family: var(--font-mono);
}

.controls-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
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

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.table-wrap {
  max-height: 480px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.table th,
.table td {
  text-align: left;
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table th {
  position: sticky;
  top: 0;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 510;
  z-index: 1;
}
</style>
