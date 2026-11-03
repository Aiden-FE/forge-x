<template>
  <ToolLayout :tool="toolMeta">
    <div class="color-tool">
      <!-- 主色：色块 + 三个色式文本框双向同步 -->
      <section class="panel">
        <div class="main-row">
          <label class="swatch" :title="t('colorConverter.pick')">
            <span class="swatch-color" :style="{ background: currentCss }" />
            <input
              class="swatch-input"
              type="color"
              :value="opaqueHex"
              data-test="color-swatch"
              :aria-label="t('colorConverter.pick')"
              @input="onNativePick"
            />
          </label>
          <button v-if="eyeDropperAvailable" class="btn" data-test="eyedropper-btn" @click="pickFromScreen">
            <Pipette :size="16" />
            {{ t('colorConverter.eyedropper') }}
          </button>
        </div>
        <div class="fields">
          <div class="field">
            <label class="label" for="cc-hex">{{ t('colorConverter.hex') }}</label>
            <input
              id="cc-hex"
              v-model="hexText"
              class="input mono"
              :class="{ invalid: hexError }"
              data-test="hex-input"
              spellcheck="false"
              @input="queueHex"
            />
            <p v-if="hexError" class="error" data-test="hex-error">{{ hexError }}</p>
          </div>
          <div class="field">
            <label class="label" for="cc-rgb">{{ t('colorConverter.rgb') }}</label>
            <input
              id="cc-rgb"
              v-model="rgbText"
              class="input mono"
              :class="{ invalid: rgbError }"
              data-test="rgb-input"
              spellcheck="false"
              @input="queueRgb"
            />
            <p v-if="rgbError" class="error" data-test="rgb-error">{{ rgbError }}</p>
          </div>
          <div class="field">
            <label class="label" for="cc-hsl">{{ t('colorConverter.hsl') }}</label>
            <input
              id="cc-hsl"
              v-model="hslText"
              class="input mono"
              :class="{ invalid: hslError }"
              data-test="hsl-input"
              spellcheck="false"
              @input="queueHsl"
            />
            <p v-if="hslError" class="error" data-test="hsl-error">{{ hslError }}</p>
          </div>
        </div>
        <div class="actions">
          <button class="btn" data-test="set-foreground" @click="useAsForeground">
            {{ t('colorConverter.setForeground') }}
          </button>
          <button class="btn" data-test="set-background" @click="useAsBackground">
            {{ t('colorConverter.setBackground') }}
          </button>
        </div>
      </section>

      <!-- WCAG 对比度检查 -->
      <section class="panel">
        <h2 class="section-title">{{ t('colorConverter.contrast') }}</h2>
        <div class="contrast-grid">
          <div class="field">
            <label class="label" for="cc-fg">{{ t('colorConverter.foreground') }}</label>
            <div class="input-row">
              <span class="chip" :style="{ background: fgCss }" />
              <input
                id="cc-fg"
                v-model="fgText"
                class="input mono"
                :class="{ invalid: fgError }"
                data-test="contrast-fg"
                spellcheck="false"
                @input="queueFg"
              />
            </div>
            <p v-if="fgError" class="error" data-test="contrast-fg-error">{{ fgError }}</p>
          </div>
          <button class="btn swap" data-test="contrast-swap" :aria-label="t('colorConverter.swap')" @click="swapContrast">
            <ArrowLeftRight :size="16" />
          </button>
          <div class="field">
            <label class="label" for="cc-bg">{{ t('colorConverter.background') }}</label>
            <div class="input-row">
              <span class="chip" :style="{ background: bgCss }" />
              <input
                id="cc-bg"
                v-model="bgText"
                class="input mono"
                :class="{ invalid: bgError }"
                data-test="contrast-bg"
                spellcheck="false"
                @input="queueBg"
              />
            </div>
            <p v-if="bgError" class="error" data-test="contrast-bg-error">{{ bgError }}</p>
          </div>
        </div>
        <div class="contrast-result">
          <span class="ratio" data-test="contrast-ratio">{{ ratioText }}:1</span>
          <span
            v-for="level in levelBadges"
            :key="level.test"
            class="badge"
            :class="level.pass ? 'pass' : 'fail'"
            :data-test="level.test"
          >
            {{ level.label }} · {{ level.pass ? t('colorConverter.pass') : t('colorConverter.fail') }}
          </span>
        </div>
      </section>

      <!-- 色板（13 票扩展）：六规则固定产出；替换原「互补色」单 swatch 区
           （互补规则产出 2 色并入此区）。点击复制大写 HEX，悬停展示 HEX/RGB/HSL。 -->
      <section class="panel">
        <h2 class="section-title" data-test="palette-title">{{ t('colorConverter.palette.title') }}</h2>
        <p class="palette-hint" data-test="palette-hint">{{ t('colorConverter.palette.hint') }}</p>
        <div
          v-for="rule in PALETTE_RULES"
          :key="rule.id"
          class="palette-rule"
          :data-test="`palette-rule-${rule.id}`"
        >
          <span class="rule-label">{{ t(`colorConverter.palette.rules.${rule.id}`) }}</span>
          <div class="palette-swatches">
            <button
              v-for="(color, index) in palettes[rule.id]"
              :key="index"
              class="palette-swatch"
              :style="{ background: formatRgb(color) }"
              :title="swatchTooltip(color)"
              :data-test="`palette-swatch-${rule.id}-${index}`"
              :aria-label="`${t('colorConverter.palette.copyHex')} ${swatchTooltip(color)}`"
              @click="copyPaletteHex(rule.id, index, color)"
            >
              <Check v-if="copiedKey === `${rule.id}-${index}`" :size="16" class="copied-check" />
            </button>
          </div>
        </div>
        <p v-if="copiedMessage" class="hint copied" data-test="palette-copied">{{ copiedMessage }}</p>
      </section>
    </div>
  </ToolLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { ArrowLeftRight, Check, Pipette } from 'lucide-vue-next'
