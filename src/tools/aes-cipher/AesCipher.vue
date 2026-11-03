<template>
  <ToolLayout :tool="toolMeta">
    <div class="aes-tool">
      <!-- 密钥：passphrase 派生 / raw key 粘贴；错误只错该输入框 -->
      <section class="panel">
        <h2 class="section-title">{{ t('aesCipher.keySectionTitle') }}</h2>

        <div class="segment-group" role="radiogroup" :aria-label="t('aesCipher.keySectionTitle')" data-test="ac-key-source">
          <label class="segment" :class="{ active: keySource === 'passphrase' }">
            <input v-model="keySource" type="radio" value="passphrase" data-test="ac-key-mode-passphrase" />
            {{ t('aesCipher.keySourcePassphrase') }}
          </label>
          <label class="segment" :class="{ active: keySource === 'raw' }">
            <input v-model="keySource" type="radio" value="raw" data-test="ac-key-mode-raw" />
            {{ t('aesCipher.keySourceRaw') }}
          </label>
        </div>

        <div v-if="keySource === 'passphrase'" class="control">
          <label class="label" for="ac-passphrase">{{ t('aesCipher.passphraseLabel') }}</label>
          <input
            id="ac-passphrase"
            v-model="passphrase"
            class="text-input"
            type="password"
            data-test="ac-passphrase"
            :placeholder="t('aesCipher.passphrasePlaceholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <p class="hint">{{ t('aesCipher.passphraseHint') }}</p>
        </div>

        <div v-else class="control">
          <label class="label" for="ac-rawkey">{{ t('aesCipher.rawKeyLabel') }}</label>
          <input
            id="ac-rawkey"
            v-model="rawKey"
            class="text-input"
            :class="{ invalid: rawKeyError }"
            type="text"
            data-test="ac-rawkey"
            :placeholder="t('aesCipher.rawKeyPlaceholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <p v-if="rawKeyError" class="error" data-test="ac-rawkey-error">{{ rawKeyError }}</p>
          <p v-else-if="rawKeyBits" class="hint" data-test="ac-rawkey-bits">
            {{ t('aesCipher.rawKeyBits', { bits: String(rawKeyBits) }) }}
          </p>
          <p class="hint">{{ t('aesCipher.rawKeyHint') }}</p>
        </div>

        <div class="control">
          <span class="label">{{ t('aesCipher.modeLabel') }}</span>
          <div class="segment-group" role="radiogroup" :aria-label="t('aesCipher.modeLabel')">
            <label class="segment" :class="{ active: mode === 'GCM' }">
              <input v-model="mode" type="radio" value="GCM" data-test="ac-mode-gcm" />
              {{ t('aesCipher.modeGcm') }}
            </label>
            <label class="segment" :class="{ active: mode === 'CBC' }">
              <input v-model="mode" type="radio" value="CBC" data-test="ac-mode-cbc" />
              {{ t('aesCipher.modeCbc') }}
            </label>
          </div>
          <p v-if="mode === 'GCM'" class="hint">{{ t('aesCipher.modeGcmHint') }}</p>
          <!-- CBC 常驻警示：无认证，密文可被篡改而不被察觉 -->
          <p v-else class="warn" data-test="ac-cbc-warning">{{ t('aesCipher.modeCbcWarning') }}</p>
        </div>
      </section>

      <!-- 加密：按钮触发非实时（KDF 数百毫秒 + 动作语义） -->
      <section class="panel">
        <div class="control">
          <label class="label" for="ac-plaintext">{{ t('aesCipher.plaintextLabel') }}</label>
          <textarea
            id="ac-plaintext"
            v-model="plaintext"
            class="textarea"
            data-test="ac-plaintext"
            :placeholder="t('aesCipher.plaintextPlaceholder')"
            rows="5"
          />
          <p v-if="plaintextTooLong" class="error" data-test="ac-plaintext-error">
            {{ t('aesCipher.plaintextTooLong', { bytes: String(plaintextBytes) }) }}
          </p>
        </div>

        <div class="actions">
          <button
            class="btn primary"
            type="button"
            data-test="ac-encrypt"
            :disabled="encryptBusy || plaintextTooLong"
            @click="encrypt"
          >
            <Lock :size="16" />
            {{ encryptBusy ? t('aesCipher.encrypting') : t('aesCipher.encrypt') }}
          </button>
        </div>

        <p v-if="encryptError" class="error" data-test="ac-encrypt-error">{{ encryptError }}</p>

        <div v-if="envelope" class="result">
          <label class="label">{{ t('aesCipher.envelopeLabel') }}</label>
          <div class="result-row">
            <code class="result-value" data-test="ac-envelope-output">{{ envelope }}</code>
            <button class="btn small" type="button" data-test="ac-copy-envelope" @click="copyEnvelope">
              <Check v-if="envelopeCopied" :size="14" />
              <Copy v-else :size="14" />
              {{ envelopeCopied ? t('aesCipher.copied') : t('aesCipher.copy') }}
            </button>
          </div>
        </div>
      </section>

      <!-- 解密：只认自家信封，模式由信封模式位自动识别 -->
      <section class="panel">
        <div class="control">
          <label class="label" for="ac-ciphertext">{{ t('aesCipher.ciphertextLabel') }}</label>
          <textarea
            id="ac-ciphertext"
            v-model="ciphertext"
            class="textarea"
            data-test="ac-ciphertext"
            :placeholder="t('aesCipher.ciphertextPlaceholder')"
            rows="4"
          />
        </div>

        <div class="actions">
          <button
            class="btn primary"
            type="button"
            data-test="ac-decrypt"
            :disabled="decryptBusy || ciphertext.trim().length === 0"
            @click="decrypt"
          >
            <Unlock :size="16" />
            {{ decryptBusy ? t('aesCipher.decrypting') : t('aesCipher.decrypt') }}
          </button>
        </div>

        <p v-if="decryptError" class="error" data-test="ac-decrypt-error">
          {{ decryptError }}
          <span v-if="decryptErrorDetail" class="error-detail" data-test="ac-decrypt-error-detail">
            {{ decryptErrorDetail }}
          </span>
        </p>

        <div v-if="decryptResult !== null" class="result">
          <label class="label">{{ t('aesCipher.resultLabel') }}</label>
          <div class="result-row">
            <code class="result-value" data-test="ac-decrypt-result">{{ decryptResult }}</code>
            <button class="btn small" type="button" data-test="ac-copy-result" @click="copyResult">
              <Check v-if="resultCopied" :size="14" />
              <Copy v-else :size="14" />
              {{ resultCopied ? t('aesCipher.copied') : t('aesCipher.copy') }}
            </button>
          </div>
        </div>
        <p v-else-if="!decryptError" class="empty" data-test="ac-empty">{{ t('aesCipher.empty') }}</p>

        <!-- 结构解析面板：非 FGX1 → 明确提示非本工具密文格式 -->
        <div v-if="ciphertext.trim()" class="parse" data-test="ac-parse-panel">
          <template v-if="envelopeView">
            <dl class="parse-rows">
              <div class="parse-row">
                <dt>{{ t('aesCipher.parseMagic') }}</dt>
                <dd class="mono" data-test="ac-parse-magic">{{ envelopeView.magicHex }}</dd>
              </div>
              <div class="parse-row">
                <dt>{{ t('aesCipher.parseVersion') }}</dt>
                <dd class="mono" data-test="ac-parse-version">{{ envelopeView.versionHex }}</dd>
              </div>
              <div class="parse-row">
                <dt>{{ t('aesCipher.parseMode') }}</dt>
                <dd class="mono" data-test="ac-parse-mode">{{ envelopeView.mode }}</dd>
              </div>
              <div class="parse-row">
                <dt>{{ t('aesCipher.parseSalt') }}</dt>
                <dd class="mono" data-test="ac-parse-salt">{{ envelopeView.saltHex }}</dd>
              </div>
              <div class="parse-row">
                <dt>{{ t('aesCipher.parseIv') }}</dt>
                <dd class="mono" data-test="ac-parse-iv">{{ envelopeView.ivHex }}</dd>
              </div>
              <div class="parse-row">
                <dt>{{ t('aesCipher.parseCtlen') }}</dt>
                <dd class="mono" data-test="ac-parse-ctlen">
                  {{ t('aesCipher.parseBytes', { bytes: String(envelopeView.ciphertextBytes) }) }}
                </dd>
              </div>
            </dl>
          </template>
          <p v-else-if="parseErrorReason" class="error" data-test="ac-parse-invalid">
            {{
              parseErrorReason === 'non-fgx1'
                ? t('aesCipher.errorNonFgx1')
                : parseErrorReason === 'bad-base64'
                  ? t('aesCipher.errorBadBase64')
                  : t('aesCipher.errorBadEnvelope')
            }}
          </p>
        </div>

        <p class="hint">{{ t('aesCipher.formatNote') }}</p>
      </section>

      <p class="notice" data-test="ac-notice">
        <ShieldCheck :size="14" />
        {{ t('aesCipher.notice') }}
      </p>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Lock, ShieldCheck, Unlock } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import AesCipher from './AesCipher.vue'
