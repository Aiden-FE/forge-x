<template>
  <ToolLayout :tool="toolMeta">
    <div class="pw-tool">
      <section class="panel">
        <div class="control">
          <span class="label">{{ t('passwordGenerator.classLabel') }}</span>
          <div class="class-group" role="group" data-test="pw-classes" :aria-label="t('passwordGenerator.classLabel')">
            <label
              v-for="c in CHAR_CLASSES"
              :key="c.id"
              class="class-option"
              :class="{ active: classes[c.id] }"
              :title="c.id === 'symbols' ? t('passwordGenerator.symbolsHint') : undefined"
            >
              <input
                v-model="classes[c.id]"
                type="checkbox"
                :disabled="isLastEnabled(c.id)"
                :data-test="`pw-class-${c.id}`"
              />
              {{ t(`passwordGenerator.${classLabelKey(c.id)}`) }}
            </label>
          </div>
          <span v-if="poolResult.ok" class="hint" data-test="pw-pool-size">
            {{ t('passwordGenerator.poolSize', { size: String(poolResult.pool.length) }) }}
          </span>
          <span v-else class="error" data-test="pw-error-pool">{{ t('passwordGenerator.errorPool') }}</span>
        </div>

        <div class="controls">
          <div class="control">
            <label class="label" for="pw-length">{{ t('passwordGenerator.lengthLabel') }}</label>
            <input
              id="pw-length"
              v-model="lengthRaw"
              class="number-input"
              :class="{ invalid: lengthError }"
              data-test="pw-length"
              type="number"
              :min="MIN_LENGTH"
              :max="MAX_LENGTH"
              step="1"
            />
            <span v-if="lengthError" class="error" data-test="pw-error-length">
              {{ t('passwordGenerator.errorLength') }}
            </span>
          </div>
          <div class="control">
            <span class="label">{{ t('passwordGenerator.countLabel') }}</span>
            <div class="count-group" data-test="pw-count-presets">
              <button
                v-for="n in COUNT_PRESETS"
                :key="n"
                type="button"
                class="preset"
                :class="{ active: parsedCount === n }"
                :data-test="`pw-count-${n}`"
                @click="setCount(n)"
              >
                {{ n }}
              </button>
              <input
                v-model="countRaw"
                class="number-input small"
                :class="{ invalid: countError }"
                data-test="pw-count"
                type="number"
                :min="MIN_COUNT"
                :max="MAX_COUNT"
                step="1"
                :aria-label="t('passwordGenerator.countLabel')"
              />
            </div>
            <span v-if="countError" class="error" data-test="pw-error-count">
              {{ t('passwordGenerator.errorCount') }}
            </span>
          </div>
        </div>

        <label class="check-row">
          <input v-model="excludeConfusable" type="checkbox" data-test="pw-confusable" />
          <span class="check-text">
            <span class="label-inline">{{ t('passwordGenerator.confusableLabel') }}</span>
            <span class="hint">{{ t('passwordGenerator.confusableHint') }}</span>
          </span>
        </label>

        <div class="control">
          <label class="label" for="pw-exclude">{{ t('passwordGenerator.excludeLabel') }}</label>
          <input
            id="pw-exclude"
            v-model="customExcluded"
            class="text-input"
            data-test="pw-exclude"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('passwordGenerator.excludePlaceholder')"
          />
          <div v-if="excludedChars.length" class="chips">
            <button
              v-for="(ch, i) in excludedChars"
              :key="ch"
              type="button"
              class="chip"
              :data-test="`pw-exclude-chip-${i}`"
              :title="t('passwordGenerator.excludeHint')"
              @click="removeExclusion(ch)"
            >
              {{ ch }}
            </button>
          </div>
          <span class="hint">{{ t('passwordGenerator.excludeHint') }}</span>
        </div>

        <p class="hint">{{ t('passwordGenerator.notLiveHint') }}</p>
      </section>

      <section class="panel output">
        <div v-if="results.length && lastMeta" class="summary">
          <div class="entropy">
            <span class="entropy-label">{{ t('passwordGenerator.entropyLabel') }}</span>
            <strong class="entropy-bits" data-test="pw-entropy">
              {{ t('passwordGenerator.entropyValue', { bits: lastMeta.bits }) }}
            </strong>
            <span class="tier" :class="`tier-${lastMeta.tier}`" data-test="pw-tier">
              {{ tierLabel(lastMeta.tier) }}
            </span>
          </div>
          <p class="note" data-test="pw-entropy-note">{{ t('passwordGenerator.entropyNote') }}</p>
          <p class="note" data-test="pw-privacy">{{ t('passwordGenerator.privacy') }}</p>
          <p v-if="stale" class="stale" data-test="pw-stale">{{ t('passwordGenerator.staleHint') }}</p>
        </div>

        <ul v-if="results.length" class="rows">
          <li
            v-for="(pw, i) in results"
            :key="`${generation}-${i}`"
            class="row-item"
            data-test="pw-row"
          >
            <span class="index">{{ i + 1 }}</span>
            <code class="pw-text">{{ pw }}</code>
            <button class="btn small" type="button" :data-test="`pw-copy-${i}`" @click="copyRow(i)">
              <Check v-if="copiedIndex === i" :size="14" />
              <Copy v-else :size="14" />
              {{ copiedIndex === i ? t('passwordGenerator.copied') : t('passwordGenerator.copy') }}
            </button>
          </li>
        </ul>
        <p v-else class="empty" data-test="pw-empty">{{ t('passwordGenerator.empty') }}</p>

        <div class="actions">
          <button
            class="btn primary"
            type="button"
            data-test="pw-regenerate"
            :disabled="!canGenerate"
            @click="regenerate"
          >
            <RefreshCw :size="16" />
            {{ t('passwordGenerator.regenerate') }}
          </button>
          <button class="btn" type="button" data-test="pw-copy-all" :disabled="!results.length" @click="copyAll">
            <Copy :size="16" />
            {{ copiedAll ? t('passwordGenerator.copied') : t('passwordGenerator.copyAll') }}
          </button>
          <button class="btn" type="button" data-test="pw-clear" :disabled="!results.length" @click="clearResults">
            <Trash2 :size="16" />
            {{ t('passwordGenerator.clear') }}
          </button>
        </div>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import PasswordGenerator from './PasswordGenerator.vue'
