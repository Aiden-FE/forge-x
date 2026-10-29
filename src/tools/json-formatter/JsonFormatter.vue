<template>
  <ToolLayout :tool="toolMeta">
    <div class="json-tool">
      <div class="panel">
        <label class="label">{{ t('jsonFormatter.label') }}</label>
        <textarea
          v-model="input"
          class="textarea"
          data-test="json-input"
          :placeholder="t('jsonFormatter.placeholder')"
          rows="10"
        />
      </div>
      <div class="actions">
        <button class="btn primary" data-test="json-format" @click="format">
          <Sparkles :size="16" />
          {{ t('jsonFormatter.format') }}
        </button>
        <button class="btn" data-test="json-minify" @click="minify">
          <Minimize2 :size="16" />
          {{ t('jsonFormatter.minify') }}
        </button>
        <button class="btn" data-test="json-copy" @click="copy">
          <Copy :size="16" />
          {{ t('jsonFormatter.copy') }}
        </button>
        <button class="btn" data-test="json-clear" @click="clear">
          <Trash2 :size="16" />
          {{ t('jsonFormatter.clear') }}
        </button>
      </div>
      <div class="panel output">
        <label class="label">{{ t('jsonFormatter.output') }}</label>
        <textarea
          v-model="output"
          class="textarea"
          data-test="json-output"
          readonly
          rows="10"
        />
        <p v-if="error" class="error" data-test="json-error">{{ error }}</p>
      </div>
      <div class="panel query">
        <label class="label">{{ t('jsonFormatter.path.label') }}</label>
        <div class="query-row">
          <input
            v-model="pathInput"
            class="path-input"
            data-test="jsonpath-input"
            type="text"
            :placeholder="t('jsonFormatter.path.placeholder')"
            @keydown.enter="runQuery"
          />
          <button class="btn primary" data-test="jsonpath-run" @click="runQuery">
            <Search :size="16" />
            {{ t('jsonFormatter.path.run') }}
          </button>
        </div>
        <p v-if="pathError" class="error" data-test="jsonpath-error">{{ pathError }}</p>
        <template v-if="pathMatches !== null">
          <div class="results-head">
            <span class="label" data-test="jsonpath-count">
              {{ t('jsonFormatter.path.matchCount', { count: String(pathMatches.length) }) }}
            </span>
            <button
              v-if="pathMatches.length > 0"
              class="btn"
              data-test="jsonpath-copy-all"
              @click="copyAllMatches"
            >
              <Copy :size="16" />
              {{ t('jsonFormatter.path.copyAll') }}
            </button>
          </div>
          <p v-if="pathMatches.length === 0" class="empty" data-test="jsonpath-empty">
            {{ t('jsonFormatter.path.empty') }}
          </p>
          <ul v-else class="matches" data-test="jsonpath-results">
            <li
              v-for="(match, index) in pathMatches"
              :key="index"
              class="match"
              data-test="jsonpath-match"
            >
              <div class="match-head">
                <code class="match-path">{{ match.path }}</code>
                <button class="btn" data-test="jsonpath-copy" @click="copyMatch(match)">
                  <Copy :size="14" />
                  {{ t('jsonFormatter.path.copyNode') }}
                </button>
              </div>
              <pre class="match-value">{{ formatMatch(match.value) }}</pre>
            </li>
          </ul>
        </template>
      </div>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Sparkles, Minimize2, Copy, Trash2, Search } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import { queryJsonPath } from './jsonpath'
import type { JsonPathError, JsonPathMatch } from './jsonpath'
import JsonFormatter from './JsonFormatter.vue'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'json-formatter',
  name: 'JSON 格式化',
  description: '格式化或压缩 JSON 数据，支持语法验证',
  category: 'format',
  icon: 'Braces',
  component: JsonFormatter,
  keywords: ['json', 'format', 'minify', 'validate']
}

const input = ref('')
const output = ref('')
const error = ref('')

const pathInput = ref('')
const pathError = ref('')
// null = query not run yet; [] = ran with zero matches (empty state)
const pathMatches = ref<JsonPathMatch[] | null>(null)

function format() {
  error.value = ''
  try {
    const parsed = JSON.parse(input.value)
    output.value = JSON.stringify(parsed, null, 2)
  } catch (e: any) {
    error.value = `${t('jsonFormatter.errParse')}: ${e.message}`
    output.value = ''
  }
}

function minify() {
  error.value = ''
  try {
    const parsed = JSON.parse(input.value)
    output.value = JSON.stringify(parsed)
  } catch (e: any) {
    error.value = `${t('jsonFormatter.errParse')}: ${e.message}`
    output.value = ''
  }
}

function copy() {
  navigator.clipboard.writeText(output.value)
}

function clear() {
  input.value = ''
  output.value = ''
  error.value = ''
  pathInput.value = ''
  pathError.value = ''
  pathMatches.value = null
}

// JSONPath is an additive layer over format/minify: it queries the current
// input document and never touches the output area.
async function runQuery() {
  const outcome = await queryJsonPath(input.value, pathInput.value)
  if (outcome.ok) {
    pathError.value = ''
    pathMatches.value = outcome.matches
  } else {
    pathError.value = queryErrorText(outcome.error)
    pathMatches.value = null
  }
}

function queryErrorText(queryError: JsonPathError): string {
  const prefix = {
    empty: t('jsonFormatter.path.emptyInput'),
    jsonParse: t('jsonFormatter.errParse'),
    invalidPath: t('jsonFormatter.path.errors.invalidPath'),
    queryError: t('jsonFormatter.path.errors.queryError'),
  }[queryError.code]
  return queryError.message ? `${prefix}: ${queryError.message}` : prefix
}

function formatMatch(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function copyMatch(match: JsonPathMatch) {
  navigator.clipboard.writeText(formatMatch(match.value))
}

function copyAllMatches() {
  if (pathMatches.value === null) return
  navigator.clipboard.writeText(formatMatch(pathMatches.value.map((match) => match.value)))
}
</script>

<style scoped>
.json-tool {
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

.error {
  color: var(--error);
  font-size: 13px;
  margin-top: var(--space-sm);
}

.query-row {
  display: flex;
  gap: var(--space-sm);
}

.path-input {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: var(--space-sm) var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.path-input:focus {
  border-color: var(--border-focus);
}

.path-input::placeholder {
  color: var(--text-quaternary);
}

.results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.empty {
  color: var(--text-tertiary);
  font-size: 13px;
  margin-top: var(--space-sm);
}

.matches {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
  padding: 0;
  list-style: none;
}

.match {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.match-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.match-path {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-all;
}

.match-value {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
