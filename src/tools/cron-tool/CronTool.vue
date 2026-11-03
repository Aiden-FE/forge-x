<template>
  <ToolLayout :tool="toolMeta">
    <div class="cron-tool">
      <!-- 解析区：表达式 → 描述 / 字段速览 / 执行预览 -->
      <section class="panel">
        <label class="label" for="cron-expr">{{ t('cronTool.inputLabel') }}</label>
        <input
          id="cron-expr"
          v-model="expression"
          class="input mono"
          data-test="expr-input"
          :placeholder="t('cronTool.inputPlaceholder')"
          spellcheck="false"
          autocomplete="off"
          @input="onExpressionInput"
        />

        <!-- 周字段口径常驻警示 -->
        <p class="dow-warning" data-test="dow-warning">{{ t('cronTool.dowWarning') }}</p>

        <!-- 整串错误（字段数不符 / 年份字段 / 空输入定位不到字段） -->
        <p v-if="wholeError" class="error" data-test="parse-error">{{ wholeError }}</p>

        <!-- 自然语言描述（cronstrue，语言跟随应用） -->
        <div v-if="description !== null" class="description" data-test="description">
          <span class="desc-label">{{ t('cronTool.descriptionTitle') }}</span>
          <span class="desc-text">{{ description || '—' }}</span>
        </div>

        <!-- 字段速览：逐字段高亮 + 白话解释；字段级错误只红该处，其余照常 -->
        <div v-if="overviewFields.length > 0" class="overview" data-test="overview">
          <h2 class="section-title">{{ t('cronTool.fieldsTitle') }}</h2>
          <div class="overview-rows">
            <div
              v-for="f in overviewFields"
              :key="f.name"
              class="overview-row"
              :class="{ invalid: f.error !== '' }"
              :data-test="`field-row-${f.name}`"
            >
              <span class="field-tag">{{ fieldLabel(f.name) }}</span>
              <code class="field-raw mono" :data-test="`field-raw-${f.name}`">{{ f.raw }}</code>
              <span class="field-explain" :data-test="`field-explain-${f.name}`">{{ f.explain }}</span>
              <span v-if="f.error" class="error field-error" :data-test="`field-error-${f.name}`">{{ f.error }}</span>
            </div>
          </div>
        </div>

        <!-- 执行预览：下次 5 次触发时间 + IANA 时区切换 -->
        <div class="preview-block">
          <h2 class="section-title">{{ t('cronTool.previewTitle') }}</h2>
          <p class="preview-sub">{{ t('cronTool.previewNext') }}</p>
          <div class="tz-row">
            <span class="label">{{ t('cronTool.tzLabel') }}</span>
            <input
              v-model="tzFilter"
              class="input tz-filter"
              data-test="tz-filter"
              :placeholder="t('cronTool.tzFilterPlaceholder')"
              spellcheck="false"
              autocomplete="off"
            />
            <select v-model="tz" class="input tz-select" data-test="tz-select" :aria-label="t('cronTool.tzLabel')">
              <option value="">{{ t('cronTool.tzLocal') }}</option>
              <option v-for="zone in filteredTimeZones" :key="zone" :value="zone">{{ zone }}</option>
            </select>
          </div>
          <ol v-if="previewList !== null" class="runs" data-test="preview-runs">
            <li v-for="(run, i) in previewList" :key="i" class="run mono" :data-test="`preview-run-${i}`">
              {{ run }}
            </li>
          </ol>
          <p v-else-if="expressionValid" class="error" data-test="preview-error">{{ t('cronTool.previewEmpty') }}</p>
        </div>
      </section>

      <!-- 生成器：构建器 + 模板库（单向产出，不做表达式反填） -->
      <section class="panel">
        <h2 class="section-title">{{ t('cronTool.builderTitle') }}</h2>
        <p class="hint">{{ t('cronTool.builderHint') }}</p>

        <div class="presets">
          <span class="label">{{ t('cronTool.presetsTitle') }}</span>
          <button
            v-for="preset in BUILDER_PRESETS"
            :key="preset.id"
            type="button"
            class="chip-btn"
            :data-test="`preset-${preset.id}`"
            @click="applyPreset(preset)"
          >
            {{ t(`cronTool.preset${capitalize(preset.id)}`) }}
          </button>
        </div>

        <div class="builder-fields">
          <div v-for="f in BUILDER_FIELDS" :key="f" class="builder-field">
            <div class="builder-head">
              <span class="field-tag">{{ fieldLabel(f) }}</span>
              <select
                v-model="builderFields[f].mode"
                class="input mode-select"
                :data-test="`mode-${f}`"
                :aria-label="fieldLabel(f)"
              >
                <option value="any">{{ t('cronTool.modeAny') }}</option>
                <option value="enum">{{ t('cronTool.modeEnum') }}</option>
                <option value="range">{{ t('cronTool.modeRange') }}</option>
                <option value="step">{{ t('cronTool.modeStep') }}</option>
              </select>
            </div>
            <div v-if="builderFields[f].mode === 'enum'" class="enum-grid" :data-test="`enum-${f}`">
              <label
                v-for="v in enumCandidates(f)"
                :key="v"
                class="enum-chip"
                :class="{ picked: builderFields[f].enumValues.includes(v) }"
              >
                <input
                  v-model="builderFields[f].enumValues"
                  type="checkbox"
                  :value="v"
                  :data-test="`enum-${f}-${v}`"
                />
                {{ v }}
              </label>
            </div>
            <div v-else-if="builderFields[f].mode === 'range'" class="range-row">
              <input
                v-model.number="builderFields[f].rangeFrom"
                class="input num mono"
                type="number"
                :min="FIELD_RANGES[f].min"
                :max="FIELD_RANGES[f].max"
                :data-test="`range-from-${f}`"
                :aria-label="t('cronTool.modeRange') + ' min'"
              />
              <span class="range-sep">–</span>
              <input
                v-model.number="builderFields[f].rangeTo"
                class="input num mono"
                type="number"
                :min="FIELD_RANGES[f].min"
                :max="FIELD_RANGES[f].max"
                :data-test="`range-to-${f}`"
                :aria-label="t('cronTool.modeRange') + ' max'"
              />
            </div>
            <div v-else-if="builderFields[f].mode === 'step'" class="range-row">
              <input
                v-model.number="builderFields[f].step"
                class="input num mono"
                type="number"
                min="1"
                :data-test="`step-${f}`"
                :aria-label="t('cronTool.modeStep')"
              />
            </div>
          </div>
        </div>

        <div class="builder-output">
          <span class="label">{{ t('cronTool.builderExprLabel') }}</span>
          <code class="builder-expr mono" data-test="builder-expr">{{ debouncedBuilderExpr }}</code>
          <button type="button" class="btn" data-test="builder-copy" @click="copyBuilderExpr">
            {{ builderCopied ? t('cronTool.copied') : t('cronTool.copy') }}
          </button>
          <button type="button" class="btn" data-test="builder-fill" @click="fillParser">
            {{ t('cronTool.builderFill') }}
          </button>
        </div>

        <div class="templates">
          <span class="label">{{ t('cronTool.templatesTitle') }}</span>
          <button
            v-for="tmpl in CRON_TEMPLATES"
            :key="tmpl.id"
            type="button"
            class="chip-btn"
            :data-test="`template-${tmpl.id}`"
            :title="tmpl.expr"
            @click="applyTemplate(tmpl)"
          >
            {{ t(`cronTool.tmpl${capitalize(tmpl.id)}`) }}
          </button>
        </div>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import CronTool from './CronTool.vue'
