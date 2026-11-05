/**
 * 10 票扩展：带高亮导出验收。
 *
 * - DOMPurify 断言（沿 highlight.spec 桩先例，镜像默认配置决策）：
 *   span/class 保留、script 剥离——净化恰一次，发生在样式块注入之前；
 * - span 数量与预览一致（导出只是包装，不增删高亮标记）；
 * - 样式块存在：github 单主题（light）minified 后嵌入 <head>，dark 不入文档；
 * - 体积闸：真实 highlight.js github.css 资产 minified ≤ 2 KB（票据发布闸）；
 * - 默认路径不受影响：语义输出无 hljs 标记（输出即语义不变，开关默认关）。
 */
import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mdToHtml } from './convert'
import type { SanitizeHtml } from './convert'
import { buildHighlightedPreview } from './highlight'
import {
  HIGHLIGHT_EXPORT_STYLE_MAX_BYTES,
  buildStandaloneHighlightedDocument,
  minifyCss,
} from './highlight'
import type { HighlightedPreview } from './highlight'

const nodeRequire = createRequire(import.meta.url)

/** 真实主题资产（与 highlight.ts 运行时 ?raw 加载的同一文件；resolve 只取路径，
 * 读取走 node:fs，避免 vite 管线把 CSS 当模块转换）。 */
const githubCss: string = readFileSync(
  nodeRequire.resolve('highlight.js/styles/github.css'),
  'utf8',
)

/** 与 highlight.spec 同族的净化桩：镜像 DOMPurify 默认决策（script 移除、span/class 保留）。 */
function makeStubSanitizer(): SanitizeHtml {
  return (html) =>
    html
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*>/gi, '')
      .replace(/<\/script\s*>/gi, '')
}

function countSpans(html: string): number {
  return (html.match(/<span\b/g) ?? []).length
}

function makePreview(html: string, light = githubCss, dark = '/* dark theme css */'): HighlightedPreview {
  return { html, styles: { light, dark } }
}

describe('buildStandaloneHighlightedDocument（自包含文档组装）', () => {
  const fragment =
    '<pre><code class="hljs language-js"><span class="hljs-keyword">const</span> x = 1;</code></pre>'

  it('结构：DOCTYPE + head 内 <style> 块 + 主体片段原样嵌入', () => {
    const doc = buildStandaloneHighlightedDocument(makePreview(fragment))
    expect(doc.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(doc.html.endsWith('</html>')).toBe(true)
    expect(doc.html).toContain('<head><meta charset="utf-8"><style>')
    expect(doc.html).toContain(`</style></head><body>${fragment}</body>`)
  })

  it('单主题：嵌入 light（github）样式，dark 不入文档', () => {
    const doc = buildStandaloneHighlightedDocument(makePreview(fragment))
    expect(doc.styleCss).toBe(minifyCss(githubCss))
    expect(doc.html).not.toContain('/* dark theme css */')
  })

  it('span 数量与预览片段一致：导出只包装，不增删高亮标记', () => {
    const doc = buildStandaloneHighlightedDocument(makePreview(fragment))
    expect(countSpans(doc.html)).toBe(countSpans(fragment))
    expect(doc.html).toContain('class="hljs language-js"')
    expect(doc.html).toContain('<span class="hljs-keyword">const</span>')
  })

  it('样式块存在性兜底：空样式（vitest node 管线 ?raw 为空串）时 <style> 结构仍在', () => {
    const doc = buildStandaloneHighlightedDocument(makePreview(fragment, '', ''))
    expect(doc.html).toContain('<style></style></head>')
    expect(doc.styleCss).toBe('')
  })
})

describe('DOMPurify 断言（span/class 保留、script 剥离；沿桩先例）', () => {
  it('片段经恰一次净化；导出文档保留 span/class、无 script', async () => {
    const spy = vi.fn<SanitizeHtml>(makeStubSanitizer())
    const preview = await buildHighlightedPreview(
      '```js\nconst x = 1;\n```\n\n<script>alert(1)</script>',
      { sanitize: spy, noHighlightLabel: '无高亮' },
    )
    expect(spy).toHaveBeenCalledTimes(1)
    // 净化器看到的是带 hljs 标记的预览物料（span/class 在其之前已生成）。
    expect(spy.mock.calls[0]?.[0] ?? '').toContain('class="hljs language-js"')

    const doc = buildStandaloneHighlightedDocument({
      html: preview.html,
      styles: { light: githubCss, dark: '' },
    })
    expect(doc.html).not.toMatch(/<script/i)
    expect(doc.html).not.toContain('alert(')
    expect(doc.html).toContain('class="hljs language-js"') // span/class 经净化保留
    // span 数量与净化后的预览片段一致。
    expect(countSpans(doc.html)).toBe(countSpans(preview.html))
  })
})

describe('体积闸：github 单主题样式块 ≤ 2 KB（发布闸）', () => {
  it('真实 highlight.js github.css 资产 minified 后不超过闸值', () => {
    const minified = minifyCss(githubCss)
    expect(Buffer.byteLength(minified, 'utf8')).toBeLessThanOrEqual(HIGHLIGHT_EXPORT_STYLE_MAX_BYTES)
    expect(minified).not.toContain('/*')
  })

  it('minifyCss：去注释、折叠空白，选择器与声明保留', () => {
    expect(
      minifyCss('/* c */ .hljs-keyword { color : #cf222e ; } \n .hljs-string { }'),
    ).toBe('.hljs-keyword{color:#cf222e;}.hljs-string{}')
  })
})

describe('默认路径不受影响（输出即语义不变，开关默认关）', () => {
  it('语义输出与导出文档两路径独立：前者无 hljs，后者有', async () => {
    const markdown = '```js\nconst x = 1;\n```'
    const outcome = await mdToHtml(markdown, makeStubSanitizer())
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // 语义输出（开关关闭时的复制/下载内容）：裸 <pre><code>，无 hljs 标记。
    expect(outcome.value).toContain('<pre><code>')
    expect(outcome.value).not.toContain('hljs')
    expect(outcome.value).not.toContain('class=')

    // 导出文档（开关开启且片段存在）：hljs span + 自包含样式块。
    const preview = await buildHighlightedPreview(markdown, {
      sanitize: makeStubSanitizer(),
      noHighlightLabel: '无高亮',
    })
    const doc = buildStandaloneHighlightedDocument({
      html: preview.html,
      styles: { light: githubCss, dark: '' },
    })
    expect(doc.html).toContain('hljs')
    expect(doc.html).toContain('<style>')
    // 代码本体两条路径一致（剥标签后同文）。
    const textOf = (html: string) => html.replace(/<[^>]+>/g, '')
    expect(textOf(doc.html)).toContain('const x = 1;')
    expect(textOf(outcome.value)).toContain('const x = 1;')
  })
})
