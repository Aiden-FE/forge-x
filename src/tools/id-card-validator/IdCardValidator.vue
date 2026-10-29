<template>
  <ToolLayout :tool="toolMeta">
    <div class="id-card-validator">
      <!-- 输入：单号与多行粘贴同一界面，防抖实时校验 -->
      <section class="panel">
        <label class="label" for="idcard-input">{{ t('idCardValidator.inputLabel') }}</label>
        <textarea
          id="idcard-input"
          v-model="text"
          class="textarea"
          data-test="idcard-input"
          :placeholder="t('idCardValidator.inputPlaceholder')"
          rows="5"
          @input="onInput"
        />
        <p class="privacy" data-test="privacy-notice">
          <ShieldCheck :size="14" />
          {{ t('idCardValidator.privacy') }}
        </p>
      </section>

      <!-- 结果：单号展示解析区/错误清单；多行逐行 ✓/✗ + 摘要 -->
      <section v-if="results.length > 0" class="panel">
        <template v-if="single">
          <div v-if="single.result.valid && single.result.parsed" class="parse" data-test="parse-panel">
            <div class="parse-head">
              <span class="badge ok" data-test="valid-badge">✓ {{ t('idCardValidator.valid') }}</span>
              <span class="kind">{{ kindLabel(single.result.parsed.kind) }}</span>
            </div>
            <dl class="rows">
              <div class="row">
                <dt>{{ t('idCardValidator.birth') }}</dt>
                <dd class="mono" data-test="parse-birth">{{ single.result.parsed.birth }}</dd>
              </div>
              <div class="row">
                <dt>{{ t('idCardValidator.gender') }}</dt>
                <dd data-test="parse-gender">{{ genderLabel(single.result.parsed.gender) }}</dd>
              </div>
              <div class="row">
                <dt>{{ t('idCardValidator.age') }}</dt>
                <dd data-test="parse-age">
                  {{ t('idCardValidator.ageYears', { years: String(single.result.parsed.age) }) }}
                </dd>
              </div>
              <div class="row">
                <dt>{{ t('idCardValidator.check') }}</dt>
                <dd class="mono" data-test="parse-check">
                  <template v-if="single.result.parsed.checkDigit">
                    {{ single.result.parsed.checkDigit }} · {{ t('idCardValidator.checkPass') }}
                  </template>
                  <template v-else>{{ t('idCardValidator.checkNone') }}</template>
                </dd>
              </div>
            </dl>
          </div>
          <div v-else class="errors" data-test="error-list">
            <span class="badge bad" data-test="invalid-badge">✗ {{ t('idCardValidator.invalid') }}</span>
            <ul class="error-items">
              <li
                v-for="(e, i) in single.result.errors"
                :key="i"
                class="error-item"
                data-test="error-item"
              >
                {{ errorText(e) }}
              </li>
            </ul>
          </div>
        </template>

        <ol v-else class="batch" data-test="batch-list">
          <li
            v-for="r in batch"
            :key="r.line"
            class="batch-row"
            :class="r.result.valid ? 'ok' : 'bad'"
            data-test="batch-row"
          >
            <span class="line-no">{{ t('idCardValidator.batchLine', { line: String(r.line) }) }}</span>
            <span class="mark">{{ r.result.valid ? '✓' : '✗' }}</span>
            <span class="detail">{{ lineBrief(r) }}</span>
          </li>
        </ol>
      </section>

      <p v-else class="empty" data-test="empty">{{ t('idCardValidator.empty') }}</p>

      <div class="actions">
        <button class="btn" data-test="clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('idCardValidator.clear') }}
        </button>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { ShieldCheck, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import IdCardValidator from './IdCardValidator.vue'
import { validateLines } from './validator'
import type { Gender, IdCardError, IdCardKind, IdCardLineResult } from './validator'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'id-card-validator',
  name: '身份证号校验',
  description: '校验 18/15 位身份证号结构并解析出生日期与性别',
  category: 'text',
  icon: 'IdCard',
  component: IdCardValidator,
  keywords: ['身份证', 'id card', '校验', 'checksum', 'gb11643', '号码'],
}

