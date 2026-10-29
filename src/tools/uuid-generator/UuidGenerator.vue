<template>
  <ToolLayout :tool="toolMeta">
    <div class="uuid-tool">
      <div class="panel">
        <div class="controls">
          <div class="control">
            <span class="label">{{ t('uuidGenerator.versionLabel') }}</span>
            <div class="version-group" role="radiogroup" data-test="uuid-version" :aria-label="t('uuidGenerator.versionLabel')">
              <label
                v-for="kind in ID_KINDS"
                :key="kind"
                class="version-option"
                :class="{ active: version === kind }"
              >
                <input v-model="version" type="radio" name="uuid-version" :value="kind" />
                {{ t(`uuidGenerator.version${kind === 'ulid' ? 'Ulid' : kind.toUpperCase()}`) }}
                <span v-if="kind !== 'v4'" class="badge">{{ t('uuidGenerator.timeOrdered') }}</span>
              </label>
            </div>
            <p class="hint">{{ t(`uuidGenerator.hint${version}`) }}</p>
          </div>
          <div class="control">
            <label class="label" for="uuid-count">{{ t('uuidGenerator.countLabel') }}</label>
            <input
              id="uuid-count"
              v-model="countInput"
              class="number-input"
              :class="{ invalid: countError }"
              data-test="uuid-count"
              type="number"
              :min="MIN_COUNT"
              :max="MAX_COUNT"
              step="1"
            />
            <div class="presets" data-test="uuid-presets">
              <span class="hint">{{ t('uuidGenerator.presetLabel') }}</span>
              <button
                v-for="preset in COUNT_PRESETS"
                :key="preset"
                type="button"
                class="preset"
                data-test="uuid-preset"
                @click="countInput = String(preset)"
              >
                {{ preset }}
              </button>
            </div>
            <p v-if="countError" class="error" data-test="uuid-count-error">
              {{ t('uuidGenerator.errorCount') }}
            </p>
            <span v-else class="hint">{{ t('uuidGenerator.countHint') }}</span>
          </div>
          <div class="control">
            <span class="label">{{ t('uuidGenerator.formatLabel') }}</span>
            <label class="check" data-test="uuid-format-uppercase">
              <input v-model="format.uppercase" type="checkbox" />
              {{ t('uuidGenerator.formatUppercase') }}
            </label>
            <label v-if="version !== 'ulid'" class="check" data-test="uuid-format-braces">
              <input v-model="format.braces" type="checkbox" />
              {{ t('uuidGenerator.formatBraces') }}
            </label>
            <label v-if="version !== 'ulid'" class="check" data-test="uuid-format-hyphenless">
              <input v-model="format.hyphenless" type="checkbox" />
              {{ t('uuidGenerator.formatHyphenless') }}
            </label>
          </div>
        </div>
        <div class="actions">
          <button class="btn primary" data-test="uuid-generate" :disabled="countError" @click="generate">
            <RefreshCw :size="16" />
            {{ t('uuidGenerator.generate') }}
          </button>
          <button class="btn" data-test="uuid-copy-all" :disabled="results.length === 0" @click="copyAll">
            <Check v-if="copiedAll" :size="16" />
            <Copy v-else :size="16" />
            {{ copiedAll ? t('uuidGenerator.copied') : t('uuidGenerator.copyAll') }}
          </button>
          <button class="btn" data-test="uuid-clear" :disabled="results.length === 0" @click="clear">
            <Trash2 :size="16" />
            {{ t('uuidGenerator.clear') }}
          </button>
        </div>
      </div>
      <div class="panel output">
        <template v-if="results.length > 0">
          <p class="meta" data-test="uuid-result-meta">
            {{ t('uuidGenerator.resultMeta', { count: String(results.length) }) }}
          </p>
          <ul class="rows" data-test="uuid-rows">
            <li v-for="(row, index) in results" :key="`${index}-${row}`" class="row">
              <code class="row-text" data-test="uuid-row-text">{{ row }}</code>
              <button class="btn row-copy" data-test="uuid-copy-row" @click="copyRow(index)">
                <Check v-if="copiedIndex === index" :size="14" />
                <Copy v-else :size="14" />
                {{ copiedIndex === index ? t('uuidGenerator.copied') : t('uuidGenerator.copyRow') }}
              </button>
            </li>
          </ul>
        </template>
        <p v-else class="empty" data-test="uuid-empty">{{ t('uuidGenerator.empty') }}</p>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import UuidGenerator from './UuidGenerator.vue'
