<template>
  <ToolLayout :tool="toolMeta">
    <div class="jwt-tool">
      <div class="tabs" role="tablist" data-test="jwt-tabs">
        <button
          role="tab"
          class="tab"
          :class="{ active: activeTab === 'verify' }"
          :aria-selected="activeTab === 'verify'"
          data-test="jwt-tab-verify"
          @click="activeTab = 'verify'"
        >
          <ShieldCheck :size="16" />
          {{ t('jwtVerifier.generate.tabs.verify') }}
        </button>
        <button
          role="tab"
          class="tab"
          :class="{ active: activeTab === 'generate' }"
          :aria-selected="activeTab === 'generate'"
          data-test="jwt-tab-generate"
          @click="activeTab = 'generate'"
        >
          <Wand2 :size="16" />
          {{ t('jwtVerifier.generate.tabs.generate') }}
        </button>
      </div>

      <div v-show="activeTab === 'verify'" role="tabpanel" class="pane">
        <div class="panel">
          <label class="label" for="jwt-token">{{ t('jwtVerifier.tokenLabel') }}</label>
          <textarea
            id="jwt-token"
            v-model="token"
            class="textarea"
            data-test="jwt-token"
            :placeholder="t('jwtVerifier.tokenPlaceholder')"
            rows="5"
            spellcheck="false"
          />
        </div>

        <div class="actions">
          <button class="btn primary" data-test="jwt-decode" @click="decode">
            <Braces :size="16" />
            {{ t('jwtVerifier.decode') }}
          </button>
          <button
            class="btn"
            data-test="jwt-clear"
            @click="clear"
          >
            <Trash2 :size="16" />
            {{ t('jwtVerifier.clear') }}
          </button>
        </div>

        <div class="panel">
          <label class="label" for="jwt-key">{{ t('jwtVerifier.keyLabel') }}</label>
          <textarea
            id="jwt-key"
            v-model="keyInput"
            class="textarea compact"
            data-test="jwt-key"
            :placeholder="t('jwtVerifier.keyPlaceholder')"
            rows="5"
            spellcheck="false"
          />
          <p class="hint">{{ t('jwtVerifier.keyHint') }}</p>
        </div>

        <div class="status-bar" data-test="jwt-status">
          <span v-if="verificationState === 'decode-only'" class="badge neutral">
            {{ t('jwtVerifier.onlyDecode') }}
          </span>
          <span v-else-if="verificationState === 'verifying'" class="badge neutral">
            {{ t('jwtVerifier.verifying') }}
          </span>
          <span v-else-if="verificationState === 'passed'" class="badge success">
            {{ t('jwtVerifier.verifyPass') }}
          </span>
          <span v-else-if="verificationState === 'failed'" class="badge error">
            {{ t('jwtVerifier.verifyFail') }}
          </span>
          <span v-else-if="verificationState === 'unsupported-alg'" class="badge error">
            {{ t('jwtVerifier.unsupported') }}
          </span>
          <span v-else-if="verificationState === 'invalid-key'" class="badge error">
            {{ t('jwtVerifier.invalidKey') }}
          </span>
          <span v-else-if="verificationState === 'unexpected'" class="badge error">
            {{ t('jwtVerifier.verifyUnexpected') }}
          </span>

          <button
            class="btn primary"
            data-test="jwt-verify"
            :disabled="!decodedToken || !keyInput.trim() || verifying"
            @click="verify"
          >
            <ShieldCheck :size="16" />
            {{ t('jwtVerifier.verify') }}
          </button>
        </div>

        <p v-if="decodeError" class="error" data-test="jwt-error">
          {{ decodeErrorMessage }}
        </p>

        <div v-if="decodedToken" class="results">
          <section class="panel">
            <div class="section-header">
              <h2>{{ t('jwtVerifier.header') }}</h2>
              <span v-if="tokenAlgorithm" class="algorithm">{{ tokenAlgorithm }}</span>
            </div>
            <pre class="json" data-test="jwt-header">{{ headerJson }}</pre>
          </section>
          <section class="panel">
            <h2>{{ t('jwtVerifier.payload') }}</h2>
            <pre class="json" data-test="jwt-payload">{{ payloadJson }}</pre>
          </section>
        </div>
      </div>

      <div v-show="activeTab === 'generate'" role="tabpanel" class="pane">
        <div class="panel">
          <label class="label" for="jwt-gen-header">{{ t('jwtVerifier.generate.headerLabel') }}</label>
          <textarea
            id="jwt-gen-header"
            v-model="store.headerText"
            class="textarea compact"
            data-test="jwt-gen-header"
            rows="4"
            spellcheck="false"
          />
          <p v-if="!headerParse.ok" class="error" data-test="jwt-gen-header-error">
            {{ t(headerParse.reason === 'json' ? 'jwtVerifier.generate.errors.headerJson' : 'jwtVerifier.generate.errors.headerObject') }}
          </p>
          <p class="hint">{{ t('jwtVerifier.generate.headerHint') }}</p>
        </div>

        <div class="panel">
          <label class="label" for="jwt-gen-payload">{{ t('jwtVerifier.generate.payloadLabel') }}</label>
          <textarea
            id="jwt-gen-payload"
            v-model="store.payloadText"
            class="textarea compact"
            data-test="jwt-gen-payload"
            :placeholder="t('jwtVerifier.generate.payloadPlaceholder')"
            rows="7"
            spellcheck="false"
          />
          <p v-if="!payloadParse.ok" class="error" data-test="jwt-gen-payload-error">
            {{ t(payloadParse.reason === 'json' ? 'jwtVerifier.generate.errors.payloadJson' : 'jwtVerifier.generate.errors.payloadObject') }}
          </p>
          <div class="time-helpers" data-test="jwt-gen-time-helpers">
            <span class="label">
              <Clock :size="14" />
              {{ t('jwtVerifier.generate.timeLabel') }}
            </span>
            <span class="claim">iat</span>
            <button
              class="btn small"
              data-test="jwt-gen-iat-now"
              :disabled="!payloadParse.ok"
              @click="applyTimePreset('iat', 'now')"
            >
              {{ t('jwtVerifier.generate.now') }}
            </button>
            <span class="claim">exp</span>
            <button
              class="btn small"
              data-test="jwt-gen-exp-now"
              :disabled="!payloadParse.ok"
              @click="applyTimePreset('exp', 'now')"
            >
              {{ t('jwtVerifier.generate.now') }}
            </button>
            <button
              class="btn small"
              data-test="jwt-gen-exp-1h"
              :disabled="!payloadParse.ok"
              @click="applyTimePreset('exp', 'plus-1h')"
            >
              {{ t('jwtVerifier.generate.plus1h') }}
            </button>
            <button
              class="btn small"
              data-test="jwt-gen-exp-24h"
              :disabled="!payloadParse.ok"
              @click="applyTimePreset('exp', 'plus-24h')"
            >
              {{ t('jwtVerifier.generate.plus24h') }}
            </button>
          </div>
        </div>

        <div class="panel">
          <label class="label" for="jwt-gen-alg">{{ t('jwtVerifier.generate.algorithmLabel') }}</label>
          <select
            id="jwt-gen-alg"
            v-model="store.algorithm"
            class="input"
            data-test="jwt-gen-alg"
          >
            <option value="HS256">{{ t('jwtVerifier.generate.algorithms.hs256') }}</option>
            <option value="RS256">{{ t('jwtVerifier.generate.algorithms.rs256') }}</option>
            <option value="ES256">{{ t('jwtVerifier.generate.algorithms.es256') }}</option>
          </select>
        </div>

        <div v-show="isHs256" class="panel">
          <label class="label" for="jwt-gen-secret">{{ t('jwtVerifier.generate.secretLabel') }}</label>
          <input
            id="jwt-gen-secret"
            v-model="store.secret"
            class="input"
            type="password"
            autocomplete="off"
            data-test="jwt-gen-secret"
            :placeholder="t('jwtVerifier.generate.secretPlaceholder')"
            spellcheck="false"
          />
          <p class="hint warning" data-test="jwt-gen-secret-warning">
            <ShieldAlert :size="14" />
            {{ t('jwtVerifier.generate.secretWarning') }}
          </p>
        </div>

        <div v-show="!isHs256" class="panel">
          <label class="label" for="jwt-gen-pem">{{ t('jwtVerifier.generate.pemLabel') }}</label>
          <textarea
            id="jwt-gen-pem"
            v-model="store.privateKeyPem"
            class="textarea compact"
            data-test="jwt-gen-pem"
            :placeholder="t('jwtVerifier.generate.pemPlaceholder')"
            rows="6"
            spellcheck="false"
          />
          <p
            v-if="pemLiveError"
            class="error"
            data-test="jwt-gen-pem-error"
          >{{ pemLiveError }}</p>
          <p class="hint">{{ t('jwtVerifier.generate.pemHint') }}</p>
          <p class="hint warning" data-test="jwt-gen-pem-warning">
            <ShieldAlert :size="14" />
            {{ t('jwtVerifier.generate.pemWarning') }}
          </p>
        </div>

        <div class="actions">
          <button class="btn primary" data-test="jwt-gen-run" :disabled="!canGenerate || generating" @click="generate">
            <Sparkles :size="16" />
            {{ t('jwtVerifier.generate.run') }}
          </button>
          <button class="btn" data-test="jwt-gen-clear" @click="resetGenerate">
            <Trash2 :size="16" />
            {{ t('jwtVerifier.generate.clear') }}
          </button>
        </div>

        <p v-if="generateError" class="error" data-test="jwt-gen-error">
          {{ generateErrorMessage }}
        </p>

        <div v-if="store.token" class="panel">
          <label class="label" for="jwt-gen-token">{{ t('jwtVerifier.generate.tokenLabel') }}</label>
          <pre id="jwt-gen-token" class="json" data-test="jwt-gen-token">{{ store.token }}</pre>
          <div class="actions">
            <button class="btn" data-test="jwt-gen-copy" @click="copyToken">
              <Check v-if="copied" :size="16" />
              <Copy v-else :size="16" />
              {{ copied ? t('jwtVerifier.generate.copied') : t('jwtVerifier.generate.copy') }}
            </button>
            <button v-if="isHs256" class="btn primary" data-test="jwt-gen-send" @click="sendToVerify">
              <ArrowRightLeft :size="16" />
              {{ t('jwtVerifier.generate.sendToVerify') }}
            </button>
            <button
              v-if="!isHs256 && lastPublicJwkJson"
              class="btn primary"
              data-test="jwt-gen-verify-public"
              @click="verifyWithPublicKey"
            >
              <ShieldCheck :size="16" />
              {{ t('jwtVerifier.generate.verifyWithPublicKey') }}
            </button>
          </div>
        </div>

        <p class="hint">{{ t('jwtVerifier.generate.hint') }}</p>
      </div>

      <p class="notice">
        <Lock :size="14" />
        {{ t('jwtVerifier.localNotice') }}
      </p>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ArrowRightLeft,
  Braces,
  Check,
  Clock,
  Copy,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import { applyJwtTimePreset, decodeJwt, generateJwt, parseJwtJsonObject, parsePemPrivateKey, verifyJwt } from './jwt'
