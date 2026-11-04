<template>
  <ToolLayout :tool="toolMeta">
    <div class="bip39-tool">
      <!-- 生成区：非实时——档位只影响下一次生成，显式按钮触发 -->
      <section class="panel">
        <h2 class="section-title">{{ t('bip39.generateTitle') }}</h2>

        <div class="control">
          <span class="label">{{ t('bip39.wordCountLabel') }}</span>
          <div class="strength-row" role="group" :aria-label="t('bip39.wordCountLabel')">
            <button
              v-for="count in WORD_COUNT_OPTIONS"
              :key="count"
              class="strength-btn"
              :class="{ active: selectedCount === count }"
              type="button"
              :data-test="`bip39-strength-${count}`"
              :aria-pressed="selectedCount === count"
              @click="selectedCount = count"
            >
              {{ t('bip39.wordCountOption', { count: String(count) }) }}
            </button>
          </div>
          <p class="hint">
            {{ t('bip39.strengthHint', { entropy: String(strength), checksum: String(strength / 32) }) }}
          </p>
        </div>

        <div class="actions">
          <button class="btn primary" type="button" data-test="bip39-generate" @click="generate">
            <RefreshCw :size="15" />
            {{ generated ? t('bip39.regenerate') : t('bip39.generate') }}
          </button>
        </div>

        <!-- 助记词：敏感呈现，默认遮蔽、点击显示（对照 TOTP 先例）；每次生成重置为隐藏 -->
        <div v-if="generated" class="mnemonic-box" data-test="bip39-mnemonic">
          <template v-if="revealed">
            <ol class="words">
              <li v-for="(word, i) in generatedWords" :key="i" class="word">
                <span class="word-idx">{{ i + 1 }}</span>
                <span class="word-text">{{ word }}</span>
              </li>
            </ol>
          </template>
          <div v-else class="masked">
            <span v-for="i in generatedWords.length" :key="i" class="mask-chip" aria-hidden="true">
              ••••
            </span>
            <span class="masked-hint">{{ t('bip39.maskedHint') }}</span>
          </div>
          <div class="mnemonic-actions">
            <button class="btn small" type="button" data-test="bip39-reveal" @click="toggleReveal">
              <Eye v-if="!revealed" :size="14" />
              <EyeOff v-else :size="14" />
              {{ revealed ? t('bip39.hide') : t('bip39.reveal') }}
            </button>
            <button class="btn small" type="button" data-test="bip39-copy" @click="copyMnemonic">
              <Check v-if="copied === 'mnemonic'" :size="14" />
              <Copy v-else :size="14" />
              {{ copied === 'mnemonic' ? t('bip39.copied') : t('bip39.copy') }}
            </button>
          </div>
        </div>

        <!-- 熵 hex：只读可折叠展示（不做 entropy 可编辑双向） -->
        <div v-if="generated" class="entropy">
          <button class="btn small" type="button" data-test="bip39-entropy-toggle" @click="showEntropy = !showEntropy">
            <ChevronRight v-if="!showEntropy" :size="14" />
            <ChevronDown v-else :size="14" />
            {{ showEntropy ? t('bip39.entropyHide') : t('bip39.entropyShow') }}
          </button>
          <div v-if="showEntropy" class="entropy-body">
            <span class="label">{{ t('bip39.entropyLabel') }}</span>
            <code class="mono" data-test="bip39-entropy">{{ generated.entropyHex }}</code>
          </div>
        </div>
      </section>

      <!-- 校验区：独立区块，实时防抖 300ms；结构化错误清单 -->
      <section class="panel">
        <h2 class="section-title">{{ t('bip39.verifyTitle') }}</h2>
        <textarea
          v-model="verifyInput"
          class="textarea mono"
          data-test="bip39-verify-input"
          :placeholder="t('bip39.verifyPlaceholder')"
          rows="3"
          spellcheck="false"
          autocomplete="off"
          @input="onVerifyInput"
        />
        <p class="hint">{{ t('bip39.verifyHint') }}</p>

        <div v-if="verifyResult" class="verify-result" data-test="bip39-verify-result">
          <div v-if="verifyResult.valid" class="verify-ok">
            <div class="badges">
              <span class="badge ok">{{ t('bip39.validBadge') }}</span>
              <span class="meta">{{ t('bip39.entropyInfo', { count: String(verifyResult.wordCount), bits: String(verifyResult.entropyBits) }) }}</span>
            </div>
            <div class="entropy-body">
              <span class="label">{{ t('bip39.entropyHexLabel') }}</span>
              <code class="mono" data-test="bip39-verify-entropy">{{ verifyResult.entropyHex }}</code>
            </div>
          </div>
          <div v-else class="verify-bad">
            <span class="badge bad">{{ t('bip39.invalidBadge') }}</span>
            <ul class="error-items">
              <li v-for="(e, i) in verifyResult.errors" :key="i" class="error-item" data-test="bip39-verify-error">
                {{ errorText(e) }}
              </li>
            </ul>
          </div>
        </div>
        <p v-else class="empty">{{ t('bip39.verifyEmpty') }}</p>
      </section>

      <!-- seed 派生区：按钮触发（2048 轮 KDF）；源为校验区助记词 -->
      <section class="panel">
        <h2 class="section-title">{{ t('bip39.seedTitle') }}</h2>
        <p class="hint">{{ t('bip39.seedHint') }}</p>

        <div class="control">
          <label class="label" for="bip39-passphrase">{{ t('bip39.passphraseLabel') }}</label>
          <input
            id="bip39-passphrase"
            v-model="passphrase"
            class="text-input"
            type="text"
            data-test="bip39-passphrase"
            :placeholder="t('bip39.passphrasePlaceholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <p class="hint">{{ t('bip39.passphraseHint') }}</p>
        </div>

        <div class="actions">
          <button
            class="btn primary"
            type="button"
            data-test="bip39-derive"
            :disabled="!canDerive || deriving"
            @click="derive"
          >
            <KeyRound :size="15" />
            {{ deriving ? t('bip39.deriving') : t('bip39.derive') }}
          </button>
        </div>
        <p v-if="!canDerive" class="hint">{{ t('bip39.deriveBlocked') }}</p>

        <div v-if="derivedSeed" class="seed-box">
          <div class="badges">
            <span class="label">{{ t('bip39.seedLabel') }}</span>
            <span v-if="seedStale" class="stale" data-test="bip39-seed-stale">
              <TriangleAlert :size="13" />
              {{ t('bip39.seedStale') }}
            </span>
          </div>
          <code class="mono seed-hex" data-test="bip39-seed">{{ derivedSeed.hex }}</code>
          <div class="actions">
            <button class="btn small" type="button" data-test="bip39-seed-copy" @click="copySeed">
              <Check v-if="copied === 'seed'" :size="14" />
              <Copy v-else :size="14" />
              {{ copied === 'seed' ? t('bip39.seedCopied') : t('bip39.seedCopy') }}
            </button>
          </div>
        </div>
      </section>

      <!-- 常驻声明：不持久化（严于 TOTP）+ 假助记词 ≠ 钱包安全 -->
      <p class="notice" data-test="bip39-notice">
        <ShieldCheck :size="14" />
        {{ t('bip39.notice') }}
      </p>
      <p class="warning" data-test="bip39-wallet-warning">
        <TriangleAlert :size="14" />
        {{ t('bip39.walletWarning') }}
      </p>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import Bip39Generator from './Bip39Generator.vue'
