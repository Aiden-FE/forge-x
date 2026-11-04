<template>
  <ToolLayout :tool="toolMeta">
    <div class="keypair-generator">
      <!-- 生成类非实时：控制只影响下一次生成，已展示的密钥保持不变。 -->
      <div class="controls">
        <div class="control-group" role="radiogroup" :aria-label="t('keypairGenerator.algoLabel')">
          <span class="label">{{ t('keypairGenerator.algoLabel') }}</span>
          <label class="radio">
            <input v-model="family" type="radio" name="kp-family" value="rsa" data-test="kp-algo-rsa" />
            <span>{{ t('keypairGenerator.rsa') }}</span>
          </label>
          <label class="radio">
            <input v-model="family" type="radio" name="kp-family" value="ec" data-test="kp-algo-ec" />
            <span>{{ t('keypairGenerator.ec') }}</span>
          </label>
        </div>

        <div
          v-if="family === 'rsa'"
          class="control-group"
          role="radiogroup"
          :aria-label="t('keypairGenerator.bitsLabel')"
        >
          <span class="label">{{ t('keypairGenerator.bitsLabel') }}</span>
          <label v-for="tier in RSA_BITS_TIERS" :key="tier" class="radio">
            <input
              v-model="rsaBits"
              type="radio"
              name="kp-bits"
              :value="tier"
              :data-test="`kp-bits-${tier}`"
            />
            <span>RSA {{ tier }}</span>
          </label>
        </div>

        <div v-else class="control-group" role="radiogroup" :aria-label="t('keypairGenerator.curveLabel')">
          <span class="label">{{ t('keypairGenerator.curveLabel') }}</span>
          <label v-for="tier in EC_CURVE_TIERS" :key="tier" class="radio">
            <input
              v-model="ecCurve"
              type="radio"
              name="kp-curve"
              :value="tier"
              :data-test="`kp-curve-${tier}`"
            />
            <span>{{ EC_CURVE_NAMES[tier] }}</span>
          </label>
        </div>

        <div class="control-group">
          <span class="label">{{ t('keypairGenerator.jwtAlgLabel') }}</span>
          <code class="alg-badge" data-test="kp-jwt-alg">{{ currentProfile.jwtAlg }}</code>
        </div>
      </div>

      <div class="actions">
        <button class="btn primary" data-test="kp-generate" :disabled="pending" @click="generate">
          <KeyRound :size="16" />
          {{ t('keypairGenerator.generate') }}
        </button>
        <span v-if="pending" class="pending" data-test="kp-pending">
          <LoaderCircle class="spin" :size="14" />
          {{ t('keypairGenerator.pending') }}
        </span>
        <span v-else-if="elapsedLabel" class="elapsed" data-test="kp-elapsed">{{ elapsedLabel }}</span>
        <span v-if="failed" class="error" data-test="kp-error">{{ t('keypairGenerator.error') }}</span>
      </div>

      <div v-if="result" class="panel">
        <div class="panel-head">
          <label class="label" for="kp-private">{{ t('keypairGenerator.privateLabel') }}</label>
          <code class="alg-tag" data-test="kp-private-alg">{{ result.jwtAlg }}</code>
        </div>
        <textarea
          id="kp-private"
          class="textarea"
          readonly
          rows="10"
          spellcheck="false"
          data-test="kp-private"
          :value="result.privateKeyPem"
        />
        <div class="actions">
          <button class="btn" data-test="kp-copy-private" :disabled="!result" @click="copyPrivate">
            <Check v-if="copiedPrivate" :size="16" />
            <Copy v-else :size="16" />
            {{ copiedPrivate ? t('keypairGenerator.copied') : t('keypairGenerator.copy') }}
          </button>
          <button class="btn" data-test="kp-download-private" :disabled="!result" @click="downloadPrivate">
            <Download :size="16" />
            {{ t('keypairGenerator.download') }}
          </button>
        </div>
        <p class="hint warning" data-test="kp-private-warning">
          <ShieldAlert :size="14" />
          {{ t('keypairGenerator.privateHint') }}
        </p>
      </div>

      <div v-if="result" class="panel">
        <div class="panel-head">
          <label class="label" for="kp-public">{{ t('keypairGenerator.publicLabel') }}</label>
          <code class="alg-tag" data-test="kp-public-alg">{{ result.jwtAlg }}</code>
        </div>
        <textarea
          id="kp-public"
          class="textarea"
          readonly
          rows="8"
          spellcheck="false"
          data-test="kp-public"
          :value="result.publicKeyPem"
        />
        <div class="actions">
          <button class="btn" data-test="kp-copy-public" :disabled="!result" @click="copyPublic">
            <Check v-if="copiedPublic" :size="16" />
            <Copy v-else :size="16" />
            {{ copiedPublic ? t('keypairGenerator.copied') : t('keypairGenerator.copy') }}
          </button>
          <button class="btn" data-test="kp-download-public" :disabled="!result" @click="downloadPublic">
            <Download :size="16" />
            {{ t('keypairGenerator.download') }}
          </button>
        </div>
      </div>

      <!-- 常驻声明：纯本地生成、不持久化、仅内存级（票据口径，不可折叠）。 -->
      <p class="notice" data-test="kp-local-notice">
        <Lock :size="14" />
        {{ t('keypairGenerator.localNotice') }}
      </p>

      <!-- 折叠帮助区：形态/档位说明 + 单向导流 jwt-verifier。 -->
      <div class="help">
        <button
          class="btn"
          data-test="kp-help-toggle"
          :aria-expanded="helpOpen"
          @click="helpOpen = !helpOpen"
        >
          <CircleHelp :size="16" />
          {{ helpOpen ? t('keypairGenerator.help.hide') : t('keypairGenerator.help.show') }}
        </button>
        <div v-if="helpOpen" class="help-body" data-test="kp-help">
          <p class="help-title">{{ t('keypairGenerator.help.title') }}</p>
          <p class="notice">{{ t('keypairGenerator.help.pemForms') }}</p>
          <p class="notice">{{ t('keypairGenerator.help.tiers') }}</p>
          <p class="notice">{{ t('keypairGenerator.help.closure') }}</p>
          <p class="related">
            {{ t('keypairGenerator.help.relatedTitle') }}
            <a href="#/tool/jwt-verifier">{{ t('keypairGenerator.help.relatedJwt') }}</a>
          </p>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Check,
  CircleHelp,
  Copy,
  Download,
  KeyRound,
  LoaderCircle,
  Lock,
  ShieldAlert,
} from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import KeypairGenerator from './KeypairGenerator.vue'
import {
  EC_CURVE_TIERS,
  EC_CURVE_NAMES,
  PRIVATE_KEY_FILENAME,
  PUBLIC_KEY_FILENAME,
  RSA_BITS_TIERS,
  formatElapsedMs,
  generateKeypair,
  resolveProfile,
} from './keypair'
import type { EcCurveTier, GeneratedKeypair, KeypairFamily, RsaBitsTier } from './keypair'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'keypair-generator',
  name: '密钥对生成器',
  description: '生成 RSA / EC 密钥对（PKCS#8 与 SPKI PEM），可衔接 JWT 签发验签',
  category: 'security',
  icon: 'KeyRound',
  component: KeypairGenerator,
  keywords: ['rsa', 'ec', 'keypair', 'key', 'pem', '密钥对', '公钥', '私钥'],
}

