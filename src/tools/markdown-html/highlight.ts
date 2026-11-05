/**
 * 围栏代码语法高亮（13 票扩展）——触达加载（CONTEXT.md「触达加载」，无豁免）。
 *
 * - 仅当 md→html 的输出含围栏代码块（`<pre><code>`）时才 dynamic import
 *   highlight.js（lib/common 构建，固定语言集）与明暗两套主题样式（`?raw`
 *   文本，注入预览 iframe 的 srcdoc）；无代码块的文档零成本、零请求。
 * - 高亮仅预览路径：hljs span 只存在于本模块产出的预览 HTML；convert.ts 的
 *   复制/下载输出保持裸 `<pre><code>`（「输出即语义」不变，hljs span 不入输出）。
 * - 预览 HTML 仍经同一步净化（loadSanitizer，输出净化）：DOMPurify 默认配置
 *   保留 class 属性，hljs 标记在净化后原样留存。
 * - 主题跟随应用明暗（无主题选择器）：light=github / dark=github-dark，两套
 *   都在触达时加载，由组件按主题 store 响应式切换注入哪一套。
 * - 冷门语言（不在 common 语言集内）按纯文本渲染，并在代码块旁标注「无高亮」。
 *
 * 带高亮导出（10 票扩展）：「带高亮导出」开关默认关（输出即语义不变）；
 * 开启后复制/下载均为 hljs span + 自包含 <style> 块。导出文档由
 * buildStandaloneHighlightedDocument 组装：主体复用本模块已净化的预览
 * 片段（span/class 在 DOMPurify 默认配置下保留），<style> 为本模块在净化
 * **之后**注入的自有静态资产（minified github 单主题，≤2 KB 发布闸）——
 * 用户内容永远先净化、样式永远后注入，两条输入路径不交叉。
 */

import type { SanitizeHtml } from './convert'
import type hljs from 'highlight.js/lib/common'

/** 预览 iframe 中注入的主题样式文本（light/dark 两套，触达时同时加载）。 */
export interface HighlightThemeStyles {
  light: string
  dark: string
}

export interface HighlightedPreview {
  /** 预览专用 HTML（含 hljs span），已过统一净化步骤。 */
  html: string
  styles: HighlightThemeStyles
}

/** 输出 HTML 是否含围栏代码块（触达判定：不满足则 hljs 永不加载）。 */
export function outputHasCodeBlocks(outputHtml: string): boolean {
  return outputHtml.includes('<pre><code')
}

type HljsModule = typeof hljs

let cachedHljs: HljsModule | null = null
let cachedStyles: HighlightThemeStyles | null = null
let cachedPreviewMarked: { parse(src: string): string } | null = null