import {
  CHAR_CLASSES,
  COUNT_PRESETS,
  DEFAULT_LENGTH,
  DEFAULT_POLICY,
  MAX_COUNT,
  MAX_LENGTH,
  MIN_COUNT,
  MIN_LENGTH,
  buildPool,
  generatePasswords,
  parseExclusions,
  strengthTier,
  theoreticalEntropy,
  validateCount,
  validateLength,
} from './password'
import type { CharClassId, Policy, StrengthTier } from './password'

const toolMeta: ToolMeta = {
  id: 'password-generator',
  name: '密码生成器',
  description: '按字符类策略生成强随机密码，显示理论熵',
  category: 'generate',
  icon: 'KeyRound',
  component: PasswordGenerator,
  keywords: ['密码', 'password', '生成', '强度', 'entropy', '随机', '口令'],
}

const { t } = useI18n()

/* ---------- 策略状态（只影响下一次生成） ---------- */

const classes = ref<Record<CharClassId, boolean>>({ ...DEFAULT_POLICY.classes })
const lengthRaw = ref<string | number>(DEFAULT_LENGTH)
const countRaw = ref<string | number>(COUNT_PRESETS[0])
const excludeConfusable = ref(DEFAULT_POLICY.excludeConfusable)
const customExcluded = ref(DEFAULT_POLICY.customExcluded)

const parsedLength = computed(() => validateLength(Number(lengthRaw.value)))
const parsedCount = computed(() => validateCount(Number(countRaw.value)))
const lengthError = computed(() => parsedLength.value === null)
const countError = computed(() => parsedCount.value === null)

const policy = computed<Policy>(() => ({
  classes: { ...classes.value },
  length: Number(lengthRaw.value),
  excludeConfusable: excludeConfusable.value,
  customExcluded: customExcluded.value,
}))

const poolResult = computed(() => buildPool(policy.value))
const excludedChars = computed(() => parseExclusions(customExcluded.value))
const canGenerate = computed(() => !lengthError.value && !countError.value && poolResult.value.ok)

/** 至少一类常开：唯一已开类为禁用态，不可关。 */
function isLastEnabled(id: CharClassId): boolean {
  if (!classes.value[id]) return false
  return CHAR_CLASSES.filter((c) => classes.value[c.id]).length === 1
}

function classLabelKey(id: CharClassId): string {
  return `class${id[0]!.toUpperCase()}${id.slice(1)}`
}

function tierLabel(tier: StrengthTier): string {
  return t(`passwordGenerator.strength${tier[0]!.toUpperCase()}${tier.slice(1)}`)
}