import ToolLayout from '@/components/ToolLayout.vue'
import { useI18n } from '@/composables/useI18n'
import type { ToolMeta } from '@/types/tool'
import ColorConverter from './ColorConverter.vue'
import {
  contrastRatio,
  formatHex,
  formatHsl,
  formatRgb,
  parseAny,
  parseHex,
  parseRgb,
  parseHsl,
  wcagLevels,
} from './color'
import type { RgbColor } from './color'
import { PALETTE_RULES, buildPalette, paletteHex, swatchTooltip } from './palette'
import type { PaletteRuleId } from './palette'

const { t } = useI18n()

const toolMeta: ToolMeta = {
  id: 'color-converter',
  name: '颜色转换器',
  description: 'HEX/RGB/HSL 互转、对比度检查与六规则色板',
  category: 'generate',
  icon: 'Palette',
  component: ColorConverter,
  keywords: ['color', 'hex', 'rgb', 'hsl', 'wcag', 'contrast', 'palette', '色板', '颜色'],
}

// ---- 规范色与三个色式文本框的双向同步 ----

const current = ref<RgbColor>({ r: 255, g: 0, b: 0, a: 1 })
const hexText = ref('')
const rgbText = ref('')
const hslText = ref('')
const hexError = ref('')
const rgbError = ref('')
const hslError = ref('')

/** 输入防抖：非法输入只标记当前框，其余框保留上一个合法值。 */
const DEBOUNCE_MS = 250
const pendingTimers = new Set<number>()
function deferred(fn: () => void): () => void {
  return () => {
    const id = window.setTimeout(() => {
      pendingTimers.delete(id)
      fn()
    }, DEBOUNCE_MS)
    pendingTimers.add(id)
  }
}
onUnmounted(() => {
  for (const id of pendingTimers) window.clearTimeout(id)
  if (paletteCopyTimer !== undefined) clearTimeout(paletteCopyTimer)
})

