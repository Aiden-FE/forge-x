<template>
  <ToolLayout :tool="toolMeta">
    <div class="qr-tool">
      <div class="panel">
        <label class="label" for="qr-input">{{ t('qrGenerator.inputLabel') }}</label>
        <textarea
          id="qr-input"
          v-model="text"
          class="textarea"
          data-test="qr-input"
          :placeholder="t('qrGenerator.inputPlaceholder')"
          rows="4"
        />
        <div class="controls">
          <div class="control">
            <span class="label">{{ t('qrGenerator.eccLabel') }}</span>
            <div class="ecc-group" role="radiogroup" data-test="qr-ecc" :aria-label="t('qrGenerator.eccLabel')">
              <label
                v-for="level in ECC_LEVELS"
                :key="level"
                class="ecc-option"
                :class="{ active: ecc === level }"
              >
                <input v-model="ecc" type="radio" name="qr-ecc" :value="level" />
                {{ t(`qrGenerator.ecc${level}`) }}
              </label>
            </div>
          </div>
          <div class="control">
            <label class="label" for="qr-quiet-zone">{{ t('qrGenerator.quietZoneLabel') }}</label>
            <input
              id="qr-quiet-zone"
              v-model.number="quietZone"
              class="number-input"
              data-test="qr-quiet-zone"
              type="number"
              :min="MIN_QUIET_ZONE"
              :max="MAX_QUIET_ZONE"
              step="1"
            />
            <span class="hint">{{ t('qrGenerator.quietZoneHint') }}</span>
          </div>
        </div>
      </div>
      <div class="panel output">
        <template v-if="result">
          <div class="preview-wrap">
            <!-- eslint-disable-next-line vue/no-v-html : SVG is generated locally from the module matrix -->
            <div class="preview" data-test="qr-preview" v-html="result.svg" />
            <p class="meta" data-test="qr-meta">
              {{ t('qrGenerator.sizeLabel', { size: String(result.size), modules: String(result.matrix.moduleCount) }) }}
            </p>
          </div>
          <div class="actions">
            <button class="btn primary" data-test="qr-download" @click="download">
              <Download :size="16" />
              {{ t('qrGenerator.download') }}
            </button>
            <button class="btn" data-test="qr-clear" @click="clear">
              <Trash2 :size="16" />
              {{ t('qrGenerator.clear') }}
            </button>
          </div>
        </template>
        <p v-else class="empty" data-test="qr-empty">{{ t('qrGenerator.empty') }}</p>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import QrGenerator from './QrGenerator.vue'
import {
  DEFAULT_ECC,
  DEFAULT_QUIET_ZONE,
  ECC_LEVELS,
  MAX_QUIET_ZONE,
  MIN_QUIET_ZONE,
  generateQr,
} from './qr'
import type { EccLevel } from './qr'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'qr-generator',
  name: 'QR Code 生成器',
  description: '输入文本生成二维码 SVG',
  category: 'generate',
  icon: 'QrCode',
  component: QrGenerator,
  keywords: ['qr', 'qrcode', '二维码', 'QR Code', 'generator', 'svg'],
}

const text = ref('')
const ecc = ref<EccLevel>(DEFAULT_ECC)
const quietZone = ref(DEFAULT_QUIET_ZONE)

const result = computed(() => generateQr(text.value, ecc.value, quietZone.value))

function download() {
  if (!result.value) return
  const blob = new Blob([result.value.svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'qrcode.svg'
  a.click()
  URL.revokeObjectURL(url)
}

function clear() {
  text.value = ''
}
</script>

<style scoped>
.qr-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
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

.controls {
  display: flex;
  gap: var(--space-lg);
  flex-wrap: wrap;
  margin-top: var(--space-sm);
}

.control {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.ecc-group {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.ecc-option {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.ecc-option.active {
  border-color: var(--accent);
  color: var(--text-primary);
}

.ecc-option input {
  accent-color: var(--accent);
}

.number-input {
  width: 80px;
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
  font-size: 12px;
  color: var(--text-quaternary);
}

.output {
  align-items: flex-start;
}

.preview-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.preview {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  align-self: flex-start;
}

.preview :deep(svg) {
  display: block;
  width: 256px;
  height: 256px;
}

.meta {
  font-size: 12px;
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

.btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  padding: var(--space-lg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}
</style>
