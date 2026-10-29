<template>
  <ToolLayout :tool="toolMeta">
    <div class="regex-tool">
      <!-- 1. 模式行：/ 前缀 + 输入 + / 后缀 + 标志复选框；错误条紧贴其下 -->
      <section class="panel">
        <label class="label" for="regex-pattern">{{ t('regexTester.patternLabel') }}</label>
        <div class="pattern-row">
          <span class="slash">/</span>
          <input
            id="regex-pattern"
            v-model="pattern"
            class="pattern-input"
            data-test="pattern-input"
            :placeholder="t('regexTester.patternPlaceholder')"
            spellcheck="false"
            autocomplete="off"
          />
          <span class="slash">/</span>
          <div class="flags" role="group" :aria-label="t('regexTester.flagsLabel')">
            <label
              v-for="f in visibleFlags"
              :key="f"
              class="flag"
              :title="t(`regexTester.flagDesc_${f}`)"
            >
              <input v-model="flags" type="checkbox" :value="f" :data-test="`flag-${f}`" />
              <span class="flag-letter">{{ f }}</span>
            </label>
          </div>
        </div>
        <p v-if="result && result.error !== null" class="error" data-test="pattern-error">
          {{ t('regexTester.patternErrorPrefix') }}{{ result.error }}
        </p>
        <p v-if="result && result.timedOut" class="error" data-test="timeout-error">
          {{ t('regexTester.timeoutMessage') }}
        </p>
        <div class="presets">
          <span class="label">{{ t('regexTester.presetsLabel') }}</span>
          <button
            v-for="p in PRESETS"
            :key="p.id"
            class="btn"
            type="button"
            :data-test="`preset-${p.id}`"
            :title="t(`regexTester.${p.descKey}`)"
            @click="applyPreset(p)"
          >
            {{ t(`regexTester.${p.labelKey}`) }}
          </button>
        </div>
      </section>

      <!-- 2. 测试文本 -->
      <section class="panel">
        <label class="label" for="regex-text">{{ t('regexTester.textLabel') }}</label>
        <textarea
          id="regex-text"
          v-model="text"
          class="textarea"
          data-test="text-input"
          :placeholder="t('regexTester.textPlaceholder')"
          rows="6"
          spellcheck="false"
        />
      </section>

      <!-- 3. 结果区：概要 → 高亮 → 列表（非法模式时仅显示错误条，无结果区残留） -->
      <section class="panel">
        <template v-if="result && result.error === null">
          <div class="summary" data-test="summary">
            <span class="summary-item" data-test="summary-count">
              {{ t('regexTester.summaryMatches', { count: String(result.matches.length) }) }}
            </span>
            <span class="summary-item" data-test="summary-duration">
              {{ t('regexTester.summaryDuration', { ms: String(Math.round(result.durationMs)) }) }}
            </span>
            <span v-if="result.truncated" class="badge warn" data-test="match-cap">
              {{ t('regexTester.matchCapNote', { limit: String(MAX_MATCHES) }) }}
            </span>
            <span v-if="result.textTruncated" class="badge warn" data-test="text-truncated">
              {{ t('regexTester.textTruncatedNote', { chars: String(result.removedChars) }) }}
            </span>
            <span v-if="result.timedOut" class="badge error" data-test="timeout-badge">
              {{ t('regexTester.timeoutBadge') }}
            </span>
          </div>

          <div class="subpanel">
            <span class="label">{{ t('regexTester.highlightLabel') }}</span>
            <div class="highlight" data-test="highlight">
              <template v-for="(seg, i) in segments" :key="i">
                <span v-if="seg.kind === 'text'" class="seg-text">{{ seg.text }}</span>
                <mark
                  v-else-if="seg.kind === 'match'"
                  class="seg-match"
                  :class="seg.alt ? 'alt-b' : 'alt-a'"
                >{{ seg.text }}</mark>
                <span v-else class="seg-zero" :title="t('regexTester.zeroWidthMarkLabel')" />
              </template>
            </div>
          </div>

          <div class="subpanel">
            <div class="list-head">
              <span class="label">{{ t('regexTester.listLabel') }}</span>
              <span class="hint">{{ t('regexTester.listIndexNote') }}</span>
            </div>
            <p v-if="result.matches.length === 0" class="empty" data-test="no-matches">
              {{ t('regexTester.noMatches') }}
            </p>
            <ul v-else class="match-list" data-test="match-list">
              <li
                v-for="(m, i) in visibleMatches"
                :key="i"
                class="match-row"
                :data-test="`match-row-${i}`"
              >
                <div class="row-main">
                  <span class="row-no">{{ i + 1 }}</span>
                  <code class="row-range">[{{ m.index }}, {{ m.end }})</code>
                  <span v-if="m.text === ''" class="zero-badge">{{ t('regexTester.zeroWidthLabel') }}</span>
                  <code v-else class="row-text">{{ m.text }}</code>
                </div>
                <div
                  v-if="m.groups.length > 0 || result.groupsMeta.named.length > 0"
                  class="row-groups"
                >
                  <span
                    v-for="(g, gi) in m.groups"
                    :key="`n${gi}`"
                    class="group-chip"
                  >
                    <span class="group-name">${{ gi + 1 }}</span>
                    <code>{{ g ?? 'undefined' }}</code>
                  </span>
                  <span
                    v-for="name in result.groupsMeta.named"
                    :key="name"
                    class="group-chip"
                  >
                    <span class="group-name">${{ name }}</span>
                    <code>{{ m.named[name] ?? 'undefined' }}</code>
                  </span>
                </div>
                <button
                  class="btn small"
                  type="button"
                  :data-test="`copy-match-${i}`"
                  @click="copyMatchJson(m, i)"
                >
                  {{ copiedIndex === i ? t('regexTester.copied') : t('regexTester.copyMatchJson') }}
                </button>
              </li>
            </ul>
            <p v-if="result.matches.length > DISPLAY_LIMIT" class="hint">
              {{ t('regexTester.listDisplayCap', { limit: String(DISPLAY_LIMIT) }) }}
            </p>
          </div>
        </template>
        <p v-else class="empty" data-test="waiting">{{ t('regexTester.waitingEmpty') }}</p>
      </section>

      <!-- 4. 替换分区（页内分区，非 tab） -->
      <section class="panel">
        <label class="label" for="regex-replacement">{{ t('regexTester.replaceLabel') }}</label>
        <input
          id="regex-replacement"
          v-model="replacement"
          class="text-input"
          data-test="replacement-input"
          :placeholder="t('regexTester.replacePlaceholder')"
          spellcheck="false"
          autocomplete="off"
        />
        <p class="hint">{{ t('regexTester.replaceHint') }}</p>
        <div v-if="result && result.replacement !== null" class="subpanel">
          <div class="list-head">
            <span class="label">{{ t('regexTester.replacePreviewLabel') }}</span>
            <button class="btn small" type="button" data-test="copy-replace" @click="copyReplace">
              {{ copiedReplace ? t('regexTester.copied') : t('regexTester.copy') }}
            </button>
          </div>
          <pre class="replace-preview" data-test="replace-preview">{{ result.replacement }}</pre>
        </div>
      </section>

      <!-- 5. 语法速查（默认收起） -->
      <section class="panel">
        <details class="cheatsheet" data-test="cheatsheet">
          <summary>{{ t('regexTester.cheatsheetTitle') }}</summary>
          <div class="cheat-grid">
            <div v-for="cat in CHEAT_SHEET" :key="cat.titleKey" class="cheat-cat">
              <h3 class="cheat-title">{{ t(`regexTester.${cat.titleKey}`) }}</h3>
              <dl class="cheat-entries">
                <template v-for="e in cat.entries" :key="e.syntax">
                  <dt><code>{{ e.syntax }}</code></dt>
                  <dd>{{ t(`regexTester.${e.descKey}`) }}</dd>
                </template>
              </dl>
            </div>
          </div>
        </details>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import { MatchClient } from './match-client'