function setColor(color: RgbColor, source: 'hex' | 'rgb' | 'hsl' | 'external'): void {
  current.value = color
  if (source !== 'hex') {
    hexText.value = formatHex(color)
    hexError.value = ''
  }
  if (source !== 'rgb') {
    rgbText.value = formatRgb(color)
    rgbError.value = ''
  }
  if (source !== 'hsl') {
    hslText.value = formatHsl(color)
    hslError.value = ''
  }
}

function applyHex(): void {
  const res = parseHex(hexText.value)
  if (res.ok) setColor(res.color, 'hex')
  else hexError.value = t('colorConverter.errHex')
}
function applyRgb(): void {
  const res = parseRgb(rgbText.value)
  if (res.ok) setColor(res.color, 'rgb')
  else rgbError.value = t('colorConverter.errRgb')
}
function applyHsl(): void {
  const res = parseHsl(hslText.value)
  if (res.ok) setColor(res.color, 'hsl')
  else hslError.value = t('colorConverter.errHsl')
}

const queueHex = deferred(applyHex)
const queueRgb = deferred(applyRgb)
const queueHsl = deferred(applyHsl)

setColor(current.value, 'external')

const currentCss = computed(() => formatRgb(current.value))
/** <input type="color"> 只接受不透明 6 位 HEX。 */
const opaqueHex = computed(() => formatHex({ ...current.value, a: 1 }))

function onNativePick(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  const res = parseHex(value)
  if (res.ok) setColor(res.color, 'external')
}

// ---- EyeDropper 屏幕取色（运行时探测，不支持则不显示按钮） ----

interface EyeDropperResult {
  sRGBHex: string
}
interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>
}
type EyeDropperConstructor = new () => EyeDropperInstance

const eyeDropperAvailable = typeof window !== 'undefined' && 'EyeDropper' in window

async function pickFromScreen(): Promise<void> {
  const Ctor = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper
  if (!Ctor) return
  try {
    const result = await new Ctor().open()
    const parsed = parseHex(result.sRGBHex)
    if (parsed.ok) setColor(parsed.color, 'external')
  } catch {
    // 用户取消取色，忽略
  }
}

// ---- WCAG 对比度检查 ----

const fg = ref<RgbColor>({ r: 0, g: 0, b: 0, a: 1 })
const bg = ref<RgbColor>({ r: 255, g: 255, b: 255, a: 1 })
const fgText = ref(formatHex(fg.value))
const bgText = ref(formatHex(bg.value))
const fgError = ref('')
const bgError = ref('')

function setForeground(color: RgbColor): void {
  fg.value = color
  fgText.value = formatHex(color)
  fgError.value = ''
}
function setBackground(color: RgbColor): void {
  bg.value = color
  bgText.value = formatHex(color)
  bgError.value = ''
}

function applyFg(): void {
  const res = parseAny(fgText.value)
  if (res.ok) setForeground(res.color)
  else fgError.value = t('colorConverter.errColor')
}
function applyBg(): void {
  const res = parseAny(bgText.value)
  if (res.ok) setBackground(res.color)
  else bgError.value = t('colorConverter.errColor')
}

const queueFg = deferred(applyFg)
const queueBg = deferred(applyBg)

function swapContrast(): void {
  const prevFg = fg.value
  setForeground(bg.value)
  setBackground(prevFg)
}

function useAsForeground(): void {
  setForeground(current.value)
}
function useAsBackground(): void {
  setBackground(current.value)
}

const fgCss = computed(() => formatRgb(fg.value))
const bgCss = computed(() => formatRgb(bg.value))
const ratioText = computed(() => contrastRatio(fg.value, bg.value).toFixed(2))
const levelBadges = computed(() => {
  const levels = wcagLevels(contrastRatio(fg.value, bg.value))
  return [
    { test: 'level-aa-normal', label: t('colorConverter.levelAaNormal'), pass: levels.aaNormal },
    { test: 'level-aa-large', label: t('colorConverter.levelAaLarge'), pass: levels.aaLarge },
    { test: 'level-aaa-normal', label: t('colorConverter.levelAaaNormal'), pass: levels.aaaNormal },
    { test: 'level-aaa-large', label: t('colorConverter.levelAaaLarge'), pass: levels.aaaLarge },
  ]
})

