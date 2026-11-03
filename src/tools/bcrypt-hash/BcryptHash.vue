<template>
  <ToolLayout :tool="toolMeta">
    <div class="bcrypt-tool">
      <!-- 上区块：生成哈希（按钮触发、非实时——工作因子即故意设计的计算开销） -->
      <section class="panel">
        <h2 class="section-title">{{ t('bcryptHash.generateTitle') }}</h2>

        <div class="control">
          <label class="label" for="bc-password">{{ t('bcryptHash.passwordLabel') }}</label>
          <div class="password-row">
            <input
              id="bc-password"
              v-model="genPassword"
              class="password-input"
              :type="showGenPassword ? 'text' : 'password'"
              data-test="bc-password"
              :placeholder="t('bcryptHash.passwordPlaceholder')"
              autocomplete="off"
              spellcheck="false"
            />
            <button
              class="btn icon"
              type="button"
              data-test="bc-visibility"
              :aria-label="showGenPassword ? t('bcryptHash.hidePassword') : t('bcryptHash.showPassword')"
              @click="showGenPassword = !showGenPassword"
            >
              <EyeOff v-if="showGenPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
          <p v-if="genTruncated" class="warn" data-test="bc-truncate-warning">
            {{ t('bcryptHash.truncationWarning') }}
          </p>
        </div>

        <div class="control">
          <label class="label" for="bc-cost-input">{{ t('bcryptHash.costLabel') }}</label>
          <div class="cost-row">
            <input
              v-model.number="cost"
              class="range"
              type="range"
              :min="MIN_COST"
              :max="MAX_COST"
              step="1"
              data-test="bc-cost-slider"
              :aria-label="t('bcryptHash.costLabel')"
            />
            <input
              id="bc-cost-input"
              class="number-input"
              type="number"
              :min="MIN_COST"
              :max="MAX_COST"
              step="1"
              :value="cost"
              data-test="bc-cost-input"
              @input="onCostInput"
            />
          </div>
          <p class="hint">{{ t('bcryptHash.costHint') }}</p>
          <p v-if="cost > SLOW_COST_THRESHOLD" class="warn" data-test="bc-cost-slow-hint">
            {{ t('bcryptHash.costSlowHint') }}
          </p>
        </div>

        <div class="actions">
          <button
            class="btn primary"
            type="button"
            data-test="bc-generate"
            :disabled="genBusy || genPassword.length === 0"
            @click="generate"
          >
            <KeyRound :size="16" />
            {{ genBusy ? t('bcryptHash.generating') : t('bcryptHash.generate') }}
          </button>
        </div>

        <p v-if="genError" class="error" data-test="bc-generate-error">{{ genError }}</p>

        <div v-if="genHash" class="result">
          <label class="label">{{ t('bcryptHash.hashResult') }}</label>
          <div class="result-row">
            <code class="result-value" data-test="bc-hash-output">{{ genHash }}</code>
            <button class="btn small" type="button" data-test="bc-copy-hash" @click="copyHash">
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
              {{ copied ? t('bcryptHash.copied') : t('bcryptHash.copyHash') }}
            </button>
          </div>
        </div>
      </section>

      <!-- 下区块：校验（三态：匹配 / 不匹配 / 格式非法） -->
      <section class="panel">
        <h2 class="section-title">{{ t('bcryptHash.verifyTitle') }}</h2>

        <div class="control">
          <label class="label" for="bc-verify-password">{{ t('bcryptHash.verifyPasswordLabel') }}</label>
          <input
            id="bc-verify-password"
            v-model="verifyPasswordInput"
            class="password-input"
            type="password"
            data-test="bc-verify-password"
            :placeholder="t('bcryptHash.verifyPasswordPlaceholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <p v-if="verifyTruncated" class="warn" data-test="bc-verify-truncate-warning">
            {{ t('bcryptHash.truncationWarning') }}
          </p>
        </div>

        <div class="control">
          <label class="label" for="bc-verify-hash">{{ t('bcryptHash.verifyHashLabel') }}</label>
          <input
            id="bc-verify-hash"
            v-model="verifyHashInput"
            class="hash-input"
            type="text"
            data-test="bc-verify-hash"
            :placeholder="t('bcryptHash.verifyHashPlaceholder')"
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <div class="actions">
          <button
            class="btn primary"
            type="button"
            data-test="bc-verify"
            :disabled="verifyBusy || verifyPasswordInput.length === 0 || verifyHashInput.length === 0"
            @click="verify"
          >
            <ShieldCheck :size="16" />
            {{ verifyBusy ? t('bcryptHash.verifying') : t('bcryptHash.verify') }}
          </button>
        </div>

        <p v-if="verifyError" class="error" data-test="bc-verify-error">{{ verifyError }}</p>

        <div
          v-if="verifyStatus"
          class="verdict"
          :class="verifyStatus"
          data-test="bc-verify-result"
        >
          <span class="verdict-mark">
            {{ verifyStatus === 'match' ? '✓' : '✗' }}
            {{ verdictLabel(verifyStatus) }}
          </span>
          <span class="verdict-detail">
            {{ verdictDetailLabel(verifyStatus) }}
          </span>
        </div>

        <!-- 解析区（身份证校验器先例）：仅合法格式拆解四段，非法不拆解 -->
        <div v-if="verifySegments" class="parse" data-test="bc-parse-panel">
          <span class="label">{{ t('bcryptHash.parseTitle') }}</span>
          <dl class="parse-rows">
            <div class="parse-row">
              <dt>{{ t('bcryptHash.parsePrefix') }}</dt>
              <dd class="mono" data-test="bc-parse-prefix">{{ verifySegments.prefix }}</dd>
            </div>
            <div class="parse-row">
              <dt>{{ t('bcryptHash.parseCost') }}</dt>
              <dd class="mono" data-test="bc-parse-cost">{{ verifySegments.cost }}</dd>
            </div>
            <div class="parse-row">
              <dt>{{ t('bcryptHash.parseSalt') }}</dt>
              <dd class="mono" data-test="bc-parse-salt">{{ verifySegments.salt }}</dd>
            </div>
            <div class="parse-row">
              <dt>{{ t('bcryptHash.parseDigest') }}</dt>
              <dd class="mono" data-test="bc-parse-digest">{{ verifySegments.digest }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <p class="notice" data-test="bc-notice">
        <ShieldCheck :size="14" />
        {{ t('bcryptHash.notice') }}
      </p>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Check, Copy, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import BcryptHash from './BcryptHash.vue'
import { BcryptClient } from './bcrypt-client'
import {
  DEFAULT_COST,
  MAX_COST,
  MIN_COST,
  SLOW_COST_THRESHOLD,
  exceedsTruncationLimit,
  parseBcryptHash,
} from './bcrypt'
import type { VerifyStatus } from './bcrypt'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'bcrypt-hash',
  name: 'bcrypt 哈希/校验',
  description: '生成与校验 bcrypt 密码哈希并拆解哈希结构，纯本地',
  category: 'security',
  icon: 'KeyRound',
  component: BcryptHash,
  keywords: ['bcrypt', '哈希', 'hash', '密码', 'password', 'salt', '加密', 'crypt', '校验'],
}

