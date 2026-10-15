<template>
  <ToolLayout :tool="toolMeta">
    <div class="jwt-tool">
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

      <p class="notice">
        <Lock :size="14" />
        {{ t('jwtVerifier.localNotice') }}
      </p>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Braces, Lock, ShieldCheck, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import { decodeJwt, verifyJwt } from './jwt'
import type { JwtDecodeErrorCode, JwtDecodeResult } from './jwt'
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

const toolMeta: ToolMeta = {
  id: 'jwt-verifier',
  name: 'JWT 解码/验签',
  description: '本地解码 JWT 并使用 HS256、RS256、ES256 验签',
  category: 'encode',
  icon: 'ShieldCheck',
  component: JwtVerifier,
  keywords: ['jwt', 'token', 'decode', 'verify', 'hs256', 'rs256', 'es256', '验签']
}

const { t } = useI18n()
const token = ref('')
const keyInput = ref('')
const decodeResult = ref<JwtDecodeResult | null>(null)
const verifying = ref(false)
const verification = ref<{ ok: true; valid: boolean } | { ok: false; reason: 'unsupported-alg' | 'invalid-key' | 'unexpected' } | null>(null)

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
</script>

<style scoped>
.jwt-tool {
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

.json {
  padding: var(--space-md);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.actions,
.status-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.status-bar {
  justify-content: space-between;
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