function setCount(n: number): void {
  countRaw.value = n
}

/** 点击已排除字符芯片 → 从排除输入中移除该字符（所有出现位置）。 */
function removeExclusion(ch: string): void {
  customExcluded.value = [...customExcluded.value].filter((c) => c !== ch).join('')
}

/* ---------- 结果状态（生成类非实时：仅由 regenerate 替换） ---------- */

const results = ref<string[]>([])
const generation = ref(0)
const lastMeta = ref<{ bits: string; tier: StrengthTier } | null>(null)
const snapshot = ref('')
const currentSnapshot = computed(() => JSON.stringify([policy.value, parsedCount.value]))
const stale = computed(() => results.value.length > 0 && snapshot.value !== currentSnapshot.value)

function regenerate(): void {
  if (parsedLength.value === null || parsedCount.value === null) return
  const pool = poolResult.value
  if (!pool.ok) return
  const result = generatePasswords(policy.value, parsedCount.value)
  if (!result.ok) return
  const bits = theoreticalEntropy(pool.pool.length, parsedLength.value)
  results.value = result.passwords
  generation.value++
  lastMeta.value = { bits: bits.toFixed(1), tier: strengthTier(bits) }
  snapshot.value = currentSnapshot.value
}

onMounted(regenerate)

function clearResults(): void {
  results.value = []
  lastMeta.value = null
}

/* ---------- 复制 ---------- */

const copiedIndex = ref<number | null>(null)
const copiedAll = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

function flashCopied(all: boolean, index: number | null): void {
  clearTimeout(copiedTimer)
  copiedIndex.value = index
  copiedAll.value = all
  copiedTimer = setTimeout(() => {
    copiedIndex.value = null
    copiedAll.value = false
  }, 1500)
}

async function copyRow(index: number): Promise<void> {
  const pw = results.value[index]
  if (pw === undefined) return
  await navigator.clipboard.writeText(pw)
  flashCopied(false, index)
}

async function copyAll(): Promise<void> {
  if (!results.value.length) return
  await navigator.clipboard.writeText(results.value.join('\n'))
  flashCopied(true, null)
}
</script>

<style scoped>
.pw-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.label-inline {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.control {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.controls {
  display: flex;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.class-group {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.class-option {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.class-option.active {
  border-color: var(--accent);
  color: var(--text-primary);
}

.class-option:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.7;
}

.class-option input {
  accent-color: var(--accent);
}

.controls .control:first-child {
  min-width: 120px;
}

.number-input {
  width: 96px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-xs) var(--space-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.number-input.small {
  width: 72px;
}

.number-input:focus {
  border-color: var(--border-focus);
}

.number-input.invalid {
  border-color: var(--error);
}

.count-group {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  flex-wrap: wrap;
}

.preset {
  min-width: 36px;
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.preset.active {
  border-color: var(--accent);
  color: var(--text-primary);
  background: var(--bg-hover);
}

.check-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  cursor: pointer;
}

.check-row input {
  margin-top: 2px;
  accent-color: var(--accent);
}

.check-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.text-input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: var(--space-xs) var(--space-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.text-input:focus {
  border-color: var(--border-focus);
}

.text-input::placeholder {
  color: var(--text-quaternary);
}

.chips {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.chip {
  min-width: 24px;
  padding: 2px var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  text-decoration: line-through;
  transition: all var(--transition-fast);
}

.chip:hover {
  color: var(--text-primary);
  border-color: var(--border-focus);
  text-decoration: none;
}

.error {
  font-size: 12px;
  color: var(--error);
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
}

.output {
  gap: var(--space-md);
}

.summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.entropy {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.entropy-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.entropy-bits {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-primary);
}

.tier {
  padding: 1px var(--space-sm);
  border-radius: var(--radius-pill);
  font-size: 12px;
  border: 1px solid currentColor;
}

.tier.weak {
  color: var(--error);
}

.tier.medium {
  color: var(--warning);
}

.tier.strong {
  color: var(--success);
}

.note {
  font-size: 12px;
  color: var(--text-quaternary);
}

.stale {
  font-size: 12px;
  color: var(--accent);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.row-item:last-child {
  border-bottom: none;
}

.index {
  min-width: 24px;
  font-size: 12px;
  color: var(--text-quaternary);
  text-align: right;
  line-height: 22px;
}

.pw-text {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 22px;
  color: var(--text-primary);
  word-break: break-all;
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
  flex-shrink: 0;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  padding: var(--space-lg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}
</style>