import {
  BUILDER_FIELDS,
  BUILDER_PRESETS,
  CRON_TEMPLATES,
  FIELD_RANGES,
  buildExpression,
  defaultBuilderField,
  describeCron,
  explainField,
  localTimeZone,
  parseCron,
  previewRuns,
} from './cron'
import type {
  AppLocale,
  BuilderFields,
  BuilderPreset,
  CronError,
  CronFieldName,
  CronParse,
  CronTemplate,
  CronField,
  Translate,
} from './cron'

const { t, locale } = useI18n()

const toolMeta: ToolMeta = {
  id: 'cron-tool',
  name: 'Cron 解析/生成',
  description: '解析与构建 cron 定时表达式，执行预览与双模式生成',
  category: 'debug',
  icon: 'Clock',
  component: CronTool,
  keywords: ['cron', 'crontab', '定时', '计划任务', '调度', 'quartz', 'spring', '表达式'],
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---- 表达式输入：转换类实时防抖 300ms ----

const DEBOUNCE_MS = 300

const expression = ref('')
const debouncedExpression = ref('')

let timer: number | undefined
function onExpressionInput(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    debouncedExpression.value = expression.value
  }, DEBOUNCE_MS)
}

// 构建器产出侧同样防抖 300ms（watch 挂载于 builderFields 声明之后，见构建器一节）
const debouncedBuilderExpr = ref('* * * * *')
let builderTimer: number | undefined

