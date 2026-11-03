/**
 * 13 票扩展：触达加载断言（逻辑层）。vi.mock 替换 highlight.js 与两套主题
 * 样式模块，用加载探针断言：
 * - 无代码块的文档：组件的触达闸门（outputHasCodeBlocks）为 false，
 *   buildHighlightedPreview 不被调用 → hljs 模块零加载（e2e 以网络层 mock
 *   复核同一事实）。
 * - 含代码块的文档：首次 buildHighlightedPreview 触发恰一次加载（模块缓存
 *   生效后不再重复加载）。
 */
import { describe, expect, it, vi } from 'vitest'

const probes = vi.hoisted(() => ({ hljsLoad: vi.fn(), cssLoad: vi.fn() }))

vi.mock('highlight.js/lib/common', () => {
  probes.hljsLoad()
  return {
    default: {
      getLanguage: (lang: string) => (lang === 'js' ? {} : undefined),
      highlight: () => ({ value: '<span class="hljs-keyword">const</span>' }),
      highlightAuto: () => ({ value: 'auto' }),
    },
  }
})
vi.mock('highlight.js/styles/github.css?raw', () => {
  probes.cssLoad()
  return { default: '/* light stub */' }
})
vi.mock('highlight.js/styles/github-dark.css?raw', () => {
  probes.cssLoad()
  return { default: '/* dark stub */' }
})

import { buildHighlightedPreview, outputHasCodeBlocks } from './highlight'
import type { SanitizeHtml } from './convert'

const identitySanitizer: SanitizeHtml = (html) => html

describe('触达加载：无代码块的文档零 hljs 成本', () => {
  it('纯文本文档的输出不触达闸门，hljs 不加载', async () => {
    expect(outputHasCodeBlocks('<h1>Title</h1><p>plain <em>text</em></p>')).toBe(false)

    // 组件逻辑：闸门为 false 时不会调用 buildHighlightedPreview——此处以
    // 探针零调用断言同一事实。
    expect(probes.hljsLoad).not.toHaveBeenCalled()
    expect(probes.cssLoad).not.toHaveBeenCalled()
  })

  it('含围栏代码块的文档首次触达时恰好加载一次（模块缓存生效）', async () => {
    const first = await buildHighlightedPreview('```js\nconst x = 1;\n```', {
      sanitize: identitySanitizer,
      noHighlightLabel: '无高亮',
    })
    expect(first.html).toContain('<span class="hljs-keyword">const</span>')
    expect(first.styles.light).toBe('/* light stub */')
    expect(first.styles.dark).toBe('/* dark stub */')
    expect(probes.hljsLoad).toHaveBeenCalledTimes(1)
    expect(probes.cssLoad).toHaveBeenCalledTimes(2)

    // 第二次转换同文档：不再加载（缓存）。
    await buildHighlightedPreview('```js\nconst y = 2;\n```', {
      sanitize: identitySanitizer,
      noHighlightLabel: '无高亮',
    })
    expect(probes.hljsLoad).toHaveBeenCalledTimes(1)
  })

  it('冷门语言走纯文本分支（探针桩未提供该语言）', async () => {
    const preview = await buildHighlightedPreview('```brainfuck\n+++\n```', {
      sanitize: identitySanitizer,
      noHighlightLabel: '无高亮',
    })
    expect(preview.html).toContain('<span class="hljs-miss">无高亮</span>')
  })
})