const client = new BcryptClient()
onUnmounted(() => client.dispose())

/* ---------- 生成哈希 ---------- */

const genPassword = ref('')
const showGenPassword = ref(false)
const cost = ref(DEFAULT_COST)
const genBusy = ref(false)
const genHash = ref('')
const genError = ref('')

// 生成/校验后明文输入保留不自动清空；不做「安全擦除」伪动作
const genTruncated = computed(() => exceedsTruncationLimit(genPassword.value))

function onCostInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value) && value > 0) {
    cost.value = Math.min(MAX_COST, Math.max(MIN_COST, Math.round(value)))
  }
}

let genJob = 0

async function generate(): Promise<void> {
  if (genPassword.value.length === 0) {
    genError.value = t('bcryptHash.errors.emptyPassword')
    return
  }
  const job = ++genJob
  genBusy.value = true
  genError.value = ''
  try {
    const res = await client.run({ kind: 'hash', password: genPassword.value, cost: cost.value })
    if (job !== genJob) return
    if (res.kind === 'hash' && res.ok) {
      genHash.value = res.hash
    } else {
      genError.value = t('bcryptHash.errors.compute')
    }
  } catch {
    if (job !== genJob) return
    genError.value = t('bcryptHash.errors.compute')
  } finally {
    if (job === genJob) genBusy.value = false
  }
}

