<template>
  <ToolLayout :tool="toolMeta">
    <div class="aes-tool">
      <!-- 文本 / 文件 页签：文本模式不动，文件为 FGX1 v2 新增 -->
      <div class="segment-group tab-group" role="tablist" :aria-label="t('aesCipher.tabLabel')" data-test="ac-tabs">
        <label class="segment" :class="{ active: tab === 'text' }">
          <input v-model="tab" type="radio" value="text" data-test="ac-tab-text" />
          {{ t('aesCipher.tabText') }}
        </label>
        <label class="segment" :class="{ active: tab === 'file' }">
          <input v-model="tab" type="radio" value="file" data-test="ac-tab-file" />
          {{ t('aesCipher.tabFile') }}
        </label>
      </div>

      <template v-if="tab === 'text'">
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

      <!-- OpenSSL 兼容解密（单向）：独立区块——FGX1 解密口不认第三方密文，二者关系是并列而非开关 -->
      <section class="panel">
        <h2 class="section-title">{{ t('aesCipher.opensslTitle') }}</h2>
        <p class="hint">{{ t('aesCipher.opensslHint') }}</p>

        <div class="control">
          <label class="label" for="ac-openssl-input">{{ t('aesCipher.opensslInputLabel') }}</label>
          <textarea
            id="ac-openssl-input"
            v-model="opensslInput"
            class="textarea"
            data-test="aes-openssl-input"
            :placeholder="t('aesCipher.opensslInputPlaceholder')"
            rows="4"
          />
        </div>

        <div class="controls-row">
          <div class="control">
            <label class="label" for="ac-openssl-cipher">{{ t('aesCipher.opensslCipherLabel') }}</label>
            <select id="ac-openssl-cipher" v-model="opensslCipher" class="select" data-test="aes-openssl-cipher">
              <option value="aes-128-cbc">AES-128-CBC</option>
              <option value="aes-192-cbc">AES-192-CBC</option>
              <option value="aes-256-cbc">AES-256-CBC</option>
            </select>
            <p class="hint">{{ t('aesCipher.opensslCipherHint') }}</p>
          </div>
          <div class="control">
            <span class="label">{{ t('aesCipher.opensslKdfLabel') }}</span>
            <div class="segment-group" role="radiogroup" :aria-label="t('aesCipher.opensslKdfLabel')">
              <label class="segment" :class="{ active: opensslKdf === 'md5' }">
                <input v-model="opensslKdf" type="radio" value="md5" data-test="aes-openssl-kdf-md5" />
                {{ t('aesCipher.opensslKdfMd5') }}
              </label>
              <label class="segment" :class="{ active: opensslKdf === 'pbkdf2' }">
                <input v-model="opensslKdf" type="radio" value="pbkdf2" data-test="aes-openssl-kdf-pbkdf2" />
                {{ t('aesCipher.opensslKdfPbkdf2') }}
              </label>
            </div>
            <!-- 弱 KDF 常驻警示：legacy MD5 档位选中即显示 -->
            <p v-if="opensslKdf === 'md5'" class="warn" data-test="aes-openssl-warning">
              {{ t('aesCipher.opensslMd5Warning') }}
            </p>
          </div>
          <div v-if="opensslKdf === 'pbkdf2'" class="control">
            <label class="label" for="ac-openssl-iter">{{ t('aesCipher.opensslIterLabel') }}</label>
            <input
              id="ac-openssl-iter"
              v-model.number="opensslIterations"
              class="text-input narrow"
              type="number"
              min="1"
              :max="MAX_PBKDF2_ITERATIONS"
              step="1"
              data-test="aes-openssl-iter"
            />
            <p class="hint">{{ t('aesCipher.opensslIterHint') }}</p>
          </div>
        </div>

        <div class="control">
          <label class="label" for="ac-openssl-pass">{{ t('aesCipher.opensslPassphraseLabel') }}</label>
          <input
            id="ac-openssl-pass"
            v-model="opensslPassphrase"
            class="text-input"
            type="password"
            data-test="aes-openssl-passphrase"
            :placeholder="t('aesCipher.opensslPassphrasePlaceholder')"
            autocomplete="off"
          />
        </div>

        <div class="actions">
          <button
            class="btn primary"
            type="button"
            data-test="aes-openssl-decrypt"
            :disabled="opensslBusy || opensslInput.trim().length === 0"
            @click="decryptOpenSslAction"
          >
            <Unlock :size="16" />
            {{ opensslBusy ? t('aesCipher.decrypting') : t('aesCipher.opensslDecrypt') }}
          </button>
        </div>

        <p v-if="opensslError" class="error" data-test="aes-openssl-error">
          {{ opensslError }}
        </p>

        <div v-if="opensslResult !== null" class="result">
          <label class="label">{{ t('aesCipher.resultLabel') }}</label>
          <div class="result-row">
            <code class="result-value" data-test="aes-openssl-result">{{ opensslResult }}</code>
            <button class="btn small" type="button" data-test="aes-openssl-copy" @click="copyOpenSslResult">
              <Check v-if="opensslCopied" :size="14" />
              <Copy v-else :size="14" />
              {{ opensslCopied ? t('aesCipher.copied') : t('aesCipher.copy') }}
            </button>
          </div>
        </div>
      </section>
      </template>

      <!-- 文件页签：FGX1 v2 分块流式（加密 / 解密 双向） -->
      <template v-else>
        <section class="panel">
          <h2 class="section-title">{{ t('aesCipher.fileTitle') }}</h2>
          <p class="hint">{{ t('aesCipher.fileHint') }}</p>

          <div class="control">
            <label class="label" for="ac-file-pass">{{ t('aesCipher.filePassphraseLabel') }}</label>
            <input
              id="ac-file-pass"
              v-model="filePassphrase"
              class="text-input"
              type="password"
              data-test="aes-file-passphrase"
              :placeholder="t('aesCipher.filePassphrasePlaceholder')"
              autocomplete="off"
            />
            <p class="hint">{{ t('aesCipher.filePassphraseHint') }}</p>
          </div>

          <div class="control">
            <span class="label">{{ t('aesCipher.fileDirectionLabel') }}</span>
            <div class="segment-group" role="radiogroup" :aria-label="t('aesCipher.fileDirectionLabel')">
              <label class="segment" :class="{ active: fileDirection === 'encrypt' }">
                <input v-model="fileDirection" type="radio" value="encrypt" data-test="aes-file-mode-encrypt" />
                {{ t('aesCipher.fileEncrypt') }}
              </label>
              <label class="segment" :class="{ active: fileDirection === 'decrypt' }">
                <input v-model="fileDirection" type="radio" value="decrypt" data-test="aes-file-mode-decrypt" />
                {{ t('aesCipher.fileDecrypt') }}
              </label>
            </div>
          </div>

          <div
            class="dropzone"
            :class="{ 'drag-over': fileDragOver }"
            data-test="aes-file-drop"
            @dragover.prevent="fileDragOver = true"
            @dragleave.prevent="fileDragOver = false"
            @drop.prevent="onFileDrop"
            @click="fileInput?.click()"
          >
            <input
              ref="fileInput"
              type="file"
              multiple
              :accept="fileDirection === 'decrypt' ? '.fgx' : undefined"
              class="hidden-input"
              data-test="aes-file-input"
              @change="onFilePicked"
            />
            <FileUp :size="18" />
            <span>{{ t('aesCipher.fileDropHint') }}</span>
            <span class="hint-inline">{{ t('aesCipher.fileLimits') }}</span>
          </div>

          <div class="actions">
            <button
              class="btn primary"
              type="button"
              data-test="aes-file-run"
              :disabled="fileBusy || fileRows.length === 0 || pendingFileRows === 0"
              @click="runFileJobs"
            >
              <Lock v-if="fileDirection === 'encrypt'" :size="16" />
              <Unlock v-else :size="16" />
              {{ fileBusy ? t('aesCipher.fileWorking') : t('aesCipher.fileRun') }}
            </button>
            <button
              v-if="fileSuccessCount > 1"
              class="btn"
              type="button"
              data-test="aes-file-zip"
              :disabled="fileBusy"
              @click="downloadFileZip"
            >
              <Archive :size="16" />
              {{ t('aesCipher.fileZip') }}
            </button>
            <button class="btn" type="button" data-test="aes-file-clear" :disabled="fileBusy" @click="clearFileRows">
              <Trash2 :size="16" />
              {{ t('aesCipher.fileClear') }}
            </button>
          </div>
          <p v-if="fileError" class="error" data-test="aes-file-error">{{ fileError }}</p>

          <ul v-if="fileRows.length > 0" class="file-rows" data-test="aes-file-rows">
            <li v-for="row in fileRows" :key="row.id" class="file-row" :data-status="row.status" data-test="aes-file-row">
              <span class="file-name" :title="row.sourceName">{{ row.outputName ?? row.sourceName }}</span>
              <span v-if="row.status === 'success'" class="file-meta" data-test="aes-file-row-meta">
                {{ formatFileSize(row.sourceSize) }} → {{ formatFileSize(row.outputSize ?? 0) }}
              </span>
              <span v-else-if="row.status === 'working'" class="file-meta" data-test="aes-file-row-working">
                {{ t('aesCipher.fileWorking') }}
              </span>
              <span v-else-if="row.error" class="error" data-test="aes-file-row-error">{{ row.error }}</span>
              <button
                v-if="row.status === 'success'"
                class="btn small"
                type="button"
                data-test="aes-file-row-download"
                @click="downloadFileRow(row)"
              >
                <Download :size="14" />
                {{ t('aesCipher.fileDownload') }}
              </button>
              <button
                class="btn icon"
                type="button"
                data-test="aes-file-row-remove"
                :aria-label="t('aesCipher.fileRemove')"
                :disabled="fileBusy"
                @click="removeFileRow(row)"
              >
                <X :size="14" />
              </button>
            </li>
          </ul>
        </section>
      </template>

      <p class="notice" data-test="ac-notice">
        <ShieldCheck :size="14" />
        {{ t('aesCipher.notice') }}
      </p>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Archive, Check, Copy, Download, FileUp, Lock, ShieldCheck, Trash2, Unlock, X } from 'lucide-vue-next'
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
import {
  DEFAULT_OPENSSL_CIPHER,
  DEFAULT_OPENSSL_KDF,
  DEFAULT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  decryptOpenSsl,
} from './openssl'
import type { OpenSslCipher, OpenSslKdf } from './openssl'
import { MAX_BATCH_FILES, decryptFileEnvelope, encryptFileEnvelope } from './aesFile'
import { allocateConflictName, fgxOutputName } from './naming'

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