import {
  DEFAULT_WORD_COUNT,
  DEBOUNCE_MS,
  WORD_COUNT_OPTIONS,
  derivationSignature,
  deriveSeedHex,
  generateMnemonicByWordCount,
  strengthForWordCount,
  validateMnemonicPhrase,
} from './bip39'
import type { Bip39Error, Bip39Validation, GeneratedMnemonic, WordCount } from './bip39'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'bip39-generator',
  name: 'BIP39 助记词',
  description: '生成与校验 BIP39 助记词（英文词表），可派生 seed',
  category: 'security',
  icon: 'KeyRound',
  component: Bip39Generator,
  keywords: ['bip39', 'mnemonic', '助记词', '词库', 'seed'],
}

/* ---------- 生成区（非实时：控制只影响下一次生成） ---------- */

const selectedCount = ref<WordCount>(DEFAULT_WORD_COUNT)
const strength = computed(() => strengthForWordCount(selectedCount.value))

const generated = ref<GeneratedMnemonic | null>(null)
const revealed = ref(false)
const showEntropy = ref(false)

const generatedWords = computed(() => (generated.value ? generated.value.mnemonic.split(' ') : []))

async function generate(): Promise<void> {
  generated.value = await generateMnemonicByWordCount(selectedCount.value)
  // 敏感呈现：新生成的一段秘密默认回到隐藏态
  revealed.value = false
}

