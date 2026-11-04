<template>
  <ToolLayout :tool="toolMeta">
    <div class="subnet-tool">
      <!-- 输入：单输入框自动识别，转换类实时防抖 300ms -->
      <section class="panel">
        <label class="label" for="subnet-input">{{ t('ipv4Subnet.inputLabel') }}</label>
        <input
          id="subnet-input"
          v-model="input"
          class="input mono"
          data-test="subnet-input"
          :placeholder="t('ipv4Subnet.inputPlaceholder')"
          spellcheck="false"
          autocomplete="off"
          @input="onInput"
        />

        <!-- IPv4-only 明示 -->
        <p class="notice" data-test="ipv4-only-notice">{{ t('ipv4Subnet.ipv4OnlyNotice') }}</p>

        <!-- 错误定位到段；错误时保留上一次结果 -->
        <p v-if="error" class="error" data-test="subnet-error">{{ errorText(error) }}</p>
      </section>

      <!-- 九件套输出 -->
      <section v-if="result" class="panel">
        <p v-if="result.isHostAddress" class="annotation" data-test="host-annotation">
          {{ t('ipv4Subnet.hostAnnotation') }}
        </p>
        <dl class="rows" data-test="subnet-rows">
          <div class="row" :class="{ highlight: result.isHostAddress }">
            <dt>{{ t('ipv4Subnet.outNetwork') }}</dt>
            <dd class="mono" data-test="out-network">{{ cidr(result.networkU32, result.prefix) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.outBroadcast') }}</dt>
            <dd class="mono" data-test="out-broadcast">
              <template v-if="result.broadcastU32 !== null">{{ ip(result.broadcastU32) }}</template>
              <template v-else>{{ t('ipv4Subnet.noneDash') }}</template>
            </dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.outMask') }}</dt>
            <dd class="mono" data-test="out-mask">{{ ip(result.maskU32) }}<span class="suffix">/{{ result.prefix }}</span></dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.outWildcard') }}</dt>
            <dd class="mono" data-test="out-wildcard">{{ ip(result.wildcardU32) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.outHostRange') }}</dt>
            <dd class="mono" data-test="out-host-range">
              <template v-if="result.firstHostU32 !== null && result.lastHostU32 !== null">
                {{ ip(result.firstHostU32) }} – {{ ip(result.lastHostU32) }}
              </template>
              <template v-else>{{ t('ipv4Subnet.noneDash') }}</template>
            </dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.outHostCount') }}</dt>
            <dd data-test="out-host-count">
              <span class="mono">{{ result.usable.toLocaleString() }}</span>
              <span v-if="result.prefix === 31" class="note">{{ t('ipv4Subnet.rfc3021Note') }}</span>
              <span v-else-if="result.prefix === 32" class="note">{{ t('ipv4Subnet.singleHostNote') }}</span>
            </dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.outTotal') }}</dt>
            <dd class="mono" data-test="out-total">{{ result.total.toLocaleString() }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.outClass') }}</dt>
            <dd data-test="out-class">{{ result.class }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.outLabel') }}</dt>
            <dd data-test="out-label">{{ labelText(result.label) }}</dd>
          </div>
        </dl>

        <!-- 二进制行：调试分类身份 -->
        <div class="binary">
          <div class="row">
            <dt>{{ t('ipv4Subnet.binaryMask') }}</dt>
            <dd class="mono" data-test="out-binary-mask">{{ binary(result.maskU32) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.binaryNetwork') }}</dt>
            <dd class="mono" data-test="out-binary-network">{{ binary(result.networkU32) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv4Subnet.binaryBroadcast') }}</dt>
            <dd class="mono" data-test="out-binary-broadcast">
              <template v-if="result.broadcastU32 !== null">{{ binary(result.broadcastU32) }}</template>
              <template v-else>{{ t('ipv4Subnet.noneDash') }}</template>
            </dd>
          </div>
        </div>
      </section>
      <p v-else-if="!error" class="empty" data-test="subnet-empty">{{ t('ipv4Subnet.inputPlaceholder') }}</p>

      <!-- 等分切分器（2 的幂均分，行数上限 1024，点击行复制 CIDR） -->
      <section v-if="result" class="panel">
        <h2 class="section-title">{{ t('ipv4Subnet.splitTitle') }}</h2>
        <p class="parent-line">
          {{ t('ipv4Subnet.splitParentPrefix', { prefix: String(result.prefix) }) }}
          <code class="mono parent-cidr">{{ cidr(result.networkU32, result.prefix) }}</code>
        </p>

        <div class="split-controls">
          <label class="radio">
            <input v-model="splitMode" type="radio" value="count" data-test="split-mode-count" />
            {{ t('ipv4Subnet.splitModeCount') }}
          </label>
          <select
            v-if="splitMode === 'count'"
            v-model.number="splitCount"
            class="input count-select"
            data-test="split-count"
            :aria-label="t('ipv4Subnet.splitCountLabel')"
          >
            <option v-for="n in SPLIT_COUNT_OPTIONS" :key="n" :value="n">{{ n }}</option>
          </select>
          <template v-if="splitMode === 'prefix'">
            <button type="button" class="btn step" data-test="split-prefix-dec" @click="stepPrefix(-1)">−</button>
            <code class="mono prefix-value" data-test="split-prefix-value">/{{ splitNewPrefix }}</code>
            <button type="button" class="btn step" data-test="split-prefix-inc" @click="stepPrefix(1)">+</button>
          </template>
        </div>

        <p v-if="splitOutcome === 'tooManySubnets'" class="error" data-test="split-cap-hint">{{ t('ipv4Subnet.splitTooMany') }}</p>
        <p v-else-if="splitOutcome === 'invalidTarget'" class="error" data-test="split-nosplit-hint">{{ t('ipv4Subnet.splitNoSplit') }}</p>
        <p v-else-if="splitOutcome === 'notPowerOfTwo'" class="error" data-test="split-notpow2-hint">{{ t('ipv4Subnet.splitNotPowerOfTwo') }}</p>

        <div v-if="splitRows.length > 0" class="split-table" data-test="split-rows">
          <div class="split-head">
            <span>{{ t('ipv4Subnet.splitColCidr') }}</span>
            <span>{{ t('ipv4Subnet.splitColRange') }}</span>
            <span>{{ t('ipv4Subnet.splitColUsable') }}</span>
          </div>
          <button
            v-for="(row, i) in splitRows"
            :key="row.cidr"
            type="button"
            class="split-row mono"
            :data-test="`split-row-${i}`"
            :title="t('ipv4Subnet.splitRowCopyHint')"
            @click="copyCidr(row.cidr)"
          >
            <span :data-test="`split-cidr-${i}`">{{ row.cidr }}{{ copiedCidr === row.cidr ? ' ✓' : '' }}</span>
            <span>
              <template v-if="row.firstU32 !== null && row.lastU32 !== null">{{ ip(row.firstU32) }} – {{ ip(row.lastU32) }}</template>
              <template v-else>{{ t('ipv4Subnet.noneDash') }}</template>
            </span>
            <span>{{ row.usable.toLocaleString() }}</span>
          </button>
        </div>
      </section>

      <!-- 区间反推（票据 06 交付物 B：起/止两输入 + 双输出，等分切分下方，不设独立页签） -->
      <section class="panel">
        <h2 class="section-title">{{ t('ipv4Subnet.rangeTitle') }}</h2>
        <p class="notice" data-test="range-hint">{{ t('ipv4Subnet.rangeHint') }}</p>

        <div class="range-inputs">
          <div class="range-field">
            <label class="label" for="range-start">{{ t('ipv4Subnet.rangeStartLabel') }}</label>
            <input
              id="range-start"
              v-model="rangeStart"
              class="input mono"
              data-test="range-start"
              :placeholder="t('ipv4Subnet.rangePlaceholder')"
              spellcheck="false"
              autocomplete="off"
              @input="onRangeInput"
            />
            <p v-if="rangeError?.field === 'start'" class="error" data-test="range-error-start">
              {{ t('ipv4Subnet.rangeErrInvalid', { value: rangeError.value ?? '' }) }}
            </p>
          </div>
          <div class="range-field">
            <label class="label" for="range-end">{{ t('ipv4Subnet.rangeEndLabel') }}</label>
            <input
              id="range-end"
              v-model="rangeEnd"
              class="input mono"
              data-test="range-end"
              :placeholder="t('ipv4Subnet.rangePlaceholder')"
              spellcheck="false"
              autocomplete="off"
              @input="onRangeInput"
            />
            <p v-if="rangeError?.field === 'end'" class="error" data-test="range-error-end">
              {{ t('ipv4Subnet.rangeErrInvalid', { value: rangeError.value ?? '' }) }}
            </p>
          </div>
        </div>

        <!-- 起 > 止显式报错（错误时保留上一次结果） -->
        <p v-if="rangeError?.field === 'order'" class="error" data-test="range-error-order">
          {{ t('ipv4Subnet.rangeErrOrder') }}
        </p>

        <template v-if="rangeResult">
          <!-- 主输出：精确覆盖 CIDR 列表（并集 = 区间、互不重叠，天然 ≤ 62 行） -->
          <div class="range-output">
            <p class="range-subtitle" data-test="range-exact-count">
              {{ t('ipv4Subnet.rangeExactCount', { count: String(rangeResult.rows.length) }) }}
            </p>
            <div class="split-table" data-test="range-rows">
              <div class="split-head">
                <span>{{ t('ipv4Subnet.rangeColCidr') }}</span>
                <span>{{ t('ipv4Subnet.rangeColRange') }}</span>
                <span>{{ t('ipv4Subnet.rangeColTotal') }}</span>
              </div>
              <button
                v-for="(row, i) in rangeResult.rows"
                :key="row.cidr"
                type="button"
                class="split-row mono"
                :data-test="`range-row-${i}`"
                :title="t('ipv4Subnet.rangeRowCopyHint')"
                @click="copyRangeCidr(row.cidr)"
              >
                <span :data-test="`range-cidr-${i}`">{{ row.cidr }}{{ copiedRangeCidr === row.cidr ? ' ✓' : '' }}</span>
                <span>{{ ip(row.firstU32) }} – {{ ip(row.lastU32) }}</span>
                <span>{{ row.total.toLocaleString() }}</span>
              </button>
            </div>
          </div>

          <!-- 辅输出：最小包含 CIDR（it-tools 同款单条扩张，对照口径） -->
          <div class="range-output">
            <p class="range-subtitle">{{ t('ipv4Subnet.rangeContainingTitle') }}</p>
            <dl class="rows">
              <div class="row">
                <dt>{{ t('ipv4Subnet.rangeContainingCidr') }}</dt>
                <dd class="mono" data-test="range-containing-cidr">{{ rangeResult.containing.cidr }}</dd>
              </div>
              <div class="row">
                <dt>{{ t('ipv4Subnet.rangeContainingRange') }}</dt>
                <dd class="mono" data-test="range-containing-range">
                  {{ ip(rangeResult.containing.firstU32) }} – {{ ip(rangeResult.containing.lastU32) }}
                </dd>
              </div>
              <div class="row">
                <dt>{{ t('ipv4Subnet.rangeOldSize') }}</dt>
                <dd class="mono" data-test="range-old-size">{{ rangeResult.oldSize.toLocaleString() }}</dd>
              </div>
              <div class="row">
                <dt>{{ t('ipv4Subnet.rangeNewSize') }}</dt>
                <dd class="mono" data-test="range-new-size">{{ rangeResult.newSize.toLocaleString() }}</dd>
              </div>
            </dl>
          </div>
        </template>
        <p v-else-if="!rangeError" class="empty" data-test="range-empty">{{ t('ipv4Subnet.rangePlaceholder') }}</p>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import Ipv4Subnet from './Ipv4Subnet.vue'
import { SPLIT_COUNT_OPTIONS, analyze, equalSplit, formatBinaryIp, formatCidr, formatIp } from './subnet'
import type { NetworkLabel, SplitRow, SubnetError, SubnetInfo } from './subnet'
import { analyzeRange } from './range'
import type { RangeError, RangeExpanderResult } from './range'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'ipv4-subnet',
  name: 'IPv4 子网计算',
  description: 'CIDR 与点分掩码解析、九项参数、等分切分与区间反推 CIDR',
  category: 'debug',
  icon: 'Network',
  component: Ipv4Subnet,
  keywords: [
    'ipv4',
    '子网',
    'subnet',
    'cidr',
    'netmask',
    '掩码',
    '通配符',
    'ip 计算',
    'wildcard',
    '区间反推',
    'cidr 列表',
    'range',
  ],
}

// ---- 输入：转换类实时防抖 300ms；错误保留上一次结果 ----

const DEBOUNCE_MS = 300

const input = ref('')
const debouncedInput = ref('')

let timer: number | undefined
function onInput(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    debouncedInput.value = input.value
  }, DEBOUNCE_MS)
}
onUnmounted(() => {
  if (timer !== undefined) window.clearTimeout(timer)
})

const result = ref<SubnetInfo | null>(null)
const error = ref<SubnetError | null>(null)

watch(debouncedInput, (value) => {
  const outcome = analyze(value)
  if (outcome.status === 'ok') {
    result.value = outcome.info
    error.value = null
  } else if (outcome.status === 'error') {
    // 非法输入只错该处：保留上一次结果，仅更新错误
    error.value = outcome.error
  } else {
    // 空输入：清结果与错误
    result.value = null
    error.value = null
  }
})

// ---- 展示 ----

function ip(u32: number): string {
  return formatIp(u32)
}

function cidr(u32: number, prefix: number): string {
  return formatCidr(u32, prefix)
}

function binary(u32: number): string {
  return formatBinaryIp(u32)
}

function octetIndex(segment: SubnetError['segment']): string {
  switch (segment) {
    case 'octet1':
      return '1'
    case 'octet2':
      return '2'
    case 'octet3':
      return '3'
    case 'octet4':
      return '4'
    default:
      return ''
  }
}

function errorText(error: SubnetError): string {
  switch (error.kind) {
    case 'octetFormat':
      return t('ipv4Subnet.errOctetFormat', { index: octetIndex(error.segment), value: error.value ?? '' })
    case 'octetRange':
      return t('ipv4Subnet.errOctetRange', { index: octetIndex(error.segment), value: error.value ?? '' })
    case 'prefixFormat':
      return t('ipv4Subnet.errPrefixFormat', { value: error.value ?? '' })
    case 'prefixRange':
      return t('ipv4Subnet.errPrefixRange', { value: error.value ?? '' })
    case 'maskFormat':
      return t('ipv4Subnet.errMaskFormat', { value: error.value ?? '' })
    case 'maskContiguous':
      return t('ipv4Subnet.errMaskContiguous', { value: error.value ?? '' })
    case 'fieldCount':
      return t('ipv4Subnet.errFieldCount', { value: error.value ?? '' })
  }
}

function labelText(label: NetworkLabel): string {
  switch (label) {
    case 'private':
      return t('ipv4Subnet.labelPrivate')
    case 'loopback':
      return t('ipv4Subnet.labelLoopback')
    case 'linklocal':
      return t('ipv4Subnet.labelLinklocal')
    case 'multicast':
      return t('ipv4Subnet.labelMulticast')
    case 'reserved':
      return t('ipv4Subnet.labelReserved')
    case 'public':
      return t('ipv4Subnet.labelPublic')
  }
}

// ---- 等分切分 ----

const splitMode = ref<'count' | 'prefix'>('count')
const splitCount = ref<number>(4)
const splitNewPrefix = ref<number>(24)

// 当前网络变化时，目标前缀步进从 +1 开始
watch(
  result,
  (value) => {
    if (value !== null) splitNewPrefix.value = Math.min(value.prefix + 1, 32)
  },
  { immediate: true },
)

function stepPrefix(delta: number): void {
  if (result.value === null) return
  const min = result.value.prefix + 1
  splitNewPrefix.value = Math.min(32, Math.max(min, splitNewPrefix.value + delta))
}

const splitOutcome = computed<'ok' | 'tooManySubnets' | 'notPowerOfTwo' | 'invalidTarget' | 'none'>(() => {
  if (result.value === null) return 'none'
  const target =
    splitMode.value === 'count' ? { count: splitCount.value } : { newPrefix: splitNewPrefix.value }
  const res = equalSplit(result.value.networkU32, result.value.prefix, target)
  return res.ok ? 'ok' : res.reason
})

const splitRows = computed<SplitRow[]>(() => {
  if (result.value === null) return []
  const target =
    splitMode.value === 'count' ? { count: splitCount.value } : { newPrefix: splitNewPrefix.value }
  const res = equalSplit(result.value.networkU32, result.value.prefix, target)
  return res.ok ? res.rows : []
})

const copiedCidr = ref('')
let copiedTimer: number | undefined

async function copyCidr(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    copiedCidr.value = value
    if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copiedCidr.value = ''
    }, 1500)
  } catch {
    // 剪贴板不可用时静默
  }
}

onUnmounted(() => {
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
})

// ---- 区间反推（票据 06 交付物 B：起/止两输入 + 双输出；实时防抖；只错该处） ----

const rangeStart = ref('')
const rangeEnd = ref('')
const debouncedRange = ref<{ start: string; end: string }>({ start: '', end: '' })

let rangeTimer: number | undefined
function onRangeInput(): void {
  if (rangeTimer !== undefined) window.clearTimeout(rangeTimer)
  rangeTimer = window.setTimeout(() => {
    rangeTimer = undefined
    debouncedRange.value = { start: rangeStart.value, end: rangeEnd.value }
  }, DEBOUNCE_MS)
}

const rangeResult = ref<RangeExpanderResult | null>(null)
const rangeError = ref<RangeError | null>(null)

watch(debouncedRange, ({ start, end }) => {
  const outcome = analyzeRange(start, end)
  if (outcome.status === 'ok') {
    rangeResult.value = outcome.result
    rangeError.value = null
  } else if (outcome.status === 'error') {
    // 只错该处：错误定位到起/止/顺序，保留上一次结果
    rangeError.value = outcome.error
  } else {
    // 双空或只填一侧：清结果与错误
    rangeResult.value = null
    rangeError.value = null
  }
})

const copiedRangeCidr = ref('')
let copiedRangeTimer: number | undefined

async function copyRangeCidr(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    copiedRangeCidr.value = value
    if (copiedRangeTimer !== undefined) window.clearTimeout(copiedRangeTimer)
    copiedRangeTimer = window.setTimeout(() => {
      copiedRangeCidr.value = ''
    }, 1500)
  } catch {
    // 剪贴板不可用时静默
  }
}

onUnmounted(() => {
  if (rangeTimer !== undefined) window.clearTimeout(rangeTimer)
  if (copiedRangeTimer !== undefined) window.clearTimeout(copiedRangeTimer)
})
</script>

<style scoped>
.subnet-tool {
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

.notice {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.annotation {
  font-size: 12px;
  color: var(--warning, #b8860b);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-md);
  margin: 0;
}

.empty {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-xs) var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.row.highlight {
  border-color: var(--warning, #b8860b);
}

.row dt {
  font-size: 12px;
  color: var(--text-secondary);
}

.row dd {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;
}

.suffix {
  color: var(--text-quaternary);
  font-size: 11px;
  margin-left: var(--space-xs);
}

.note {
  display: block;
  font-size: 11px;
  color: var(--text-quaternary);
}

.binary {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.parent-line {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

.parent-cidr {
  margin-left: var(--space-sm);
  font-size: 12px;
  color: var(--text-primary);
}

.split-controls {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.radio {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.radio input {
  accent-color: var(--accent);
}

.count-select {
  width: 96px;
}

.btn {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  padding: 2px var(--space-md);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.btn:hover {
  border-color: var(--border-focus);
}

.prefix-value {
  font-size: 13px;
  color: var(--text-primary);
  min-width: 3em;
  text-align: center;
}

.split-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.split-head,
.split-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 2fr minmax(90px, auto);
  gap: var(--space-md);
  align-items: center;
  text-align: left;
}

.split-head {
  font-size: 11px;
  color: var(--text-quaternary);
  padding: 0 var(--space-sm);
}

.split-row {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  padding: var(--space-xs) var(--space-sm);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.split-row:hover {
  border-color: var(--border-focus);
}

.split-row span:first-child {
  color: var(--text-primary);
}

.range-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.range-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.range-output {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.range-subtitle {
  font-size: 12px;
  font-weight: 560;
  color: var(--text-secondary);
  margin: 0;
}

@media (max-width: 640px) {
  .range-inputs {
    grid-template-columns: 1fr;
  }
}
</style>