onUnmounted(() => {
  if (timer !== undefined) window.clearTimeout(timer)
  if (builderTimer !== undefined) window.clearTimeout(builderTimer)
})

const parse = computed<CronParse>(() => parseCron(debouncedExpression.value))
const expressionValid = computed(() => parse.value.ok)

// ---- 错误文案（数据化错误 → i18n） ----

function errorText(error: CronError): string {
  switch (error.kind) {
    case 'empty':
      return t('cronTool.errEmpty')
    case 'fieldCount':
      return t('cronTool.errFieldCount', { count: String(error.count) })
    case 'yearUnsupported':
      return t('cronTool.errYear')
    case 'token':
      return t('cronTool.errToken', { raw: error.raw })
    case 'range':
      return t('cronTool.errRange', { raw: error.raw, min: String(error.min), max: String(error.max) })
    case 'reversed':
      return t('cronTool.errReversed', { raw: error.raw })
    case 'step':
      return t('cronTool.errStep', { raw: error.raw })
  }
}

const wholeError = computed(() => {
  const p = parse.value
  return !p.ok && p.error.scope === 'expression' ? errorText(p.error) : ''
})

// ---- 字段速览 ----

const fieldLabels: Record<CronFieldName, string> = {
  second: 'cronTool.fieldSecond',
  minute: 'cronTool.fieldMinute',
  hour: 'cronTool.fieldHour',
  dom: 'cronTool.fieldDom',
  month: 'cronTool.fieldMonth',
  dow: 'cronTool.fieldDow',
}

function fieldLabel(name: CronFieldName): string {
  return t(fieldLabels[name])
}

const translate: Translate = (key, params) =>
  t(key, params ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) : undefined)

interface OverviewRow {
  name: CronFieldName
  raw: string
  explain: string
  error: string
}

const overviewOrder = computed<readonly CronFieldName[]>(() =>
  parse.value.ok && parse.value.hasSeconds
    ? ['second', 'minute', 'hour', 'dom', 'month', 'dow']
    : ['minute', 'hour', 'dom', 'month', 'dow'],
)

const overviewFields = computed<OverviewRow[]>(() => {
  const p = parse.value
  const rows: OverviewRow[] = []
  for (const name of overviewOrder.value) {
    const field: CronField | undefined = p.ok ? p.fields[name] : (p.partial?.[name] as CronField | undefined)
    if (!field) continue
    rows.push({ name, raw: field.raw, explain: explainField(field, translate), error: '' })
  }
  if (!p.ok && p.error.scope === 'field') {
    rows.push({ name: p.error.field, raw: p.error.raw, explain: '', error: errorText(p.error) })
  }
  return rows
})

// ---- 自然语言描述（cronstrue locale 跟随应用语言，按需加载） ----

const description = ref<string | null>(null)

watch(
  [debouncedExpression, () => locale.value, parse],
  async () => {
    const p = parse.value
    if (!p.ok) {
      description.value = null
      return
    }
    const expr = debouncedExpression.value
    const lang = locale.value as AppLocale
    const desc = await describeCron(expr, lang)
    // 竞态守卫：仅当输入与语言未变时采纳
    if (debouncedExpression.value === expr && (locale.value as AppLocale) === lang && parse.value.ok) {
      description.value = desc
    }
  },
  { immediate: true },
)

// ---- 执行预览（下次 5 次触发时间） ----

const FALLBACK_TIME_ZONES = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/London']

const supportedTimeZones: readonly string[] = (() => {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  try {
    const list = intl.supportedValuesOf?.('timeZone')
    return list && list.length > 0 ? list : FALLBACK_TIME_ZONES
  } catch {
    return FALLBACK_TIME_ZONES
  }
})()

const tzFilter = ref('')
const tz = ref('')

const filteredTimeZones = computed<readonly string[]>(() => {
  const q = tzFilter.value.trim().toLowerCase()
  if (q === '') return supportedTimeZones
  return supportedTimeZones.filter((zone) => zone.toLowerCase().includes(q))
})

const previewList = ref<string[] | null>(null)

