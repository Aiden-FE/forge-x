<template>
  <ToolLayout :tool="toolMeta">
    <div class="base-tool">
      <section class="panel">
        <div class="toggles">
          <label class="toggle">
            <input
              v-model="uppercase"
              type="checkbox"
              data-test="toggle-uppercase"
              @change="applyToggles"
            />
            {{ t('baseConverter.uppercase') }}
          </label>
          <label class="toggle">
            <input
              v-model="prefix"
              type="checkbox"
              data-test="toggle-prefix"
              @change="applyToggles"
            />
            {{ t('baseConverter.prefix') }}
          </label>
        </div>
        <div class="fields">
          <div v-for="f in FIXED_FIELDS" :key="f.key" class="field">
            <label class="label" :for="`bc-${f.key}`">
              {{ t(f.label) }}
              <span class="radix-tag">{{ f.radix }}</span>
            </label>
            <input
              :id="`bc-${f.key}`"
              v-model="texts[f.key]"
              class="input mono"
              :class="{ invalid: errors[f.key] }"
              :data-test="`${f.key}-input`"
              spellcheck="false"
              autocomplete="off"
              @input="onFieldInput(f.key)"
            />
            <p v-if="errors[f.key]" class="error" :data-test="`${f.key}-error`">{{ errors[f.key] }}</p>
          </div>
          <div class="field">
            <label class="label" for="bc-custom">
              {{ t('baseConverter.custom') }}
              <input
                id="bc-radix"
                v-model.number="radixInput"
                class="radix-input mono"
                :class="{ invalid: radixInvalid }"
                type="number"
                min="2"
                max="36"
                step="1"
                data-test="custom-radix"
                :aria-label="t('baseConverter.radixLabel')"
                @input="queueRadix"
              />
              <span class="radix-tag">{{ t('baseConverter.radixHint') }}</span>
            </label>
            <p v-if="radixInvalid" class="error" data-test="radix-error">{{ t('baseConverter.errRadix') }}</p>
            <input
              id="bc-custom"
              v-model="texts.custom"
              class="input mono"
              :class="{ invalid: errors.custom }"
              data-test="custom-input"
              spellcheck="false"
              autocomplete="off"
              @input="onFieldInput('custom')"
            />
            <p v-if="errors.custom" class="error" data-test="custom-error">{{ errors.custom }}</p>
          </div>
        </div>
      </section>

      <!-- 码点联动行：当前数值处于 0–0x10FFFF 时映射为 Unicode 码点字符 -->
      <section class="panel">
        <h2 class="section-title">{{ t('baseConverter.charRow') }}</h2>
        <div class="char-row" data-test="char-row">
          <template v-if="charChar">
            <span class="char-big mono" data-test="char-char">{{ charChar }}</span>
            <span class="char-code mono" data-test="char-code">{{ charLabel }}</span>
          </template>
          <span
            v-else-if="charLabel"
            class="char-code mono"
            data-test="char-code"
          >{{ charLabel }}</span>
          <span v-else class="char-none" data-test="char-none">{{ t('baseConverter.charNone') }}</span>
        </div>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import BaseConverter from './BaseConverter.vue'
import {
  FIELD_KEYS,
  FIELD_RADIXES,
  codePointOf,
  fieldRadix,
  formatField,
  normalizeRadix,
  parseIntInRadix,
} from './base'
import type { ConverterState, FieldKey } from './base'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'base-converter',
  name: '进制转换',
  description: '任意 2–36 进制整数互转（BigInt）',
  category: 'encode',
  icon: 'Hash',
  component: BaseConverter,
  keywords: ['base', 'radix', 'binary', 'hex', 'octal', 'bigint', '进制', '二进制', '十六进制'],
}

const FIXED_FIELDS: { key: Exclude<FieldKey, 'custom'>; label: string; radix: number }[] = [
  { key: 'bin', label: 'baseConverter.binary', radix: FIELD_RADIXES.bin },
  { key: 'oct', label: 'baseConverter.octal', radix: FIELD_RADIXES.oct },
  { key: 'dec', label: 'baseConverter.decimal', radix: FIELD_RADIXES.dec },
  { key: 'hex', label: 'baseConverter.hex', radix: FIELD_RADIXES.hex },
]

// ---- 规范值与五个文本框的联动 ----

/** 当前数值的规范形态；null 表示尚未输入（全部字段为空）。 */
const value = ref<bigint | null>(null)
const texts = reactive<Record<FieldKey, string>>({ bin: '', oct: '', dec: '', hex: '', custom: '' })
const errors = reactive<Record<FieldKey, string>>({ bin: '', oct: '', dec: '', hex: '', custom: '' })