const family = ref<KeypairFamily>('rsa')
const rsaBits = ref<RsaBitsTier>('2048')
const ecCurve = ref<EcCurveTier>('p256')

const pending = ref(false)
const failed = ref(false)
const elapsedMs = ref<number | null>(null)
const result = ref<GeneratedKeypair | null>(null)
const copiedPrivate = ref(false)
const copiedPublic = ref(false)
const helpOpen = ref(false)

const currentProfile = computed(() =>
  family.value === 'rsa'
    ? resolveProfile('rsa', rsaBits.value)
    : resolveProfile('ec', ecCurve.value),
)

const elapsedLabel = computed(() =>
  elapsedMs.value === null
    ? ''
    : t('keypairGenerator.elapsed', { value: formatElapsedMs(elapsedMs.value) }),
)

async function generate() {
  if (pending.value) return
  pending.value = true
  failed.value = false
  try {
    // performance.now 计时：RSA 4096 原生异步生成可达数十秒，UI 不冻结。
    const start = performance.now()
    const pair = await generateKeypair(currentProfile.value.id)
    elapsedMs.value = performance.now() - start
    result.value = pair
  } catch {
    failed.value = true // 失败只错该处：保留上一次输出
  } finally {
    pending.value = false
  }
}

/* ---------------- output actions ---------------- */

function flashCopied(which: 'private' | 'public') {
  const flag = which === 'private' ? copiedPrivate : copiedPublic
  flag.value = true
  setTimeout(() => {
    flag.value = false
  }, 1500)
}

function copyPrivate() {
  if (!result.value) return
  void navigator.clipboard.writeText(result.value.privateKeyPem)
  flashCopied('private')
}

function copyPublic() {
  if (!result.value) return
  void navigator.clipboard.writeText(result.value.publicKeyPem)
  flashCopied('public')
}

function downloadPrivate() {
  if (!result.value) return
  downloadPem(result.value.privateKeyPem, PRIVATE_KEY_FILENAME)
}

function downloadPublic() {
  if (!result.value) return
  downloadPem(result.value.publicKeyPem, PUBLIC_KEY_FILENAME)
}

function downloadPem(pem: string, fileName: string) {
  const blob = new Blob([pem], { type: 'application/x-pem-file;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<style scoped>
.keypair-generator {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.controls {
  display: flex;
  align-items: flex-end;
  gap: var(--space-xl);
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
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
  cursor: pointer;
}

.alg-badge {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: var(--space-xs) var(--space-sm);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.alg-tag {
  color: var(--text-quaternary);
  font-family: var(--font-mono);
  font-size: 12px;
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

.actions {
  display: flex;
  align-items: center;
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
  color: var(--bg-card);
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.08);
  color: var(--bg-card);
}

.pending {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 12px;
  color: var(--text-tertiary);
}

.elapsed {
  font-size: 12px;
  color: var(--text-tertiary);
}

.spin {
  animation: kp-spin 1s linear infinite;
}

@keyframes kp-spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  color: var(--error);
  font-size: 13px;
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.hint.warning {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--warning);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-quaternary);
  font-size: 12px;
  margin: 0;
}

.help {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.help-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.help-title {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
  margin: 0;
}

.related {
  color: var(--text-tertiary);
  font-size: 12px;
  margin: 0;
}

.related a {
  color: var(--accent);
  text-decoration: none;
}

.related a:hover {
  text-decoration: underline;
}
</style>