/* ---------- 页签 ---------- */

const tab = ref<'text' | 'file'>('text')

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
    } else if ('reason' in result && result.reason === 'unsupported-192') {
      encryptError.value = t('aesCipher.errorUnsupported192')
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
              : reason === 'unsupported-192'
                ? t('aesCipher.errorUnsupported192')
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

/* ---------- OpenSSL 兼容解密（单向，独立区块） ---------- */

const opensslInput = ref('')
const opensslPassphrase = ref('')
const opensslCipher = ref<OpenSslCipher>(DEFAULT_OPENSSL_CIPHER)
const opensslKdf = ref<OpenSslKdf>(DEFAULT_OPENSSL_KDF)
const opensslIterations = ref(DEFAULT_PBKDF2_ITERATIONS)
const opensslBusy = ref(false)
const opensslError = ref('')
const opensslResult = ref<string | null>(null)
const opensslCopied = ref(false)
let opensslTimer: ReturnType<typeof setTimeout> | undefined

let opensslJob = 0

async function decryptOpenSslAction(): Promise<void> {
  const job = ++opensslJob
  opensslBusy.value = true
  opensslError.value = ''
  opensslResult.value = null
  try {
    const outcome = await decryptOpenSsl({
      input: opensslInput.value,
      passphrase: opensslPassphrase.value,
      cipher: opensslCipher.value,
      kdf: opensslKdf.value,
      iterations: opensslIterations.value,
    })
    if (job !== opensslJob) return
    if (outcome.ok) {
      opensslResult.value = outcome.plaintext
    } else if (outcome.reason === 'not-salted') {
      opensslError.value = t('aesCipher.opensslErrNotSalted')
    } else if (outcome.reason === 'bad-encoding') {
      opensslError.value = t('aesCipher.opensslErrBadEncoding')
    } else if (outcome.reason === 'unsupported-192') {
      opensslError.value = t('aesCipher.errorUnsupported192')
    } else {
      // 同 magic 不可自动区分：失败提示换 cipher/KDF 组合
      opensslError.value = t('aesCipher.opensslErrFailed')
    }
  } catch {
    if (job !== opensslJob) return
    opensslError.value = t('aesCipher.opensslErrFailed')
  } finally {
    if (job === opensslJob) opensslBusy.value = false
  }
}

async function copyOpenSslResult(): Promise<void> {
  if (opensslResult.value === null) return
  await navigator.clipboard.writeText(opensslResult.value)
  clearTimeout(opensslTimer)
  opensslCopied.value = true
  opensslTimer = setTimeout(() => {
    opensslCopied.value = false
  }, 1500)
}

/* ---------- 文件页签：FGX1 v2 ---------- */

type FileRowStatus = 'pending' | 'working' | 'success' | 'failed'

interface FileRow {
  id: number
  file: File
  sourceName: string
  sourceSize: number
  status: FileRowStatus
  error?: string
  outputName?: string
  outputSize?: number
  blob?: Blob
}

const fileDirection = ref<'encrypt' | 'decrypt'>('encrypt')
const filePassphrase = ref('')
const fileRows = ref<FileRow[]>([])
const fileBusy = ref(false)
const fileError = ref('')
const fileDragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const usedOutputNames = new Set<string>()
let fileRowId = 1

const pendingFileRows = computed(() => fileRows.value.filter((r) => r.status === 'pending').length)
const fileSuccessCount = computed(() => fileRows.value.filter((r) => r.status === 'success').length)

function fileRowErrorText(
  reason: 'file-too-large' | 'name-too-long' | 'bad-envelope' | 'gcm-auth' | 'too-many',
): string {
  switch (reason) {
    case 'file-too-large':
      return t('aesCipher.fileErrTooLarge')
    case 'name-too-long':
      return t('aesCipher.fileErrNameTooLong')
    case 'bad-envelope':
      return t('aesCipher.fileErrBadEnvelope')
    case 'gcm-auth':
      return t('aesCipher.fileErrAuth')
    case 'too-many':
      return t('aesCipher.fileErrTooMany')
  }
}

function addFiles(files: ArrayLike<File>): void {
  fileError.value = ''
  for (const file of Array.from(files)) {
    const row: FileRow = {
      id: fileRowId++,
      file,
      sourceName: file.name,
      sourceSize: file.size,
      status: 'pending',
    }
    // 批量上限：超出即整行拒绝（沿 WebP 先例：拒绝行也占名，保证上限可见）
    if (fileRows.value.length >= MAX_BATCH_FILES) {
      row.status = 'failed'
      row.error = fileRowErrorText('too-many')
      fileRows.value.push(row)
      continue
    }
    if (file.size > 512 * 1024 * 1024) {
      row.status = 'failed'
      row.error = fileRowErrorText('file-too-large')
    }
    fileRows.value.push(row)
  }
}

function onFilePicked(e: Event): void {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFiles(input.files)
  input.value = ''
}

function onFileDrop(e: DragEvent): void {
  fileDragOver.value = false
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files)
}