import type {
  JwtDecodeErrorCode,
  JwtDecodeResult,
  JwtGenerateErrorCode,
  JwtSignAlgorithm,
  JwtTimeClaim,
  JwtTimePreset,
} from './jwt'
import { useJwtGenerateStore } from './generateStore'
import JwtVerifier from './JwtVerifier.vue'

type VerificationState =
  | 'idle'
  | 'decode-only'
  | 'verifying'
  | 'passed'
  | 'failed'
  | 'unsupported-alg'
  | 'invalid-key'
  | 'unexpected'

type ToolTab = 'verify' | 'generate'

const toolMeta: ToolMeta = {
  id: 'jwt-verifier',
  name: 'JWT 解码/验签',
  description: '本地解码 JWT 并使用 HS256、RS256、ES256 验签与签发（非对称走 PKCS#8 PEM）',
  category: 'encode',
  icon: 'ShieldCheck',
  component: JwtVerifier,
  keywords: ['jwt', 'token', 'decode', 'verify', 'generate', 'hs256', 'rs256', 'es256', 'pem', '非对称', '验签', '生成']
}

const { t } = useI18n()
const store = useJwtGenerateStore()
const activeTab = ref<ToolTab>('verify')
const token = ref('')
const keyInput = ref('')
const decodeResult = ref<JwtDecodeResult | null>(null)
const verifying = ref(false)
const verification = ref<{ ok: true; valid: boolean } | { ok: false; reason: 'unsupported-alg' | 'invalid-key' | 'unexpected' } | null>(null)
const generating = ref(false)
const generateError = ref<JwtGenerateErrorCode | null>(null)
const lastPublicJwkJson = ref('')
const copied = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | undefined

