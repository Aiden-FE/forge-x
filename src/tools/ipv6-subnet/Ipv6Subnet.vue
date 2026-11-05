<template>
  <ToolLayout :tool="toolMeta">
    <div class="subnet-tool">
      <!-- 输入：单输入框自动识别，转换类实时防抖 300ms -->
      <section class="panel">
        <label class="label" for="v6-input">{{ t('ipv6Subnet.inputLabel') }}</label>
        <input
          id="v6-input"
          v-model="input"
          class="input mono"
          data-test="v6-input"
          :placeholder="t('ipv6Subnet.inputPlaceholder')"
          :spellcheck="false"
          autocomplete="off"
          @input="onInput"
        />

        <!-- IPv6-only + 无点分掩码形态明示 -->
        <p class="notice" data-test="v6-only-notice">{{ t('ipv6Subnet.ipv6OnlyNotice') }}</p>

        <!-- 错误定位到段；错误时保留上一次结果 -->
        <p v-if="error" class="error" data-test="v6-error">{{ errorText(error) }}</p>
      </section>

      <!-- 件套输出 -->
      <section v-if="result" class="panel">
        <p v-if="result.isHostAddress" class="annotation" data-test="v6-host-annotation">
          {{ t('ipv6Subnet.hostAnnotation') }}
        </p>
        <dl class="rows" data-test="v6-rows">
          <div class="row" :class="{ highlight: result.isHostAddress }">
            <dt>{{ t('ipv6Subnet.outNetwork') }}</dt>
            <dd class="mono" data-test="v6-out-network">{{ cidr(result.network, result.prefix) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv6Subnet.outPrefix') }}</dt>
            <dd class="mono" data-test="v6-out-prefix">
              /{{ result.prefix }}
              <span v-if="result.prefix === 64" class="note">{{ t('ipv6Subnet.slaacNote') }}</span>
              <span v-else-if="result.prefix === 127" class="note">{{ t('ipv6Subnet.rfc6164Note') }}</span>
            </dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv6Subnet.outTotal') }}</dt>
            <dd class="mono" data-test="v6-out-total">{{ formatBig(result.total) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv6Subnet.outFirst') }}</dt>
            <dd class="mono" data-test="v6-out-first">{{ addr(result.first) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv6Subnet.outLast') }}</dt>
            <dd class="mono" data-test="v6-out-last">{{ addr(result.last) }}</dd>
          </div>
          <div class="row">
            <dt>{{ t('ipv6Subnet.outScope') }}</dt>
            <dd data-test="v6-out-scope">{{ scopeText(result.scope) }}</dd>
          </div>
        </dl>

        <!-- 口径说明行：与 IPv4 的 broadcast/usable 口径差异明示 -->
        <p class="notice" data-test="v6-semantic-notice">{{ t('ipv6Subnet.semanticNotice') }}</p>

        <!-- 二进制行：调试分类身份 -->
        <div class="binary">
          <div class="row">
            <dt>{{ t('ipv6Subnet.binaryNetwork') }}</dt>
            <dd class="mono binary-line" data-test="v6-out-binary">{{ binary(result.network) }}</dd>
          </div>
        </div>
      </section>
      <p v-else-if="!error" class="empty" data-test="v6-empty">{{ t('ipv6Subnet.inputPlaceholder') }}</p>

      <!-- 等分切分器（2 的幂均分，行数上限 1024，点击行复制 CIDR；与 ipv4-subnet 同构） -->
      <section v-if="result" class="panel">
        <h2 class="section-title">{{ t('ipv6Subnet.splitTitle') }}</h2>
        <p class="parent-line">
          {{ t('ipv6Subnet.splitParentPrefix', { prefix: String(result.prefix) }) }}
          <code class="mono parent-cidr">{{ cidr(result.network, result.prefix) }}</code>
        </p>

        <div class="split-controls">
          <label class="radio">
            <input v-model="splitMode" type="radio" value="count" data-test="v6-split-mode-count" />
            {{ t('ipv6Subnet.splitModeCount') }}
          </label>
          <select
            v-if="splitMode === 'count'"
            v-model.number="splitCount"
            class="input count-select"
            data-test="v6-split-count"
            :aria-label="t('ipv6Subnet.splitCountLabel')"
          >
            <option v-for="n in IPV6_SPLIT_COUNT_OPTIONS" :key="n" :value="n">{{ n }}</option>
          </select>
          <template v-if="splitMode === 'prefix'">
            <button type="button" class="btn step" data-test="v6-split-prefix-dec" @click="stepPrefix(-1)">−</button>
            <code class="mono prefix-value" data-test="v6-split-prefix-value">/{{ splitNewPrefix }}</code>
            <button type="button" class="btn step" data-test="v6-split-prefix-inc" @click="stepPrefix(1)">+</button>
          </template>
        </div>

        <p v-if="splitOutcome === 'tooManySubnets'" class="error" data-test="v6-split-cap-hint">{{ t('ipv6Subnet.splitTooMany') }}</p>
        <p v-else-if="splitOutcome === 'invalidTarget'" class="error" data-test="v6-split-nosplit-hint">{{ t('ipv6Subnet.splitNoSplit') }}</p>
        <p v-else-if="splitOutcome === 'notPowerOfTwo'" class="error" data-test="v6-split-notpow2-hint">{{ t('ipv6Subnet.splitNotPowerOfTwo') }}</p>

        <div v-if="splitRows.length > 0" class="split-table" data-test="v6-split-rows">
          <div class="split-head">
            <span>{{ t('ipv6Subnet.splitColCidr') }}</span>
            <span>{{ t('ipv6Subnet.splitColRange') }}</span>
            <span>{{ t('ipv6Subnet.splitColTotal') }}</span>
          </div>
          <button
            v-for="(row, i) in splitRows"
            :key="row.cidr"
            type="button"
            class="split-row mono"
            :data-test="`v6-split-row-${i}`"
            :title="t('ipv6Subnet.splitRowCopyHint')"
            @click="copyCidr(row.cidr)"
          >
            <span :data-test="`v6-split-cidr-${i}`">{{ row.cidr }}{{ copiedCidr === row.cidr ? ' ✓' : '' }}</span>
            <span>{{ addr(row.first) }} – {{ addr(row.last) }}</span>
            <span>{{ formatBig(row.total) }}</span>
          </button>
        </div>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import Ipv6Subnet from './Ipv6Subnet.vue'
import {
  IPV6_SPLIT_COUNT_OPTIONS,
  analyzeIpv6,
  equalSplitIpv6,
  formatBigInt,
  formatBinaryIpv6,
  formatIpv6,
  formatIpv6Cidr,
} from './ipv6'
import type { Ipv6Error, Ipv6Info, Ipv6Scope, Ipv6SplitRow } from './ipv6'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'ipv6-subnet',
  name: 'IPv6 子网计算',
  description: '前缀解析、参数计算、scope 判定与等分切分',
  category: 'debug',
  icon: 'Waypoints',
  component: Ipv6Subnet,
  keywords: ['ipv6', 'subnet', 'cidr', '前缀', '子网'],
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

const result = ref<Ipv6Info | null>(null)
const error = ref<Ipv6Error | null>(null)

watch(debouncedInput, (value) => {
  const outcome = analyzeIpv6(value)
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

function addr(value: bigint): string {
  return formatIpv6(value)
}

function cidr(value: bigint, prefix: number): string {
  return formatIpv6Cidr(value, prefix)
}

function binary(value: bigint): string {
  return formatBinaryIpv6(value)
}

function formatBig(value: bigint): string {
  return formatBigInt(value)
}

function groupIndex(segment: Ipv6Error['segment']): string {
  switch (segment) {
    case 'group1':
      return '1'
    case 'group2':
      return '2'
    case 'group3':
      return '3'
    case 'group4':
      return '4'
    case 'group5':
      return '5'
    case 'group6':
      return '6'
    case 'group7':
      return '7'
    case 'group8':
      return '8'
    default:
      return ''
  }
}

function errorText(error: Ipv6Error): string {
  switch (error.kind) {
    case 'groupFormat':
      return t('ipv6Subnet.errGroupFormat', { index: groupIndex(error.segment), value: error.value ?? '' })
    case 'groupRange':
      return t('ipv6Subnet.errGroupRange', { index: groupIndex(error.segment), value: error.value ?? '' })
    case 'addrFormat':
      return t('ipv6Subnet.errAddrFormat', { value: error.value ?? '' })
    case 'v4tailFormat':
      return t('ipv6Subnet.errV4tailFormat', { value: error.value ?? '' })
    case 'prefixFormat':
      return t('ipv6Subnet.errPrefixFormat', { value: error.value ?? '' })
    case 'prefixRange':
      return t('ipv6Subnet.errPrefixRange', { value: error.value ?? '' })
    case 'fieldCount':
      return t('ipv6Subnet.errFieldCount', { value: error.value ?? '' })
  }
}

function scopeText(scope: Ipv6Scope): string {
  switch (scope) {
    case 'loopback':
      return t('ipv6Subnet.scopeLoopback')
    case 'unspecified':
      return t('ipv6Subnet.scopeUnspecified')
    case 'linkLocal':
      return t('ipv6Subnet.scopeLinklocal')
    case 'ula':
      return t('ipv6Subnet.scopeUla')
    case 'multicast':
      return t('ipv6Subnet.scopeMulticast')
    case 'global':
      return t('ipv6Subnet.scopeGlobal')
    case 'other':
      return t('ipv6Subnet.scopeOther')
  }
}

// ---- 等分切分（与 ipv4-subnet 同构） ----

const splitMode = ref<'count' | 'prefix'>('count')
const splitCount = ref<number>(4)
const splitNewPrefix = ref<number>(64)

// 当前网络变化时，目标前缀步进从 +1 开始
watch(
  result,
  (value) => {
    if (value !== null) splitNewPrefix.value = Math.min(value.prefix + 1, 128)
  },
  { immediate: true },
)

function stepPrefix(delta: number): void {
  if (result.value === null) return
  const min = result.value.prefix + 1
  splitNewPrefix.value = Math.min(128, Math.max(min, splitNewPrefix.value + delta))
}

/** 单次 equalSplitIpv6 计算，供 outcome 与 rows 两个投影共享（不重复调用）。 */
const splitResult = computed<ReturnType<typeof equalSplitIpv6> | null>(() => {
  if (result.value === null) return null
  const target =
    splitMode.value === 'count' ? { count: splitCount.value } : { newPrefix: splitNewPrefix.value }
  return equalSplitIpv6(result.value.network, result.value.prefix, target)
})

const splitOutcome = computed<'ok' | 'tooManySubnets' | 'notPowerOfTwo' | 'invalidTarget' | 'none'>(() => {
  if (splitResult.value === null) return 'none'
  const res = splitResult.value
  return res.ok ? 'ok' : res.reason
})

const splitRows = computed<Ipv6SplitRow[]>(() => {
  const res = splitResult.value
  return res && res.ok ? res.rows : []
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
  flex-shrink: 0;
}

.row dd {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;
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

.binary-line {
  font-size: 11px;
  line-height: 1.6;
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
  grid-template-columns: minmax(180px, 1fr) 2fr minmax(140px, auto);
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
</style>
