<template>
  <ToolLayout :tool="toolMeta">
    <div class="totp-tool">
      <!-- 添加条目：base32 密钥粘贴 或 otpauth:// URI 整段解析 -->
      <section class="panel">
        <h2 class="section-title">{{ t('totpGenerator.addTitle') }}</h2>

        <div class="control">
          <label class="label" for="totp-secret">{{ t('totpGenerator.secretLabel') }}</label>
          <input
            id="totp-secret"
            v-model="secretInput"
            class="text-input"
            type="text"
            data-test="totp-secret-input"
            :placeholder="t('totpGenerator.secretPlaceholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <p class="hint">{{ t('totpGenerator.secretHint') }}</p>
        </div>

        <div class="controls-row">
          <div class="control">
            <label class="label" for="totp-issuer">{{ t('totpGenerator.issuerLabel') }}</label>
            <input
              id="totp-issuer"
              v-model="issuerInput"
              class="text-input"
              type="text"
              data-test="totp-issuer-input"
              :placeholder="t('totpGenerator.issuerPlaceholder')"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <div class="control">
            <label class="label" for="totp-account">{{ t('totpGenerator.accountLabel') }}</label>
            <input
              id="totp-account"
              v-model="accountInput"
              class="text-input"
              type="text"
              data-test="totp-account-input"
              :placeholder="t('totpGenerator.accountPlaceholder')"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </div>

        <div class="actions">
          <button class="btn primary" type="button" data-test="totp-add" @click="addEntry">
            <Plus :size="16" />
            {{ t('totpGenerator.add') }}
          </button>
        </div>

        <p v-if="addError" class="error" data-test="totp-add-error">{{ addError }}</p>
      </section>

      <!-- 条目列表：大码 + 进度环 + 下一窗口码弱化；参数变更立即重算（时效码豁免） -->
      <section class="panel">
        <h2 class="section-title">{{ t('totpGenerator.entriesTitle') }}</h2>

        <p v-if="entries.length === 0" class="empty" data-test="totp-empty">{{ t('totpGenerator.empty') }}</p>

        <ul v-else class="entries" data-test="totp-entries">
          <li
            v-for="entry in entries"
            :key="entry.id"
            class="entry"
            data-test="totp-entry"
          >
            <div class="entry-main">
              <div class="entry-head">
                <span class="entry-label" data-test="totp-entry-label">{{ entryLabel(entry) }}</span>
                <button
                  class="btn icon"
                  type="button"
                  data-test="totp-remove"
                  :aria-label="t('totpGenerator.remove')"
                  @click="removeEntry(entry.id)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>

              <div class="entry-body">
                <button
                  class="code-btn"
                  type="button"
                  data-test="totp-copy-code"
                  :title="t('totpGenerator.copyCode')"
                  @click="copyCode(entry)"
                >
                  <span class="code" data-test="totp-code">{{ currentCodes[entry.id] ?? '······' }}</span>
                </button>

                <div class="ring-wrap">
                  <svg class="ring" viewBox="0 0 60 60" data-test="totp-ring">
                    <circle class="ring-bg" cx="30" cy="30" r="26" />
                    <circle
                      class="ring-fg"
                      cx="30"
                      cy="30"
                      r="26"
                      :style="ringStyle(entry)"
                    />
                  </svg>
                  <span class="remaining" data-test="totp-remaining">
                    {{ remainingByEntry[entry.id] ?? 0 }}{{ t('totpGenerator.secondsUnit') }}
                  </span>
                </div>

                <div class="next">
                  <span class="next-label">{{ t('totpGenerator.nextCode') }}</span>
                  <span class="next-code" data-test="totp-next-code">{{ nextCodes[entry.id] ?? '······' }}</span>
                </div>
              </div>

              <div class="entry-controls">
                <label class="inline-control">
                  <span class="inline-label">{{ t('totpGenerator.algorithmLabel') }}</span>
                  <select v-model="entry.algorithm" class="select" data-test="totp-algorithm">
                    <option v-for="a in ALGORITHMS" :key="a" :value="a">{{ a }}</option>
                  </select>
                </label>
                <label class="inline-control">
                  <span class="inline-label">{{ t('totpGenerator.digitsLabel') }}</span>
                  <select v-model.number="entry.digits" class="select" data-test="totp-digits">
                    <option v-for="d in DIGITS_OPTIONS" :key="d" :value="d">{{ d }}</option>
                  </select>
                </label>
                <label class="inline-control">
                  <span class="inline-label">{{ t('totpGenerator.periodLabel') }}</span>
                  <select v-model.number="entry.period" class="select" data-test="totp-period">
                    <option v-for="p in PERIOD_OPTIONS" :key="p" :value="p">{{ p }}s</option>
                  </select>
                </label>
                <button class="btn small" type="button" data-test="totp-copy-uri" @click="copyUri(entry)">
                  <Check v-if="uriCopiedId === entry.id" :size="14" />
                  <Copy v-else :size="14" />
                  {{ uriCopiedId === entry.id ? t('totpGenerator.uriCopied') : t('totpGenerator.copyUri') }}
                </button>
              </div>

              <label class="remember-row">
                <input
                  v-model="entry.remember"
                  type="checkbox"
                  data-test="totp-remember"
                  @change="onRememberChange"
                />
                <span class="remember-text">
                  <span>{{ t('totpGenerator.rememberLabel') }}</span>
                  <span v-if="entry.remember" class="remember-warning">
                    {{ t('totpGenerator.rememberWarning') }}
                  </span>
                </span>
              </label>
            </div>
          </li>
        </ul>

        <!-- 记住条目 opt-in：明文警示 + 一键清除常驻 -->
        <div v-if="rememberedCount > 0" class="remembered-banner" data-test="totp-remembered-banner">
          <TriangleAlert :size="14" />
          <span>{{ t('totpGenerator.rememberedBanner') }}</span>
          <button class="btn small" type="button" data-test="totp-clear-remembered" @click="clearAllRemembered">
            {{ t('totpGenerator.clearAllRemembered') }}
          </button>
        </div>
      </section>

      <p class="notice" data-test="totp-notice">
        <ShieldCheck :size="14" />
        {{ t('totpGenerator.notice') }}
      </p>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Check, Copy, Plus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import TotpGenerator from './TotpGenerator.vue'