import { DEFAULT_FLAGS, MAX_MATCHES, probeSupportedFlags } from './regex-engine'
import type { MatchItem, MatchRequest, MatchResponse } from './regex-engine'
import RegexTester from './RegexTester.vue'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'regex-tester',
  name: '正则测试器',
  description: '匹配高亮、分组列示与替换预览，Worker 隔离防 ReDoS',
  category: 'debug',
  icon: 'Regex',
  component: RegexTester,
  keywords: ['regex', 'regexp', '正则', '匹配', '替换', 'debug'],
}

// ---- 状态与实时（防抖，延续 text-stats 惯例） ----

const DEBOUNCE_MS = 250

const pattern = ref('')
const text = ref('')
const replacement = ref('')
const flags = ref<string[]>([...DEFAULT_FLAGS])

// 标志支持探测：运行时不支持的标志隐藏（含仅探测支持才显示的 v）
const visibleFlags = probeSupportedFlags()

const debouncedPattern = ref('')
const debouncedText = ref('')
const debouncedReplacement = ref('')

let debounceTimer: number | undefined

function runNow(): void {
  if (debounceTimer !== undefined) {
    window.clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  debouncedPattern.value = pattern.value
  debouncedText.value = text.value
  debouncedReplacement.value = replacement.value
  run()
}

function scheduleDebounced(): void {
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(runNow, DEBOUNCE_MS)
}

watch([pattern, text, replacement], scheduleDebounced)
// 标志是离散点击：立即用当前输入执行（不走防抖）
watch(flags, runNow, { deep: true })

// ---- Worker 运行（每次运行重建，1.5s 未响应 terminate） ----

const client = new MatchClient()
const result = ref<MatchResponse | null>(null)

function run(): void {
  if (debouncedPattern.value === '') {
    // 空模式 = 「等待输入」空状态，不报错、不执行
    result.value = null
    client.dispose()
    return
  }
  const req: MatchRequest = {
    pattern: debouncedPattern.value,
    flags: flags.value.join(''),
    text: debouncedText.value,
  }
  if (debouncedReplacement.value !== '') req.replacement = debouncedReplacement.value
  // 结果与文本配对：回调只对最新一次运行生效，回包时才刷新渲染文本
  client.run(req, (res) => {
    result.value = res
    renderText.value = req.text
  })
}

onUnmounted(() => {
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
  client.dispose()
})

// ---- 高亮：交替底色（按非零宽匹配序号奇偶）；零宽渲染为竖线标记 ----

const renderText = ref('')

interface Segment {
  kind: 'text' | 'match' | 'zero'
  text: string
  alt: boolean
}

const segments = computed<Segment[]>(() => {
  const res = result.value
  const src = renderText.value
  if (!res || src === '') return []
  if (res.matches.length === 0) return [{ kind: 'text', text: src, alt: false }]
  const out: Segment[] = []
  let pos = 0
  let ordinal = 0 // 仅非零宽匹配参与奇偶交替
  for (const m of res.matches) {
    if (m.index < pos) continue // 防御：引擎保证有序，异常输入直接跳过
    if (m.index > pos) out.push({ kind: 'text', text: src.slice(pos, m.index), alt: false })
    if (m.text === '') {
      out.push({ kind: 'zero', text: '', alt: false })
    } else {
      out.push({ kind: 'match', text: src.slice(m.index, m.end), alt: ordinal % 2 === 1 })
      ordinal++
    }
    pos = Math.max(pos, m.end)
  }
  if (pos < src.length) out.push({ kind: 'text', text: src.slice(pos), alt: false })
  return out
})

// ---- 匹配列表 ----

/** 列表渲染上限：概要行始终给出完整计数（防 5000 行 DOM 卡顿） */
const DISPLAY_LIMIT = 500

const visibleMatches = computed<MatchItem[]>(() => result.value?.matches.slice(0, DISPLAY_LIMIT) ?? [])

// ---- 预设（名称与描述双语，模式本身不翻译；插入不改标志） ----

const PRESETS = [
  {
    id: 'email',
    labelKey: 'presetEmail',
    descKey: 'presetEmailDesc',
    pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
  },
  {
    id: 'url',
    labelKey: 'presetUrl',
    descKey: 'presetUrlDesc',
    pattern: 'https?://[^\\s/$.?#].[^\\s]*',
  },
  {
    id: 'ipv4',
    labelKey: 'presetIpv4',
    descKey: 'presetIpv4Desc',
    pattern: '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}',
  },
  {
    id: 'date',
    labelKey: 'presetDate',
    descKey: 'presetDateDesc',
    pattern: '\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])',
  },
  {
    id: 'phone',
    labelKey: 'presetPhone',
    descKey: 'presetPhoneDesc',
    pattern: '1[3-9]\\d{9}',
  },
] as const

function applyPreset(p: (typeof PRESETS)[number]): void {
  pattern.value = p.pattern
}

// ---- 复制 ----

const copiedIndex = ref(-1)
const copiedReplace = ref(false)
let copiedTimer: number | undefined

async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s)
    return true
  } catch {
    return false
  }
}