const decodedToken = computed(() => (decodeResult.value?.ok ? decodeResult.value : null))
const headerJson = computed(() => (decodedToken.value ? JSON.stringify(decodedToken.value.header, null, 2) : ''))
const payloadJson = computed(() => (decodedToken.value ? JSON.stringify(decodedToken.value.payload, null, 2) : ''))
const tokenAlgorithm = computed(() => {
  const algorithm = decodedToken.value?.header.alg
  return typeof algorithm === 'string' ? algorithm : ''
})

const verificationState = computed<VerificationState>(() => {
  if (!decodedToken.value) return 'idle'
  if (!keyInput.value.trim()) return 'decode-only'
  if (verifying.value) return 'verifying'
  if (!verification.value) return 'decode-only'
  if (verification.value.ok) return verification.value.valid ? 'passed' : 'failed'
  return verification.value.reason
})

const decodeError = computed(() => (decodeResult.value && !decodeResult.value.ok ? decodeResult.value.reason : ''))
const decodeErrorMessages: Record<JwtDecodeErrorCode, string> = {
  empty: 'jwtVerifier.errEmpty',
  'segment-count': 'jwtVerifier.errSegments',
  'empty-segment': 'jwtVerifier.errSegments',
  base64url: 'jwtVerifier.errBase64',
  json: 'jwtVerifier.errJson',
  'not-object': 'jwtVerifier.errNotObject',
}
const decodeErrorMessage = computed(() => t(decodeErrorMessages[decodeError.value as JwtDecodeErrorCode] ?? 'jwtVerifier.errJson'))