import {
  ALGORITHMS,
  DEFAULT_ALGORITHM,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  DIGITS_OPTIONS,
  PERIOD_OPTIONS,
  buildOtpauthUri,
  clearRememberedEntries,
  counterAt,
  decodeBase32,
  encodeBase32,
  entryLabel,
  generateTotp,
  loadRememberedEntries,
  newEntryId,
  parseOtpauthUri,
  remainingSeconds,
  saveRememberedEntries,
} from './totp'
import type { OtpauthParseError, TotpEntry } from './totp'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'totp-generator',
  name: 'TOTP 验证器',
  description: '基于 RFC 6238 生成时序一次性验证码，多账号管理，纯本地零依赖',
  category: 'security',
  icon: 'Timer',
  component: TotpGenerator,
  keywords: ['totp', '2fa', '两步验证', 'otp', '验证码', 'authenticator', 'otpauth', '动态口令'],
}

/* ---------- 添加条目 ---------- */

const secretInput = ref('')
const issuerInput = ref('')
const accountInput = ref('')
const addError = ref('')

const ADD_ERROR_KEYS: Record<OtpauthParseError, string> = {
  'not-otpauth': 'totpGenerator.errorBadUri',
  'no-secret': 'totpGenerator.errorNoSecret',
  'invalid-secret': 'totpGenerator.errorInvalidSecretParam',
  'invalid-params': 'totpGenerator.errorInvalidParams',
}