// ---- 实时校验（防抖，延续平台联动惯例） ----

const DEBOUNCE_MS = 250

const text = ref('')
const debouncedText = ref('')
// 每次校验重算：validateLines 内部按调用时刻的 now 计算年龄/未来日期
const results = computed(() => validateLines(debouncedText.value))

let timer: number | undefined

function flush(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }
  debouncedText.value = text.value
}

function onInput(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    debouncedText.value = text.value
  }, DEBOUNCE_MS)
}

onUnmounted(() => {
  if (timer !== undefined) window.clearTimeout(timer)
})

function clear(): void {
  text.value = ''
  flush()
}

// ---- 展示 ----

/** 单行输入时展示完整解析区/错误清单 */
const single = computed(() => (results.value.length === 1 ? results.value[0] : undefined))
/** 多行输入时展示批量列表 */
const batch = computed(() => (results.value.length > 1 ? results.value : undefined))

function kindLabel(kind: IdCardKind): string {
  return kind === '18' ? t('idCardValidator.kind18') : t('idCardValidator.kind15')
}

function genderLabel(gender: Gender): string {
  return gender === 'male' ? t('idCardValidator.male') : t('idCardValidator.female')
}

function errorText(e: IdCardError): string {
  switch (e.code) {
    case 'length':
      return t('idCardValidator.errors.length', { length: String(e.length ?? 0) })
    case 'charset':
      return t('idCardValidator.errors.charset', {
        segment: e.segment ? t(`idCardValidator.segments.${e.segment}`) : '',
        position: String(e.position ?? 0),
        char: e.char ?? '',
      })
    case 'area':
      return t('idCardValidator.errors.area', { prefix: e.prefix ?? '' })
    case 'birthInvalid':
      return t('idCardValidator.errors.birthInvalid', { date: e.date ?? '' })
    case 'birthFuture':
      return t('idCardValidator.errors.birthFuture', { date: e.date ?? '' })
    case 'birthYearRange':
      return t('idCardValidator.errors.birthYearRange', { year: String(e.year ?? 0) })
    case 'checkMismatch':
      return t('idCardValidator.errors.checkMismatch', {
        expected: e.expected ?? '',
        actual: e.actual ?? '',
      })
    default:
      return ''
  }
}

/** 批量行摘要：合法 → 出生日期 · 性别 · 年龄；非法 → 全部错误并列 */
function lineBrief(r: IdCardLineResult): string {
  if (r.result.valid && r.result.parsed) {
    const p = r.result.parsed
    const parts = [p.birth, genderLabel(p.gender), t('idCardValidator.ageYears', { years: String(p.age) })]
    return parts.join(' · ')
  }
  return r.result.errors.map(errorText).join(' · ')
}
</script>

<style scoped>
.id-card-validator {
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

.privacy {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.parse {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.parse-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.badge {
  font-size: 12px;
  font-weight: 590;
  padding: 2px 10px;
  border-radius: 999px;
}

.badge.ok {
  color: var(--success, #22c55e);
  background: color-mix(in srgb, var(--success, #22c55e) 12%, transparent);
}

.badge.bad {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 12%, transparent);
}

.kind {
  font-size: 12px;
  color: var(--text-quaternary);
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-xs) 0;
}

.row + .row {
  border-top: 1px solid var(--border);
}

.row dt {
  font-size: 13px;
  color: var(--text-secondary);
}

.row dd {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
}

.mono {
  font-family: var(--font-mono);
}

.errors {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.error-items {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.error-item {
  font-size: 13px;
  color: var(--error);
  font-family: var(--font-mono);
}

.batch {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.batch-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.batch-row .mark {
  font-weight: 700;
}

.batch-row.ok .mark {
  color: var(--success, #22c55e);
}

.batch-row.bad .mark {
  color: var(--error);
}

.line-no {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-quaternary);
  min-width: 56px;
}

.detail {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  word-break: break-all;
}

.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  padding: var(--space-lg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
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
</style>