function matchJson(m: MatchItem): string {
  const payload: Record<string, unknown> = {
    index: m.index,
    end: m.end,
    text: m.text,
    groups: m.groups,
    named: m.named,
  }
  if (m.indices) payload.indices = m.indices
  return JSON.stringify(payload)
}

async function copyMatchJson(m: MatchItem, i: number): Promise<void> {
  if (!(await copyText(matchJson(m)))) return
  copiedIndex.value = i
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copiedIndex.value = -1
    copiedTimer = undefined
  }, 2000)
}

async function copyReplace(): Promise<void> {
  const r = result.value
  if (!r || r.replacement === null) return
  if (!(await copyText(r.replacement))) return
  copiedReplace.value = true
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copiedReplace.value = false
    copiedTimer = undefined
  }, 2000)
}

// ---- 语法速查（条目双语，示例正则不翻译；标志说明复用 flagDesc_*） ----

interface CheatEntry {
  syntax: string
  descKey: string
}
interface CheatCategory {
  titleKey: string
  entries: CheatEntry[]
}

const ALL_FLAG_KEYS = ['g', 'i', 'm', 's', 'u', 'y', 'd', 'v'] as const

const CHEAT_SHEET: CheatCategory[] = [
    {
    titleKey: 'cheatCharClass',
    entries: [
      { syntax: '\\d', descKey: 'cheatDigit' },
      { syntax: '\\w', descKey: 'cheatWord' },
      { syntax: '\\s', descKey: 'cheatSpace' },
      { syntax: '.', descKey: 'cheatDot' },
      { syntax: '[abc]', descKey: 'cheatSet' },
      { syntax: '[^abc]', descKey: 'cheatNotSet' },
      { syntax: '[a-z]', descKey: 'cheatRange' },
    ],
  },
  {
    titleKey: 'cheatQuantifier',
    entries: [
      { syntax: '*', descKey: 'cheatStar' },
      { syntax: '+', descKey: 'cheatPlus' },
      { syntax: '?', descKey: 'cheatOpt' },
      { syntax: '{n}', descKey: 'cheatN' },
      { syntax: '{n,}', descKey: 'cheatNMin' },
      { syntax: '{n,m}', descKey: 'cheatNM' },
      { syntax: '*? +? ??', descKey: 'cheatLazy' },
    ],
  },
  {
    titleKey: 'cheatAnchor',
    entries: [
      { syntax: '^', descKey: 'cheatCaret' },
      { syntax: '$', descKey: 'cheatDollar' },
      { syntax: '\\b', descKey: 'cheatWordB' },
      { syntax: '\\B', descKey: 'cheatNotWordB' },
    ],
  },
  {
    titleKey: 'cheatGroup',
    entries: [
      { syntax: '(abc)', descKey: 'cheatGroupCap' },
      { syntax: '(?<name>abc)', descKey: 'cheatGroupNamed' },
      { syntax: '(?:abc)', descKey: 'cheatGroupNonCap' },
      { syntax: '\\1', descKey: 'cheatBackref' },
      { syntax: '\\k<name>', descKey: 'cheatNamedRef' },
    ],
  },
  {
    titleKey: 'cheatAssertion',
    entries: [
      { syntax: '(?=…)', descKey: 'cheatLookahead' },
      { syntax: '(?!…)', descKey: 'cheatNegLookahead' },
      { syntax: '(?<=…)', descKey: 'cheatLookbehind' },
      { syntax: '(?<!…)', descKey: 'cheatNegLookbehind' },
    ],
  },
  {
    titleKey: 'cheatFlags',
    entries: ALL_FLAG_KEYS.map((f) => ({ syntax: f, descKey: `flagDesc_${f}` })),
  },
]
</script>