function addEntry(): void {
  const input = secretInput.value.trim()
  if (input.length === 0) {
    addError.value = t('totpGenerator.errorEmptySecret')
    return
  }
  addError.value = ''
  if (input.toLowerCase().startsWith('otpauth://')) {
    const parsed = parseOtpauthUri(input)
    if (!parsed.ok) {
      addError.value = t(ADD_ERROR_KEYS[parsed.reason])
      return
    }
    const { issuer, account, secret, algorithm, digits, period } = parsed.params
    entries.value.push({
      id: newEntryId(),
      issuer,
      account,
      secret,
      algorithm,
      digits,
      period,
      remember: false, // 默认不持久化：条目仅会话内有效
    })
  } else {
    const decoded = decodeBase32(input)
    if (!decoded.ok) {
      addError.value = t('totpGenerator.errorInvalidChars', { chars: decoded.invalidChars.join(' ') })
      return
    }
    entries.value.push({
      id: newEntryId(),
      issuer: issuerInput.value.trim(),
      account: accountInput.value.trim(),
      secret: encodeBase32(decoded.bytes),
      algorithm: DEFAULT_ALGORITHM,
      digits: DEFAULT_DIGITS,
      period: DEFAULT_PERIOD,
      remember: false,
    })
  }
  secretInput.value = ''
  issuerInput.value = ''
  accountInput.value = ''
}

/* ---------- 条目状态 ---------- */

const entries = ref<TotpEntry[]>([])
const rememberedCount = computed(() => entries.value.filter((e) => e.remember).length)

function removeEntry(id: string): void {
  entries.value = entries.value.filter((e) => e.id !== id)
}

function onRememberChange(): void {
  // opt-in 即时落盘；取消勾选即移除持久化
  saveRememberedEntries(entries.value)
}

function clearAllRemembered(): void {
  clearRememberedEntries()
  entries.value = entries.value.filter((e) => !e.remember)
}

// 持久化口径：仅 remember=true 条目入库；条目增删与参数变化同步
watch(
  entries,
  () => saveRememberedEntries(entries.value),
  { deep: true },
)

onMounted(() => {
  entries.value = loadRememberedEntries()
})

/* ---------- 时效码：时间驱动轮换 + 参数变更立即重算（生成类非实时的显式豁免） ---------- */

const now = ref(Math.floor(Date.now() / 1000))
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Math.floor(Date.now() / 1000)
  }, 250)
})

onUnmounted(() => {
  if (timer !== undefined) window.clearInterval(timer)
})

const currentCodes = ref<Record<string, string>>({})
const nextCodes = ref<Record<string, string>>({})
const remainingByEntry = ref<Record<string, number>>({})

// 缓存每个条目上次计算的 counter+参数签名：仅在换窗或参数变更时重算 HMAC
const lastComputed = ref<Record<string, string>>({})

function paramsSignature(entry: TotpEntry): string {
  return `${entry.secret}|${entry.algorithm}|${entry.digits}|${entry.period}`
}

async function recomputeCodes(force: boolean): Promise<void> {
  const current: Record<string, string> = { ...currentCodes.value }
  const next: Record<string, string> = { ...nextCodes.value }
  const remaining: Record<string, number> = { ...remainingByEntry.value }
  const signatures: Record<string, string> = {}
  for (const entry of entries.value) {
    const counter = counterAt(now.value, entry.period)
    remaining[entry.id] = remainingSeconds(now.value, entry.period)
    const signature = `${counter}|${paramsSignature(entry)}`
    signatures[entry.id] = signature
    if (!force && lastComputed.value[entry.id] === signature) continue
    const secretBytes = decodeBase32(entry.secret)
    if (!secretBytes.ok) continue
    current[entry.id] = await generateTotp({
      secretBytes: secretBytes.bytes,
      unixSeconds: now.value,
      algorithm: entry.algorithm,
      digits: entry.digits,
      period: entry.period,
    })
    next[entry.id] = await generateTotp({
      secretBytes: secretBytes.bytes,
      unixSeconds: (counter + 1) * entry.period, // 下一窗口码（±1 窗口只展示下一码，不做历史回看）
      algorithm: entry.algorithm,
      digits: entry.digits,
      period: entry.period,
    })
  }
  lastComputed.value = signatures
  currentCodes.value = current
  nextCodes.value = next
  remainingByEntry.value = remaining
}