const uppercase = ref(false)
const prefix = ref(false)
const radixInput = ref<number | string>(36)
/** 自定义基数（非法时为 null，自定义框冻结在旧值）。 */
const customRadix = computed(() =>
  typeof radixInput.value === 'number' ? normalizeRadix(radixInput.value) : null,
)
const radixInvalid = computed(() => customRadix.value === null)

function converterState(): ConverterState {
  // customRadix 仅在格式化 custom 字段时被消费，而该分支已被基数合法性守卫。
  return { uppercase: uppercase.value, prefix: prefix.value, customRadix: customRadix.value ?? 0 }
}

/** 从规范值重排其余字段；规范值为空或被排除字段之外保持不动。 */
function refreshAllExcept(except?: FieldKey): void {
  const v = value.value
  if (v === null) return
  for (const key of FIELD_KEYS) {
    if (key === except) continue
    // 基数非法时自定义框冻结：保留旧文本与旧错误，不参与重排。
    if (key === 'custom' && customRadix.value === null) continue
    texts[key] = formatField(v, key, converterState())
    errors[key] = ''
  }
}

function clearAll(): void {
  value.value = null
  for (const key of FIELD_KEYS) {
    texts[key] = ''
    errors[key] = ''
  }
}

function invalidMessage(res: { index: number; char?: string }): string {
  return res.char !== undefined
    ? t('baseConverter.errInvalidChar', { char: res.char, pos: String(res.index + 1) })
    : t('baseConverter.errIncomplete')
}

/** 应用某个字段的输入：非法只错该框，其余框保留旧值。 */
function applyField(key: FieldKey): void {
  if (texts[key].trim() === '') {
    clearAll()
    return
  }
  if (key === 'custom' && customRadix.value === null) {
    errors.custom = t('baseConverter.errRadix')
    return
  }
  const res = parseIntInRadix(texts[key], fieldRadix(key, customRadix.value ?? 0))
  if (res.status === 'ok') {
    value.value = res.value
    errors[key] = ''
    refreshAllExcept(key)
  } else if (res.status === 'empty') {
    clearAll()
  } else {
    errors[key] = invalidMessage(res)
  }
}

/** 开关变化：从规范值重排全部字段（自定义框受基数合法性守卫）。 */
function applyToggles(): void {
  refreshAllExcept()
}

/** 自定义基数变化：按新基数重排；基数非法时仅该输入错误态，自定义框冻结。 */
function applyRadix(): void {
  if (customRadix.value === null) return
  refreshAllExcept()
}

/** 输入防抖：与颜色转换器一致的「只错该框保留旧值」节奏。 */
const DEBOUNCE_MS = 250
const pendingTimers = new Set<number>()
function deferred(fn: () => void): () => void {
  return () => {
    const id = window.setTimeout(() => {
      pendingTimers.delete(id)
      fn()
    }, DEBOUNCE_MS)
    pendingTimers.add(id)
  }
}
onUnmounted(() => {
  for (const id of pendingTimers) window.clearTimeout(id)
})

const queueRadix = deferred(applyRadix)
const queuedFieldApplies: Record<FieldKey, () => void> = {
  bin: deferred(() => applyField('bin')),
  oct: deferred(() => applyField('oct')),
  dec: deferred(() => applyField('dec')),
  hex: deferred(() => applyField('hex')),
  custom: deferred(() => applyField('custom')),
}

/** 模板入口：调度对应字段的防抖应用。 */
function onFieldInput(key: FieldKey): void {
  queuedFieldApplies[key]()
}

// ---- 码点联动行 ----

const charInfo = computed(() => (value.value === null ? null : codePointOf(value.value)))
const charChar = computed(() => {
  const info = charInfo.value
  return info !== null && info.kind === 'char' ? info.char : ''
})
const charLabel = computed(() => {
  const info = charInfo.value
  return info !== null && info.kind !== 'none' ? info.label : ''
})
</script>

<style scoped>
.base-tool {
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

.toggles {
  display: flex;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.toggle {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.toggle input {
  accent-color: var(--accent);
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--space-md);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.label {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.radix-tag {
  font-size: 11px;
  color: var(--text-quaternary);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 0 var(--space-xs);
}

.radix-input {
  width: 56px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 12px;
  padding: 1px var(--space-xs);
  outline: none;
  transition: border-color var(--transition-fast);
}

.radix-input:focus {
  border-color: var(--border-focus);
}

.radix-input.invalid {
  border-color: var(--error);
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

.input.invalid {
  border-color: var(--error);
}

.mono {
  font-family: var(--font-mono);
}

.error {
  color: var(--error);
  font-size: 12px;
  margin: 0;
}

.char-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
  min-height: 40px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.char-big {
  font-size: 26px;
  color: var(--text-primary);
  word-break: break-all;
}

.char-code {
  font-size: 13px;
  color: var(--text-secondary);
}

.char-none {
  font-size: 13px;
  color: var(--text-quaternary);
}
</style>