// 生成视图：header/payload 实时语法校验（非法即错误态、不产出）。
const headerParse = computed(() => parseJwtJsonObject(store.headerText))
const payloadParse = computed(() => parseJwtJsonObject(store.payloadText))
// 13 票非对称扩展：算法下拉决定密钥形态——HS256 用 secret，RS256/ES256 用 PKCS#8 PEM。
const isHs256 = computed(() => store.algorithm === 'HS256')
const pemParse = computed(() => parsePemPrivateKey(store.privateKeyPem))
const canGenerate = computed(() => {
  if (!headerParse.value.ok || !payloadParse.value.ok) return false
  return isHs256.value ? store.secret.trim().length > 0 : pemParse.value.ok
})
// PEM 非法输入只错该处：定位在 PEM 框的即时错误（不弹全局、不动已有 token）。
const pemLiveError = computed(() => {
  if (isHs256.value) return ''
  if (!store.privateKeyPem.trim()) return ''
  if (pemParse.value.ok) return ''
  const keys = { empty: 'pemEmpty', format: 'pemFormat', pkcs1: 'pemPkcs1', encrypted: 'pemEncrypted' } as const
  return t(`jwtVerifier.generate.errors.${keys[pemParse.value.reason]}`)
})
const generateErrorMessages: Record<JwtGenerateErrorCode, string> = {
  'empty-secret': 'jwtVerifier.generate.errors.secret',
  'header-json': 'jwtVerifier.generate.errors.headerJson',
  'header-not-object': 'jwtVerifier.generate.errors.headerObject',
  'payload-json': 'jwtVerifier.generate.errors.payloadJson',
  'payload-not-object': 'jwtVerifier.generate.errors.payloadObject',
  'pem-empty': 'jwtVerifier.generate.errors.pemEmpty',
  'pem-format': 'jwtVerifier.generate.errors.pemFormat',
  'pem-pkcs1': 'jwtVerifier.generate.errors.pemPkcs1',
  'pem-encrypted': 'jwtVerifier.generate.errors.pemEncrypted',
  'pem-import': 'jwtVerifier.generate.errors.pemImport',
}
const generateErrorMessage = computed(() => (generateError.value ? t(generateErrorMessages[generateError.value]) : ''))

watch(token, () => {
  decodeResult.value = null
  verification.value = null
})
watch(keyInput, () => {
  verification.value = null
})

function decode() {
  verification.value = null
  decodeResult.value = decodeJwt(token.value)
}

async function verify() {
  const decoded = decodedToken.value
  if (!decoded || !keyInput.value.trim()) return

  verifying.value = true
  try {
    const result = await verifyJwt(token.value, keyInput.value)
    verification.value = result.ok
      ? { ok: true, valid: result.valid }
      : {
          ok: false,
          reason: result.reason === 'verification-error' ? 'unexpected' : result.reason,
        }
  } catch {
    verification.value = { ok: false, reason: 'unexpected' }
  } finally {
    verifying.value = false
  }
}