// 周期滚动自动换码（时间驱动）；参数变更经 signature 变化立即重算
watch(now, () => void recomputeCodes(false))
watch(entries, () => void recomputeCodes(true), { deep: true })
onMounted(() => void recomputeCodes(true))

/** 进度环：剩余秒占比（30 与 60 两档各自真实周期）；环随时间推移耗尽，边界处换码。 */
function ringStyle(entry: TotpEntry): Record<string, string> {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const remaining = remainingByEntry.value[entry.id] ?? 0
  const fractionRemaining = entry.period > 0 ? Math.min(1, remaining / entry.period) : 0
  return {
    strokeDasharray: `${circumference}`,
    strokeDashoffset: `${circumference * (1 - fractionRemaining)}`,
  }
}

/* ---------- 复制 ---------- */

const uriCopiedId = ref('')
const codeCopiedId = ref('')
let uriTimer: ReturnType<typeof setTimeout> | undefined
let codeTimer: ReturnType<typeof setTimeout> | undefined

async function copyUri(entry: TotpEntry): Promise<void> {
  await navigator.clipboard.writeText(buildOtpauthUri(entry))
  clearTimeout(uriTimer)
  uriCopiedId.value = entry.id
  uriTimer = setTimeout(() => {
    uriCopiedId.value = ''
  }, 1500)
}

async function copyCode(entry: TotpEntry): Promise<void> {
  const code = currentCodes.value[entry.id]
  if (!code) return
  await navigator.clipboard.writeText(code)
  clearTimeout(codeTimer)
  codeCopiedId.value = entry.id
  codeTimer = setTimeout(() => {
    codeCopiedId.value = ''
  }, 1500)
}
</script>

<style scoped>
.totp-tool {
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

.controls-row {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.controls-row .control {
  flex: 1;
  min-width: 180px;
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

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-quaternary);
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

.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  padding: var(--space-lg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  text-align: center;
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.entry {
  padding: var(--space-md);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.entry-label {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 510;
  overflow-wrap: anywhere;
}

.entry-body {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  margin-top: var(--space-md);
  flex-wrap: wrap;
}

.code-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.code {
  font-family: var(--font-mono);
  font-size: 32px;
  letter-spacing: 0.1em;
  color: var(--text-primary);
  font-weight: 590;
}

.ring-wrap {
  position: relative;
  width: 60px;
  height: 60px;
  flex-shrink: 0;
}

.ring {
  width: 60px;
  height: 60px;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: var(--border);
  stroke-width: 4;
}

.ring-fg {
  fill: none;
  stroke: var(--accent);
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke-dashoffset 250ms linear;
}

.remaining {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.next {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.next-label {
  font-size: 11px;
  color: var(--text-quaternary);
}

.next-code {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-quaternary);
  letter-spacing: 0.1em;
}

.entry-controls {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
  margin-top: var(--space-md);
  flex-wrap: wrap;
}

.inline-control {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inline-label {
  font-size: 11px;
  color: var(--text-quaternary);
}

.select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: 2px var(--space-sm);
  outline: none;
  cursor: pointer;
}

.remember-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  cursor: pointer;
}

.remember-row input {
  margin-top: 2px;
  accent-color: var(--accent);
}

.remember-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}

.remember-warning {
  color: var(--warning);
}

.remembered-banner {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--warning);
  border-radius: var(--radius-md);
  color: var(--warning);
  font-size: 12px;
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
