<template>
  <div class="json-yaml-tool">
      <!-- 源/目标格式双选择器（10 票扩展：JSON/YAML/TOML 六方向 + 交换） -->
      <div class="controls" data-test="json-yaml-formats">
        <div class="format-group">
          <span class="group-label">{{ t('jsonYaml.sourceLabel') }}</span>
          <div class="segmented" role="group" :aria-label="t('jsonYaml.sourceLabel')">
            <button
              v-for="format in FORMATS"
              :key="`source-${format}`"
              class="seg-btn"
              :class="{ active: sourceFormat === format }"
              :data-test="`json-yaml-source-${format}`"
              @click="sourceFormat = format"
            >
              {{ format.toUpperCase() }}
            </button>
          </div>
        </div>
        <button class="btn" data-test="json-yaml-swap" :title="t('jsonYaml.swap')" @click="swap">
          <ArrowLeftRight :size="16" />
          {{ t('jsonYaml.swap') }}
        </button>
        <div class="format-group">
          <span class="group-label">{{ t('jsonYaml.targetLabel') }}</span>
          <div class="segmented" role="group" :aria-label="t('jsonYaml.targetLabel')">
            <button
              v-for="format in FORMATS"
              :key="`target-${format}`"
              class="seg-btn"
              :class="{ active: targetFormat === format }"
              :data-test="`json-yaml-target-${format}`"
              @click="targetFormat = format"
            >
              {{ format.toUpperCase() }}
            </button>
          </div>
        </div>
      </div>

      <div class="panel">
        <label class="label">{{ t('jsonYaml.inputLabel') }}</label>
        <textarea
          v-model="input"
          class="textarea"
          data-test="json-yaml-input"
          :placeholder="t('jsonYaml.placeholder')"
          rows="10"
        />
      </div>
      <div class="actions">
        <button class="btn" data-test="json-yaml-copy" :disabled="!output" @click="copy">
          <Copy :size="16" />
          {{ copied ? t('jsonYaml.copied') : t('jsonYaml.copy') }}
        </button>
        <button class="btn" data-test="json-yaml-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('jsonYaml.clear') }}
        </button>
      </div>
      <div class="panel output">
        <label class="label">{{ t('jsonYaml.output') }}</label>
        <textarea
          v-model="output"
          class="textarea"
          data-test="json-yaml-output"
          readonly
          rows="10"
          :placeholder="input.trim() === '' ? t('jsonYaml.outputEmpty') : ''"
        />
        <!-- 报错只错该处：输出保留上一次成功值（平台附录 §4） -->
        <p v-if="errorText" class="error" data-test="json-yaml-error">{{ errorText }}</p>
        <!-- 值保真降级声明（动态产生，不静默）：大整数字符串化 / datetime 降级 -->
        <ul v-if="notices.length > 0" class="notices" data-test="json-yaml-notices">
          <li
            v-for="notice in notices"
            :key="notice.code"
            class="notice"
            :data-test="`json-yaml-notice-${notice.code}`"
          >
            {{ formatNotice(notice) }}
          </li>
        </ul>
      </div>
      <!-- TOML 源的常驻保真声明（票据锁定：注释丢失 / datetime 降级 / µs 截断 / 逆向不复活） -->
      <p v-if="sourceFormat === 'toml'" class="notice" data-test="json-yaml-toml-notice">
        {{ t('jsonYaml.tomlNotice') }}
      </p>
      <p class="notice">{{ t('jsonYaml.localNotice') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeftRight, Copy, Trash2 } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import { CONVERT_DEBOUNCE_MS, convertFormat } from './jsonYaml'
import type { ConversionFormat, ConversionNotice, ConversionSyntaxError } from './jsonYaml'

const { t } = useI18n()

const FORMATS: ConversionFormat[] = ['json', 'yaml', 'toml']

const sourceFormat = ref<ConversionFormat>('json')
const targetFormat = ref<ConversionFormat>('yaml')
const input = ref('')
const output = ref('')
const error = ref<ConversionSyntaxError | null>(null)
const notices = ref<ConversionNotice[]>([])
const copied = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let runToken = 0

// 实时防抖 300ms（转换类工具平台约定）；格式切换同样触发重转换。
watch([input, sourceFormat, targetFormat], () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(convertNow, CONVERT_DEBOUNCE_MS)
})

async function convertNow() {
  const token = ++runToken
  const text = input.value

  // 空输入：清空输出与声明、无报错（占位提示），不视为错误。
  if (text.trim() === '') {
    output.value = ''
    error.value = null
    notices.value = []
    return
  }

  const outcome = await convertFormat(text, sourceFormat.value, targetFormat.value)
  if (token !== runToken) return // 过期结果丢弃（防抖竞态）

  if (outcome.ok) {
    output.value = outcome.value
    error.value = null
    notices.value = outcome.notices
  } else {
    // 词法崩溃保留上一次输出：只更新错误区与声明清空。
    error.value = outcome.error
    notices.value = []
  }
}

const errorText = computed(() => (error.value ? formatError(error.value) : ''))

function formatError(caught: ConversionSyntaxError): string {
  if (caught.line === undefined || caught.column === undefined) {
    return caught.message === 'empty input'
      ? t('jsonYaml.errParse')
      : `${t('jsonYaml.errParse')}：${caught.message}`
  }
  return `${t('jsonYaml.errParse')} ${t('jsonYaml.lineColumn', {
    column: String(caught.column),
    line: String(caught.line),
  })}`
}

function formatNotice(notice: ConversionNotice): string {
  const key = notice.code === 'bigint-stringified' ? 'noticeBigint' : 'noticeDatetime'
  return t(`jsonYaml.${key}`, { count: String(notice.count) })
}

/** 交换源/目标格式，并把当前输出带回源侧（输出为空时仅切换方向）。 */
function swap() {
  if (output.value) input.value = output.value
  const prevSource = sourceFormat.value
  sourceFormat.value = targetFormat.value
  targetFormat.value = prevSource
}

/* ---------------- output actions ---------------- */

let copyTimer: ReturnType<typeof setTimeout> | undefined

function copy() {
  if (!output.value) return
  void navigator.clipboard.writeText(output.value)
  copied.value = true
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

function clear() {
  runToken += 1
  input.value = ''
  output.value = ''
  error.value = null
  notices.value = []
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  clearTimeout(copyTimer)
})
</script>

<style scoped>
.json-yaml-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.controls {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.format-group {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.group-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.segmented {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.seg-btn {
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.seg-btn + .seg-btn {
  border-left: 1px solid var(--border);
}

.seg-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.seg-btn.active {
  background: var(--accent);
  color: white;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
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

.textarea::placeholder {
  color: var(--text-quaternary);
}

.actions {
  display: flex;
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

.error {
  color: var(--error);
  font-size: 13px;
  margin-top: var(--space-sm);
}

.notices {
  margin: var(--space-sm) 0 0;
  padding: 0;
  list-style: none;
}

.notice {
  color: var(--text-quaternary);
  font-size: 12px;
}
</style>