import {
  base64ToBytes,
  decryptEnvelope,
  deriveAesKeyBytes,
  encryptWithPassphrase,
  encryptWithRawKey,
  exceedsInputLimit,
  parseEnvelope,
  parseRawKey,
  utf8ByteLength,
} from './aes'
import type { AesMode, DecryptFailureReason, KeyBits } from './aes'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'aes-cipher',
  name: 'AES 加解密',
  description: '文本 AES-GCM/CBC 加解密，信封格式自描述封装，纯本地零依赖',
  category: 'security',
  icon: 'Lock',
  component: AesCipher,
  keywords: ['aes', '加密', '解密', 'encrypt', 'decrypt', 'gcm', 'cbc', '密码学', 'cipher'],
}

/* ---------- 密钥 ---------- */

type KeySource = 'passphrase' | 'raw'

const keySource = ref<KeySource>('passphrase')
const passphrase = ref('')
const rawKey = ref('')
const mode = ref<AesMode>('GCM')

// raw key 错误只错该输入框，不影响另一侧
const rawKeyParse = computed(() => parseRawKey(rawKey.value))
const rawKeyError = computed(() => {
  if (keySource.value !== 'raw' || rawKey.value.trim().length === 0) return ''
  if (rawKeyParse.value.ok) return ''
  return rawKeyParse.value.reason === 'invalid-encoding'
    ? t('aesCipher.rawKeyErrorEncoding')
    : t('aesCipher.rawKeyErrorLength', { bytes: String(rawKeyParse.value.byteLength ?? 0) })
})
const rawKeyBits = computed<KeyBits | null>(() =>
  keySource.value === 'raw' && rawKeyParse.value.ok ? rawKeyParse.value.bits : null,
)