function removeFileRow(row: FileRow): void {
  if (row.outputName) usedOutputNames.delete(row.outputName)
  fileRows.value = fileRows.value.filter((r) => r.id !== row.id)
}

function clearFileRows(): void {
  fileRows.value = []
  usedOutputNames.clear()
  fileError.value = ''
}

async function runFileJobs(): Promise<void> {
  if (filePassphrase.value.length === 0 && pendingFileRows.value > 0) {
    fileError.value = t('aesCipher.fileErrNoPassphrase')
    return
  }
  fileBusy.value = true
  fileError.value = ''
  for (const row of fileRows.value) {
    if (row.status !== 'pending') continue
    row.status = 'working'
    row.error = undefined
    try {
      if (fileDirection.value === 'encrypt') {
        const outcome = await encryptFileEnvelope({
          source: row.file,
          fileName: row.sourceName,
          passphrase: filePassphrase.value,
        })
        if (!outcome.ok) {
          row.status = 'failed'
          row.error = fileRowErrorText(outcome.reason)
          continue
        }
        row.blob = outcome.blob
        row.outputSize = outcome.blob.size
        const desired = fgxOutputName(row.sourceName)
        row.outputName = allocateConflictName(desired, usedOutputNames)
        usedOutputNames.add(row.outputName)
      } else {
        const outcome = await decryptFileEnvelope({ source: row.file, passphrase: filePassphrase.value })
        if (!outcome.ok) {
          row.status = 'failed'
          row.error = fileRowErrorText(outcome.reason)
          continue
        }
        row.blob = outcome.blob
        row.outputSize = outcome.blob.size
        row.outputName = allocateConflictName(outcome.fileName, usedOutputNames)
        usedOutputNames.add(row.outputName)
      }
      row.status = 'success'
    } catch {
      row.status = 'failed'
      row.error = t('aesCipher.fileErrUnexpected')
    }
  }
  fileBusy.value = false
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadFileRow(row: FileRow): void {
  if (row.status === 'success' && row.blob && row.outputName) triggerDownload(row.blob, row.outputName)
}

async function downloadFileZip(): Promise<void> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const row of fileRows.value) {
    if (row.status === 'success' && row.blob && row.outputName) zip.file(row.outputName, row.blob)
  }
  if (Object.keys(zip.files).length === 0) return
  triggerDownload(await zip.generateAsync({ type: 'blob' }), 'forgex-aes-files.zip')
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${bytes} B`
}
</script>

<style scoped>
/* 沿各工具 scoped 样式惯例（设计令牌见 src/styles/variables.css）；
   原 v1 组件无样式块，v2 页签化时一并补齐本工具全部类名。 */
.aes-tool {
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

.tab-group {
  align-self: flex-start;
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
  align-items: flex-start;
}

.controls-row .control {
  flex: 1;
  min-width: 160px;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.text-input,
.select {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-xs) var(--space-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.text-input {
  font-family: var(--font-mono);
}

.text-input:focus,
.select:focus {
  border-color: var(--border-focus);
}

.text-input.invalid {
  border-color: var(--error);
}

.text-input.narrow {
  width: 110px;
}

.textarea {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: var(--space-sm);
  outline: none;
  resize: vertical;
  transition: border-color var(--transition-fast);
}

.textarea:focus {
  border-color: var(--border-focus);
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-quaternary);
}

.hint-inline {
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

.error-detail {
  display: block;
  font-size: 12px;
  color: var(--text-quaternary);
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.segment-group {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.segment {
  position: relative; /* input 以 inset:0 覆盖整个 chip，保持可点可聚焦 */
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--bg-surface);
  border: none;
  transition: all var(--transition-fast);
}

.segment + .segment {
  border-left: 1px solid var(--border);
}

.segment.active {
  background: var(--accent);
  color: #fff;
}

.segment input {
  /* 视觉隐藏但直接可点：绝对定位铺满 chip（不挡 label 文本的可达性——
     点击落到 input 本体，标签联动与键盘聚焦都成立，e2e page.check 可达）。 */
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  background: var(--bg-surface);
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
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn.small {
  padding: 2px var(--space-sm);
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
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  padding: var(--space-md);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  text-align: center;
}

.parse {
  border-top: 1px dashed var(--border);
  padding-top: var(--space-md);
}

.parse-rows {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.parse-row {
  display: flex;
  gap: var(--space-md);
  font-size: 12px;
}

.parse-row dt {
  color: var(--text-quaternary);
  width: 90px;
  flex-shrink: 0;
}

.parse-row dd {
  margin: 0;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
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

/* ---- 文件页签 ---- */

.dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--space-lg);
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.dropzone:hover,
.dropzone.drag-over {
  border-color: var(--accent);
  background: var(--bg-card-hover);
}

.hidden-input {
  display: none;
}

.file-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.file-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.file-name {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  color: var(--text-tertiary);
  font-size: 12px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
</style>