import {
  COUNT_PRESETS,
  DEFAULT_COUNT,
  DEFAULT_FORMAT,
  DEFAULT_ID_KIND,
  ID_KINDS,
  MAX_COUNT,
  MIN_COUNT,
  formatId,
  generateBatch,
  parseCount,
} from './uuid'
import type { FormatOptions, IdKind } from './uuid'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'uuid-generator',
  name: 'UUID/ULID 生成器',
  description: '生成 UUID v4/v7 与 ULID，支持批量与格式开关',
  category: 'generate',
  icon: 'Fingerprint',
  component: UuidGenerator,
  keywords: ['uuid', 'guid', 'ulid', 'v4', 'v7', '唯一标识', '生成器'],
}

// Generators are not live: controls only affect the NEXT generate click.
const version = ref<IdKind>(DEFAULT_ID_KIND)
const countInput = ref(String(DEFAULT_COUNT))
const format = reactive<FormatOptions>({ ...DEFAULT_FORMAT })
const results = ref<string[]>([])

const parsedCount = computed(() => parseCount(countInput.value))
const countError = computed(() => parsedCount.value === null)

const copiedIndex = ref<number | null>(null)
const copiedAll = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | undefined

function generate() {
  const count = parsedCount.value
  if (count === null) return
  results.value = generateBatch(version.value, count).map((raw) =>
    formatId(raw, version.value, { ...format }),
  )
  copiedIndex.value = null
  copiedAll.value = false
}

function clear() {
  results.value = []
  copiedIndex.value = null
  copiedAll.value = false
}

function markCopied(reset: () => void) {
  reset()
  if (copyResetTimer !== undefined) clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => {
    copiedIndex.value = null
    copiedAll.value = false
  }, 1500)
}

async function copyRow(index: number) {
  const value = results.value[index]
  if (value === undefined) return
  try {
    await navigator.clipboard.writeText(value)
    markCopied(() => {
      copiedIndex.value = index
    })
  } catch {
    // Clipboard unavailable (e.g. unsupported context) — silently ignore.
  }
}

async function copyAll() {
  if (results.value.length === 0) return
  try {
    await navigator.clipboard.writeText(results.value.join('\n'))
    markCopied(() => {
      copiedAll.value = true
    })
  } catch {
    // Clipboard unavailable — silently ignore.
  }
}

// Entering the tool generates one batch immediately (default v4 × 1).
generate()
</script>

<style scoped>
.uuid-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.controls {
  display: flex;
  gap: var(--space-lg);
  flex-wrap: wrap;
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

.version-group {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.version-option {
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

.version-option.active {
  border-color: var(--accent);
  color: var(--text-primary);
}

.version-option input {
  accent-color: var(--accent);
}

.badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-tertiary);
  border: 1px solid var(--border);
}

.check {
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

.check:hover {
  color: var(--text-primary);
}

.check input {
  accent-color: var(--accent);
}

.number-input {
  width: 96px;
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

.number-input.invalid {
  border-color: var(--error);
}

.presets {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.preset {
  padding: 2px var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.preset:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
}

.error {
  font-size: 12px;
  color: var(--error);
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
  margin-top: var(--space-sm);
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
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.output .meta {
  font-size: 12px;
  color: var(--text-quaternary);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  max-height: 480px;
  overflow-y: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.row-text {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
  user-select: all;
}

.row-copy {
  flex-shrink: 0;
  padding: var(--space-xs) var(--space-sm);
  font-size: 12px;
}

.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  padding: var(--space-lg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}
</style>