/* ---------- 加密 ---------- */

const plaintext = ref('')
const encryptBusy = ref(false)
const encryptError = ref('')
const envelope = ref('')

const plaintextBytes = computed(() => utf8ByteLength(plaintext.value))
const plaintextTooLong = computed(() => exceedsInputLimit(plaintext.value))

let encryptJob = 0

async function encrypt(): Promise<void> {
  if (plaintextTooLong.value) return // 超限明确报错、不触发计算
  const job = ++encryptJob
  encryptBusy.value = true
  encryptError.value = ''
  try {
    let result: { envelope: string } | { ok: false }
    if (keySource.value === 'passphrase') {
      result = await encryptWithPassphrase({ mode: mode.value, passphrase: passphrase.value, plaintext: plaintext.value })
    } else {
      const raw = await encryptWithRawKey({ mode: mode.value, keyText: rawKey.value, plaintext: plaintext.value })
      result = raw.ok ? raw : { ok: false }
    }
    if (job !== encryptJob) return
    if ('envelope' in result) {
      envelope.value = result.envelope
    } else {
      encryptError.value = t('aesCipher.errorInvalidKey')
    }
  } catch {
    if (job !== encryptJob) return
    encryptError.value = t('aesCipher.errorEncrypt')
  } finally {
    if (job === encryptJob) encryptBusy.value = false
  }
}