function toggleReveal(): void {
  revealed.value = !revealed.value
}

/* ---------- 校验区（实时防抖 300ms） ---------- */

const verifyInput = ref('')
const debouncedVerify = ref('')
const verifyResult = ref<Bip39Validation | null>(null)

let debounceTimer: number | undefined
// 异步校验的时序令牌：防抖后最新一次输入胜出
let verifyToken = 0

function onVerifyInput(): void {
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debounceTimer = undefined
    debouncedVerify.value = verifyInput.value
  }, DEBOUNCE_MS)
}

watch(debouncedVerify, () => void runVerify())
onUnmounted(() => {
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
})

async function runVerify(): Promise<void> {
  const text = debouncedVerify.value
  const token = ++verifyToken
  if (text.trim() === '') {
    verifyResult.value = null
    return
  }
  const result = await validateMnemonicPhrase(text)
  if (token === verifyToken) verifyResult.value = result
}

function errorText(e: Bip39Error): string {
  switch (e.code) {
    case 'wordCount':
      return t('bip39.errors.wordCount', { count: String(e.count ?? 0) })
    case 'unknownWord':
      return t('bip39.errors.unknownWord', { index: String(e.index ?? 0), word: e.word ?? '' })
    case 'checksum':
      return t('bip39.errors.checksum')
    default:
      return t('bip39.errors.internal', { message: e.message ?? '' })
  }
}

/* ---------- seed 派生区（按钮触发；变更后旧 seed 标记失效） ---------- */

const passphrase = ref('')
const deriving = ref(false)
const derivedSeed = ref<{ hex: string; signature: string } | null>(null)

/** 校验区当前结果通过 → 才允许派生（形状非法的助记词无法进 KDF）。 */
const canDerive = computed(() => verifyResult.value?.valid === true)

/** 助记词/passphrase 任一变更（对照派生时的签名）→ 旧 seed 失效标记。 */
const seedStale = computed(
  () =>
    derivedSeed.value !== null &&
    derivationSignature(verifyInput.value, passphrase.value) !== derivedSeed.value.signature,
)

async function derive(): Promise<void> {
  if (!canDerive.value || deriving.value) return
  deriving.value = true
  try {
    const signature = derivationSignature(verifyInput.value, passphrase.value)
    const hex = await deriveSeedHex(verifyInput.value, passphrase.value)
    derivedSeed.value = { hex, signature }
  } finally {
    deriving.value = false
  }
}

/* ---------- 复制（1.5s 反馈，沿 TOTP 先例） ---------- */

const copied = ref<'mnemonic' | 'seed' | ''>('')
let copiedTimer: number | undefined

async function copyText(text: string, tag: 'mnemonic' | 'seed'): Promise<void> {
  await navigator.clipboard.writeText(text)
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  copied.value = tag
  copiedTimer = window.setTimeout(() => {
    copied.value = ''
  }, 1500)
}

onUnmounted(() => {
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
})

function copyMnemonic(): void {
  if (generated.value) void copyText(generated.value.mnemonic, 'mnemonic')
}

function copySeed(): void {
  if (derivedSeed.value) void copyText(derivedSeed.value.hex, 'seed')
}
</script>

<style scoped>
.bip39-tool {
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

.control {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-quaternary);
}

.strength-row {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.strength-btn {
  padding: var(--space-xs) var(--space-md);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.strength-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.strength-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
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

.btn.primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn.small {
  padding: var(--space-xs) var(--space-sm);
  font-size: 12px;
  flex-shrink: 0;
}

.mnemonic-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.words {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-xs) var(--space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}

.word {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.word-idx {
  font-size: 11px;
  color: var(--text-quaternary);
  font-variant-numeric: tabular-nums;
  min-width: 18px;
  text-align: right;
}

.word-text {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-primary);
}

.masked {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.mask-chip {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-quaternary);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
}

.masked-hint {
  font-size: 12px;
  color: var(--text-quaternary);
}

.mnemonic-actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.entropy {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.entropy-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.mono {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.textarea {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
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

.verify-result {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.badges {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
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

.meta {
  font-size: 12px;
  color: var(--text-tertiary);
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
}

.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  padding: var(--space-md);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  text-align: center;
  margin: 0;
}

.seed-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.stale {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 12px;
  color: var(--warning);
}

.seed-hex {
  font-size: 12px;
  line-height: 1.6;
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: 12px;
  color: var(--text-quaternary);
}

.warning {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: 12px;
  color: var(--warning);
}
</style>