/* ---------- 复制哈希 ---------- */

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyHash(): Promise<void> {
  if (!genHash.value) return
  await navigator.clipboard.writeText(genHash.value)
  clearTimeout(copiedTimer)
  copied.value = true
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

/* ---------- 校验 ---------- */

const verifyPasswordInput = ref('')
const verifyHashInput = ref('')
const verifyBusy = ref(false)
const verifyStatus = ref<VerifyStatus | null>(null)
const verifyError = ref('')

const verifyTruncated = computed(() => exceedsTruncationLimit(verifyPasswordInput.value))

// 合法哈希实时拆解四段（纯正则，零计算成本）；非法格式不拆解
const verifySegments = computed(() => parseBcryptHash(verifyHashInput.value))

/** 三态文案键（invalid-format → resultInvalid，动态拼接不可用）。 */
function verdictLabel(status: VerifyStatus): string {
  const name = status === 'match' ? 'Match' : status === 'mismatch' ? 'Mismatch' : 'Invalid'
  return t(`bcryptHash.result${name}`)
}

function verdictDetailLabel(status: VerifyStatus): string {
  const name = status === 'match' ? 'Match' : status === 'mismatch' ? 'Mismatch' : 'Invalid'
  return t(`bcryptHash.result${name}Detail`)
}

let verifyJob = 0

async function verify(): Promise<void> {
  if (verifyPasswordInput.value.length === 0) {
    verifyError.value = t('bcryptHash.errors.emptyVerifyPassword')
    return
  }
  if (verifyHashInput.value.length === 0) {
    verifyError.value = t('bcryptHash.errors.emptyHash')
    return
  }
  const job = ++verifyJob
  verifyBusy.value = true
  verifyError.value = ''
  try {
    const res = await client.run({
      kind: 'verify',
      password: verifyPasswordInput.value,
      hash: verifyHashInput.value,
    })
    if (job !== verifyJob) return
    if (res.kind === 'verify' && res.ok) {
      verifyStatus.value = res.status
    } else {
      verifyError.value = t('bcryptHash.errors.compute')
    }
  } catch {
    if (job !== verifyJob) return
    verifyError.value = t('bcryptHash.errors.compute')
  } finally {
    if (job === verifyJob) verifyBusy.value = false
  }
}
</script>

<style scoped>
.bcrypt-tool {
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

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 590;
  color: var(--text-primary);
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.control {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.password-row {
  display: flex;
  gap: var(--space-xs);
}

.password-input {
  flex: 1;
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

.password-input:focus {
  border-color: var(--border-focus);
}

.password-input::placeholder {
  color: var(--text-quaternary);
}

.hash-input {
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

.hash-input:focus {
  border-color: var(--border-focus);
}

.hash-input::placeholder {
  color: var(--text-quaternary);
}

.cost-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.range {
  flex: 1;
  accent-color: var(--accent);
}

.number-input {
  width: 72px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-xs) var(--space-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.number-input:focus {
  border-color: var(--border-focus);
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-quaternary);
}

.warn {
  margin: 0;
  font-size: 12px;
  color: var(--warning);
}

.error {
  margin: 0;
  font-size: 13px;
  color: var(--error);
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
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

.btn.small {
  padding: var(--space-xs) var(--space-sm);
  font-size: 12px;
  flex-shrink: 0;
}

.btn.icon {
  padding: var(--space-xs);
  flex-shrink: 0;
}

.result {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.result-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
}

.result-value {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
}

.verdict {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-surface);
}

.verdict .verdict-mark {
  font-size: 14px;
  font-weight: 590;
}

.verdict.match .verdict-mark {
  color: var(--success, #22c55e);
}

.verdict.mismatch .verdict-mark,
.verdict.invalid-format .verdict-mark {
  color: var(--error);
}

.verdict .verdict-detail {
  font-size: 12px;
  color: var(--text-tertiary);
}

.parse {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.parse-rows {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.parse-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-xs) 0;
}

.parse-row + .parse-row {
  border-top: 1px solid var(--border);
}

.parse-row dt {
  font-size: 13px;
  color: var(--text-secondary);
}

.parse-row dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: right;
  font-size: 13px;
  color: var(--text-primary);
}

.mono {
  font-family: var(--font-mono);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: 12px;
  color: var(--text-quaternary);
}
</style>