/* ---------- 复制 ---------- */

const envelopeCopied = ref(false)
const resultCopied = ref(false)
let envelopeTimer: ReturnType<typeof setTimeout> | undefined
let resultTimer: ReturnType<typeof setTimeout> | undefined

async function copyEnvelope(): Promise<void> {
  if (!envelope.value) return
  await navigator.clipboard.writeText(envelope.value)
  clearTimeout(envelopeTimer)
  envelopeCopied.value = true
  envelopeTimer = setTimeout(() => {
    envelopeCopied.value = false
  }, 1500)
}

async function copyResult(): Promise<void> {
  if (decryptResult.value === null) return
  await navigator.clipboard.writeText(decryptResult.value)
  clearTimeout(resultTimer)
  resultCopied.value = true
  resultTimer = setTimeout(() => {
    resultCopied.value = false
  }, 1500)
}

/* ---------- 解密 ---------- */

const ciphertext = ref('')
const decryptBusy = ref(false)
const decryptError = ref('')
const decryptErrorDetail = ref('')
const decryptResult = ref<string | null>(null)

let decryptJob = 0

// 解密失败呈现：GCM 认证失败单态；CBC 填充错误分层提示
function describeDecryptFailure(reason: DecryptFailureReason): void {
  decryptError.value =
    reason === 'gcm-auth'
      ? t('aesCipher.errorGcmAuth')
      : reason === 'cbc-padding'
        ? t('aesCipher.errorCbcPadding')
        : reason === 'non-fgx1'
          ? t('aesCipher.errorNonFgx1')
          : reason === 'bad-base64'
            ? t('aesCipher.errorBadBase64')
            : reason === 'invalid-key'
              ? t('aesCipher.errorInvalidKey')
              : t('aesCipher.errorBadEnvelope')
  decryptErrorDetail.value =
    reason === 'gcm-auth' ? t('aesCipher.errorGcmAuthDetail') : ''
}

async function decrypt(): Promise<void> {
  const job = ++decryptJob
  decryptBusy.value = true
  decryptError.value = ''
  decryptErrorDetail.value = ''
  try {
    // passphrase 解密用信封内嵌 salt 重新派生（600k 迭代固定）
    let keyBytes: Uint8Array | null
    if (keySource.value === 'passphrase') {
      const bytes = base64ToBytes(ciphertext.value)
      keyBytes = bytes && bytes.length >= 22 ? await deriveAesKeyBytes(passphrase.value, bytes.slice(6, 22)) : null
    } else {
      keyBytes = rawKeyParse.value.ok ? rawKeyParse.value.bytes : null
    }
    if (!keyBytes) {
      if (job !== decryptJob) return
      describeDecryptFailure(keySource.value === 'raw' ? 'invalid-key' : 'bad-envelope')
      return
    }
    const outcome = await decryptEnvelope({ envelopeBase64: ciphertext.value, keyBytes })
    if (job !== decryptJob) return
    if (outcome.ok) {
      decryptResult.value = outcome.plaintext
    } else {
      decryptResult.value = null
      describeDecryptFailure(outcome.reason)
    }
  } catch {
    if (job !== decryptJob) return
    decryptError.value = t('aesCipher.errorBadEnvelope')
  } finally {
    if (job === decryptJob) decryptBusy.value = false
  }
}

/* ---------- 结构解析面板（实时切片，零密钥参与） ---------- */

const envelopeParse = computed(() => parseEnvelope(ciphertext.value))
const envelopeView = computed(() => (envelopeParse.value.ok ? envelopeParse.value.view : null))
const parseErrorReason = computed(() => (envelopeParse.value.ok ? null : envelopeParse.value.reason))
</script>