watch(
  [debouncedExpression, tz, parse],
  async () => {
    const p = parse.value
    if (!p.ok) {
      previewList.value = null
      return
    }
    const expr = debouncedExpression.value
    const tzSnapshot = tz.value
    const zone = tzSnapshot === '' ? localTimeZone() : tzSnapshot
    const res = await previewRuns(expr, { count: 5, tz: zone })
    // 竞态守卫：仅当输入与时区未变时采纳
    if (debouncedExpression.value === expr && tz.value === tzSnapshot && parse.value.ok) {
      previewList.value = res.ok ? res.runs : null
    }
  },
  { immediate: true },
)

// ---- 构建器（单向产出；模式 + 枚举/范围/步进 + 预设） ----

function initialBuilderFields(): BuilderFields {
  const out = {} as BuilderFields
  for (const f of BUILDER_FIELDS) out[f] = defaultBuilderField(f)
  return out
}

const builderFields = reactive<BuilderFields>(initialBuilderFields())

function builderExprSource(): string {
  return buildExpression(builderFields)
}

// 构建器 UI 改动实时产出表达式（防抖 300ms，与解析区同节奏）
watch(
  builderExprSource,
  (next) => {
    if (builderTimer !== undefined) window.clearTimeout(builderTimer)
    builderTimer = window.setTimeout(() => {
      builderTimer = undefined
      debouncedBuilderExpr.value = next
    }, DEBOUNCE_MS)
  },
  { immediate: true },
)

function enumCandidates(field: CronFieldName): number[] {
  const { min, max } = FIELD_RANGES[field]
  const list: number[] = []
  for (let v = min; v <= max; v++) list.push(v)
  return list
}

function applyPreset(preset: BuilderPreset): void {
  const fresh = initialBuilderFields()
  for (const f of BUILDER_FIELDS) {
    const patch = preset.fields[f]
    if (patch) Object.assign(fresh[f], patch)
  }
  Object.assign(builderFields, fresh)
}

function applyTemplate(tmpl: CronTemplate): void {
  // 模板一键填入解析输入框（不做反填构建器）
  expression.value = tmpl.expr
  onExpressionInput()
}

function fillParser(): void {
  expression.value = debouncedBuilderExpr.value
  onExpressionInput()
}

const builderCopied = ref(false)
let copiedTimer: number | undefined

async function copyBuilderExpr(): Promise<void> {
  try {
    await navigator.clipboard.writeText(debouncedBuilderExpr.value)
    builderCopied.value = true
    if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      builderCopied.value = false
    }, 1500)
  } catch {
    // 剪贴板不可用时静默（桌面环境常规路径可用）
  }
}

onUnmounted(() => {
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
})
</script>

<style scoped>
.cron-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.section-title {
  font-size: 15px;
  font-weight: 590;
  color: var(--text-primary);
  margin: 0;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.input {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-sm) var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.input:focus {
  border-color: var(--border-focus);
}

.mono {
  font-family: var(--font-mono);
}

.error {
  color: var(--error);
  font-size: 12px;
  margin: 0;
}

.dow-warning {
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-md);
  margin: 0;
}

.description {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.desc-label {
  font-size: 11px;
  color: var(--text-quaternary);
}

.desc-text {
  font-size: 14px;
  color: var(--text-primary);
}

.overview-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.overview-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.overview-row.invalid {
  border-color: var(--error);
}

.field-tag {
  flex: 0 0 auto;
  width: 2.5em;
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 1px var(--space-xs);
}

.field-raw {
  font-size: 13px;
  color: var(--text-primary);
  min-width: 3em;
}

.field-explain {
  font-size: 12px;
  color: var(--text-tertiary);
}

.field-error {
  margin-left: auto;
}

.preview-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.preview-sub {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.tz-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.tz-filter {
  flex: 0 1 200px;
}

.tz-select {
  flex: 1 1 auto;
}

.runs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.run {
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-md);
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.presets,
.templates {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.chip-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 3px var(--space-md);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.chip-btn:hover {
  border-color: var(--border-focus);
  color: var(--text-primary);
}

.builder-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.builder-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.builder-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.mode-select {
  width: auto;
}

.enum-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.enum-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--text-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px 4px;
  cursor: pointer;
  user-select: none;
}

.enum-chip.picked {
  border-color: var(--accent);
  color: var(--text-primary);
}

.enum-chip input {
  display: none;
}

.range-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.num {
  width: 72px;
}

.range-sep {
  color: var(--text-tertiary);
}

.builder-output {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.builder-expr {
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-md);
}

.btn {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.btn:hover {
  border-color: var(--border-focus);
}
</style>