// ---- 色板（13 票扩展：六规则固定产出，替换原互补色单 swatch 区） ----

const palettes = computed<Record<PaletteRuleId, RgbColor[]>>(() => {
  const map = {} as Record<PaletteRuleId, RgbColor[]>
  for (const rule of PALETTE_RULES) {
    map[rule.id] = buildPalette(rule.id, current.value)
  }
  return map
})

const copiedKey = ref('')
const copiedMessage = ref('')
let paletteCopyTimer: ReturnType<typeof setTimeout> | undefined

async function copyPaletteHex(ruleId: PaletteRuleId, index: number, color: RgbColor): Promise<void> {
  try {
    await navigator.clipboard.writeText(paletteHex(color))
    copiedKey.value = `${ruleId}-${index}`
    copiedMessage.value = t('colorConverter.palette.copied', { hex: paletteHex(color) })
    if (paletteCopyTimer !== undefined) clearTimeout(paletteCopyTimer)
    paletteCopyTimer = setTimeout(() => {
      copiedKey.value = ''
      copiedMessage.value = ''
    }, 1500)
  } catch {
    // Clipboard unavailable — silently ignore.
  }
}
</script>

<style scoped>
.color-tool {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.section-title {
  font-size: 15px;
  font-weight: 590;
  color: var(--text-primary);
  margin: 0;
}

.main-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.swatch {
  position: relative;
  display: inline-block;
  width: 72px;
  height: 40px;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  /* 棋盘格衬底，半透明 alpha 可见 */
  background:
    linear-gradient(45deg, var(--bg-hover) 25%, transparent 25%, transparent 75%, var(--bg-hover) 75%),
    linear-gradient(45deg, var(--bg-hover) 25%, var(--bg-surface) 25%, var(--bg-surface) 75%, var(--bg-hover) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 6px 6px;
  border: 1px solid var(--border);
}

.swatch-color {
  position: absolute;
  inset: 0;
}

.swatch-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}

@media (max-width: 720px) {
  .fields {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 510;
}

.input {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  padding: var(--space-sm) var(--space-md);
  outline: none;
  transition: border-color var(--transition-fast);
}

.input:focus {
  border-color: var(--border-focus);
}

.input.invalid {
  border-color: var(--error);
}

.mono {
  font-family: var(--font-mono);
}

.input-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.chip {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.error {
  color: var(--error);
  font-size: 12px;
  margin: 0;
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
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

.btn.swap {
  align-self: flex-end;
  padding: var(--space-sm);
}

.contrast-grid {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
}

.contrast-grid .field {
  flex: 1;
}

@media (max-width: 720px) {
  .contrast-grid {
    flex-direction: column;
  }

  .btn.swap {
    align-self: center;
    transform: rotate(90deg);
  }
}

.contrast-result {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.ratio {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 590;
  color: var(--text-primary);
}

.badge {
  font-size: 12px;
  padding: 2px var(--space-sm);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
}

.badge.pass {
  color: var(--success);
  border-color: var(--success);
}

.badge.fail {
  color: var(--error);
  border-color: var(--error);
}

.palette-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-quaternary);
}

.palette-rule {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.rule-label {
  min-width: 110px;
  font-size: 13px;
  color: var(--text-secondary);
}

.palette-swatches {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.palette-swatch {
  position: relative;
  width: 48px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: transform var(--transition-fast);
}

.palette-swatch:hover {
  transform: scale(1.06);
}

.copied-check {
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.6));
}

.hint.copied {
  margin: 0;
  font-family: var(--font-mono);
  color: var(--success);
}
</style>