function clear() {
  token.value = ''
  keyInput.value = ''
  decodeResult.value = null
  verification.value = null
}

// exp/iat 时间快捷：时钟取当下，写入 Unix 秒（CONTEXT.md：时间值以 Unix 秒计）。
function applyTimePreset(claim: JwtTimeClaim, preset: JwtTimePreset) {
  const parsed = payloadParse.value
  if (!parsed.ok) return

  generateError.value = null
  store.payloadText = JSON.stringify(
    applyJwtTimePreset(parsed.value, claim, preset, Date.now()),
    null,
    2,
  )
}

async function generate() {
  if (!canGenerate.value || generating.value) return

  generating.value = true
  try {
    const result = await generateJwt({
      headerText: store.headerText,
      payloadText: store.payloadText,
      algorithm: store.algorithm as JwtSignAlgorithm,
      secret: store.secret,
      privateKeyPem: store.privateKeyPem,
    })
    if (result.ok) {
      store.token = result.token
      // 非对称签发成功时缓存派生公钥（仅内存），供「用公钥验签」桥接。
      lastPublicJwkJson.value = result.publicJwkJson ?? ''
      generateError.value = null
    } else {
      store.token = ''
      lastPublicJwkJson.value = ''
      generateError.value = result.reason
    }
  } catch {
    // WebCrypto 签名在合法输入下不会失败；防御性兜底：不产出结果。
    store.token = ''
    lastPublicJwkJson.value = ''
  } finally {
    generating.value = false
  }
}

function resetGenerate() {
  store.reset()
  generateError.value = null
  lastPublicJwkJson.value = ''
  copied.value = false
  if (copyResetTimer !== undefined) clearTimeout(copyResetTimer)
}

async function copyToken() {
  if (!store.token) return
  try {
    await navigator.clipboard.writeText(store.token)
    copied.value = true
    if (copyResetTimer !== undefined) clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // Clipboard unavailable (e.g. unsupported context) — silently ignore.
  }
}

// 生成 → 验签闭环：把生成的 token 与同一 secret 送入验签视图并自动验签。
async function sendToVerify() {
  const generated = store.token
  const secret = store.secret.trim()
  if (!generated || !secret) return

  keyInput.value = secret
  token.value = generated
  activeTab.value = 'verify'
  // 等待既有 watcher 复位旧的解码/验签结果后再触发，避免被异步复位覆盖。
  await nextTick()
  decode()
  await verify()
}

// 13 票非对称闭环：签发成功后用派生公钥走既有验签区（展示签名有效）。
async function verifyWithPublicKey() {
  const generated = store.token
  const publicJwkJson = lastPublicJwkJson.value
  if (!generated || !publicJwkJson) return

  keyInput.value = publicJwkJson
  token.value = generated
  activeTab.value = 'verify'
  await nextTick()
  decode()
  await verify()
}
</script>

<style scoped>
.jwt-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.tabs {
  display: flex;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--border);
}

.tab {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

.pane {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.label,
.section-header h2,
.panel h2 {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.algorithm {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.textarea,
.input,
.json {
  margin: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
}

.textarea {
  padding: var(--space-md);
  resize: vertical;
  outline: none;
  transition: border-color var(--transition-fast);
}

.textarea.compact {
  min-height: 110px;
}

.textarea:focus {
  border-color: var(--border-focus);
}

.textarea::placeholder {
  color: var(--text-quaternary);
}

.input {
  padding: var(--space-sm) var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.input:focus {
  border-color: var(--border-focus);
}

.input::placeholder {
  color: var(--text-quaternary);
}

.json {
  padding: var(--space-md);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.actions,
.status-bar,
.time-helpers {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.status-bar {
  justify-content: space-between;
}

.time-helpers .label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.claim {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
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

.btn.small {
  padding: 4px var(--space-sm);
  font-size: 12px;
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.badge {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.badge.neutral {
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
}

.badge.success {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}

.badge.error {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 12%, transparent);
}

.hint,
.notice {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.hint.warning {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--error);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.error {
  margin: 0;
  color: var(--error);
  font-size: 13px;
}

.results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--space-lg);
}
</style>