<style scoped>
.regex-tool {
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

.hint {
  font-size: 12px;
  color: var(--text-quaternary);
  margin: 0;
}

.error {
  color: var(--error);
  font-size: 13px;
  margin: 0;
  font-family: var(--font-mono);
  word-break: break-all;
}

/* 模式行 */
.pattern-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.slash {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-quaternary);
}

.pattern-input {
  flex: 1;
  min-width: 200px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 14px;
  padding: var(--space-sm) var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.pattern-input:focus {
  border-color: var(--border-focus);
}

.pattern-input::placeholder {
  color: var(--text-quaternary);
}

.flags {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.flag {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.flag:hover {
  background: var(--bg-hover);
}

.flag input {
  accent-color: var(--accent);
}

.flag-letter {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 590;
}

/* 预设 */
.presets {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  margin-top: var(--space-xs);
}

/* 输入区 */
.textarea,
.text-input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.textarea {
  resize: vertical;
  line-height: 1.5;
}

.text-input {
  font-size: 14px;
}

.textarea:focus,
.text-input:focus {
  border-color: var(--border-focus);
}

.textarea::placeholder,
.text-input::placeholder {
  color: var(--text-quaternary);
}

/* 概要与徽标 */
.summary {
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.summary-item {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 590;
}

.badge {
  font-size: 12px;
  padding: 2px var(--space-sm);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
}

.badge.warn {
  color: var(--warning);
}

.badge.error {
  color: var(--error);
}

.subpanel {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

/* 高亮预览 */
.highlight {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  min-height: 40px;
  max-height: 320px;
  overflow: auto;
}

.seg-text {
  color: var(--text-primary);
}

.seg-match {
  border-radius: 3px;
  padding: 0 1px;
  color: var(--text-primary);
}

.seg-match.alt-a {
  background: color-mix(in srgb, var(--accent) 30%, transparent);
}

.seg-match.alt-b {
  background: color-mix(in srgb, var(--warning) 32%, transparent);
}

.seg-zero {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin: 0 1px;
  vertical-align: text-bottom;
  background: var(--error);
}

/* 匹配列表 */
.list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.match-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.match-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.row-main {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.row-no {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-quaternary);
  min-width: 28px;
}

.row-range {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
}

.row-text {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
  white-space: pre-wrap;
}

.zero-badge {
  font-size: 11px;
  color: var(--error);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 0 var(--space-sm);
}

.row-groups {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.group-chip {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-xs);
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 1px var(--space-sm);
}

.group-chip code {
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.group-name {
  color: var(--accent);
}

/* 按钮 */
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

.btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn.small {
  align-self: flex-start;
  padding: 2px var(--space-sm);
  font-size: 12px;
}

/* 替换预览 */
.replace-preview {
  margin: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 320px;
  overflow: auto;
}

/* 空状态 */
.empty {
  font-size: 13px;
  color: var(--text-quaternary);
  padding: var(--space-lg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  margin: 0;
}

/* 语法速查（默认收起） */
.cheatsheet {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}

.cheatsheet summary {
  padding: var(--space-sm) var(--space-md);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.cheatsheet summary:hover {
  color: var(--text-primary);
}

.cheat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-md);
  padding: 0 var(--space-md) var(--space-md);
}

.cheat-title {
  font-size: 13px;
  font-weight: 590;
  color: var(--text-primary);
  margin: 0 0 var(--space-xs);
}

.cheat-entries {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.cheat-entries dt {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--accent);
}

.cheat-entries dd {
  margin: 0 0 var(--space-xs) 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