/** 「无高亮」标注文案：由 buildHighlightedPreview 注入（i18n 在 UI 层）。 */
let noHighlightLabel: string | null = null

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(text: string): string {
  return escapeHtmlText(text).replace(/"/g, '&quot;')
}

interface PreviewCodeToken {
  text: string
  lang?: string
}

interface PreviewMarkedOptions {
  gfm?: boolean
  breaks?: boolean
  renderer?: {
    code(token: PreviewCodeToken): string
  }
}

interface PreviewMarkedStatic {
  parse(src: string): string
}

type PreviewMarkedConstructor = new (options?: PreviewMarkedOptions) => PreviewMarkedStatic

async function loadHighlighter(): Promise<{ hljs: HljsModule; styles: HighlightThemeStyles }> {
  if (cachedHljs && cachedStyles) return { hljs: cachedHljs, styles: cachedStyles }

  // 触达加载：hljs 与两套主题样式（?raw 文本）都在此刻才拉取（异步块）。
  const [common, lightStyle, darkStyle, markedModule] = await Promise.all([
    import('highlight.js/lib/common'),
    import('highlight.js/styles/github.css?raw'),
    import('highlight.js/styles/github-dark.css?raw'),
    import('marked'),
  ])

  const hljs = common.default
  const styles: HighlightThemeStyles = { light: lightStyle.default, dark: darkStyle.default }

  const Marked = (markedModule as unknown as { Marked: PreviewMarkedConstructor }).Marked
  cachedPreviewMarked = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      // 预览专用 code 渲染器：hljs span 只在这里产生，输出路径不受影响。
      code(token: PreviewCodeToken): string {
        const lang = (token.lang ?? '').trim().split(/\s+/)[0] ?? ''
        if (!lang) {
          // 无语言标注：common 语言集内自动检测。
          return `<pre><code class="hljs">${hljs.highlightAuto(token.text).value}</code></pre>`
        }
        if (hljs.getLanguage(lang)) {
          const value = hljs.highlight(token.text, { language: lang, ignoreIllegals: true }).value
          return `<pre><code class="hljs language-${escapeAttribute(lang)}">${value}</code></pre>`
        }
        // 冷门语言：纯文本渲染 + 「无高亮」标注（仅预览路径）。
        return `<span class="hljs-miss">${escapeHtmlText(noHighlightLabel ?? '')}</span>` +
          `<pre><code class="hljs">${escapeHtmlText(token.text)}</code></pre>`
      },
    },
  })

  cachedHljs = hljs
  cachedStyles = styles
  return { hljs, styles }
}

export interface HighlightPreviewOptions {
  /** 统一净化步骤（convert.ts loadSanitizer 的产物，或测试注入的桩）。 */
  sanitize: SanitizeHtml
  /** 冷门语言标注文案（zh：无高亮 / en：No highlight）。 */
  noHighlightLabel: string
}

/**
 * 为预览构建带高亮的 HTML。调用方（组件）须先用 outputHasCodeBlocks 触达判定，
 * 未触达时不得调用本函数——hljs 的加载即发生在第一次进入这里。
 */
export async function buildHighlightedPreview(
  markdown: string,
  options: HighlightPreviewOptions,
): Promise<HighlightedPreview> {
  noHighlightLabel = options.noHighlightLabel
  const { styles } = await loadHighlighter()

  let raw: string
  try {
    raw = cachedPreviewMarked!.parse(markdown)
  } catch {
    // 预览高亮是附加层：渲染失败回退为裸输出（调用方用 output 兜底）。
    return { html: '', styles }
  }
  return { html: options.sanitize(raw), styles }
}

/* ------------------------------------------------------------------ *
 * 带高亮导出（10 票）：自包含文档 = 已净化片段 + 静态样式块
 * ------------------------------------------------------------------ */

/** 导出样式块体积闸：github 单主题 minified ≤ 2 KB（票据锁定，发布闸）。 */
export const HIGHLIGHT_EXPORT_STYLE_MAX_BYTES = 2 * 1024

/**
 * CSS 轻量压缩：去注释 + 折叠空白。只为样式块的体积闸服务，不做语义级
 * 优化（选择器/值原样保留，压缩后行为等价）。
 */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .trim()
}

export interface StandaloneHighlightedDocument {
  /** 完整自包含 HTML 文档（<!DOCTYPE html> 开头）。 */
  html: string
  /** 文档内 <style> 块主体（minified github 单主题）。 */
  styleCss: string
}

/**
 * 把已净化的高亮片段组装为自包含导出文档。纯同步函数：
 * - 主体 = buildHighlightedPreview 产出的净化片段（span/class 经 DOMPurify
 *   默认配置保留，script 已剥离）；
 * - 样式 = 预览 light 主题（github 单主题，与明暗无关）minified 后注入
 *   <head>，注入发生在净化之后，用户内容与样式资产不交叉。
 */
export function buildStandaloneHighlightedDocument(
  preview: HighlightedPreview,
): StandaloneHighlightedDocument {
  const styleCss = minifyCss(preview.styles.light)
  const html = [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>',
    styleCss,
    '</style></head><body>',
    preview.html,
    '</body></html>',
  ].join('')
  return { html, styleCss }
}
