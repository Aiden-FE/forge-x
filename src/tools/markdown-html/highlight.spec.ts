import { describe, expect, it, vi } from 'vitest'
import { mdToHtml } from './convert'
import type { SanitizeHtml } from './convert'
import { buildHighlightedPreview, outputHasCodeBlocks } from './highlight'

const identitySanitizer: SanitizeHtml = (html) => html

/** 与 convert.spec 同族的净化桩：镜像 DOMPurify 默认决策（script 移除、class 保留）。 */
function makeStubSanitizer(): SanitizeHtml {
  return (html) =>
    html
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*>/gi, '')
      .replace(/<\/script\s*>/gi, '')
}

/** 剥掉标签看代码本体（hljs span 会打断裸文本）。 */
function textContent(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

describe('outputHasCodeBlocks（触达判定）', () => {
  it('输出含 <pre><code> 才视为触达', () => {
    expect(outputHasCodeBlocks('<h1>Title</h1>')).toBe(false)
    expect(outputHasCodeBlocks('<p>inline <code>x</code> only</p>')).toBe(false)
    expect(outputHasCodeBlocks('<pre><code>const x = 1;</code></pre>')).toBe(true)
    expect(outputHasCodeBlocks('')).toBe(false)
  })

  it('mdToHtml 输出路径保持裸 <pre><code>（hljs 不入输出，输出即语义）', async () => {
    const outcome = await mdToHtml('```js\nconst x = 1;\n```', identitySanitizer)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outputHasCodeBlocks(outcome.value)).toBe(true)
      expect(outcome.value).toContain('<pre><code>')
      expect(outcome.value).not.toContain('hljs')
      expect(outcome.value).not.toContain('class=')
    }
  })
})

describe('buildHighlightedPreview（预览路径高亮）', () => {
  it('js 代码块产出 hljs span 与 language class（仅预览）', async () => {
    const preview = await buildHighlightedPreview('```js\nconst x = 1;\n```', {
      sanitize: identitySanitizer,
      noHighlightLabel: '无高亮',
    })

    expect(preview.html).toContain('class="hljs language-js"')
    expect(preview.html).toMatch(/<span class="hljs-keyword">const<\/span>/)
    expect(textContent(preview.html)).toContain('const x = 1;')
    // 两套主题样式随触达一并就位（vite 构建下为 github / github-dark 全文，
    // vitest node 管线对 ?raw 的 CSS 返回空串——结构存在性在此断言）。
    expect(typeof preview.styles.light).toBe('string')
    expect(typeof preview.styles.dark).toBe('string')
    expect('light' in preview.styles && 'dark' in preview.styles).toBe(true)
  })

  it('37 语言集抽样：python / css / json / bash / yaml 渲染出 hljs 标记', async () => {
    const samples: Array<[string, string]> = [
      ['python', 'def f(x):\n    return x'],
      ['css', '.a { color: red; }'],
      ['json', '{"k": 1}'],
      ['bash', 'echo $HOME'],
      ['yaml', 'key: value'],
    ]
    for (const [lang, code] of samples) {
      const preview = await buildHighlightedPreview('```' + lang + '\n' + code + '\n```', {
        sanitize: identitySanitizer,
        noHighlightLabel: '无高亮',
      })
      expect(preview.html, lang).toContain(`class="hljs language-${lang}"`)
      expect(preview.html, lang).toMatch(/hljs-/)
    }
  })

  it('冷门语言按纯文本渲染并标注「无高亮」', async () => {
    const preview = await buildHighlightedPreview(
      '```brainfuck\n++++++++[>++++[>++>+++>+++>+<<<<-]>+>+<->>+++[<]\n```',
      { sanitize: identitySanitizer, noHighlightLabel: '无高亮' },
    )

    expect(preview.html).toContain('<span class="hljs-miss">无高亮</span>')
    expect(preview.html).toContain('<pre><code class="hljs">')
    expect(preview.html).not.toContain('language-brainfuck')
    expect(preview.html).not.toMatch(/hljs-(keyword|attribute|string)/)
  })

  it('无语言标注的代码块走自动检测（hljsAuto）', async () => {
    const preview = await buildHighlightedPreview('```\nfunction f() { return 1 }\n```', {
      sanitize: identitySanitizer,
      noHighlightLabel: '无高亮',
    })

    expect(preview.html).toContain('<pre><code class="hljs">')
    expect(preview.html).toMatch(/hljs/)
  })

  it('预览高亮是 convert 输出之上的附加层：同一输入两条路径互不影响', async () => {
    const markdown = '```js\nconst x = 1;\n```'
    const outcome = await mdToHtml(markdown, identitySanitizer)
    expect(outcome.ok).toBe(true)
    const preview = await buildHighlightedPreview(markdown, {
      sanitize: identitySanitizer,
      noHighlightLabel: '无高亮',
    })

    if (!outcome.ok) return
    expect(outcome.value).not.toContain('hljs') // 复制/下载的输出无 span
    expect(preview.html).toContain('hljs') // 仅预览 DOM 有 span
    expect(textContent(preview.html)).toContain('const x = 1;') // 代码本体一致
  })

  it('预览原始物料恰好进入一次净化步骤，且已携带 hljs 标记（DOMPurify 默认配置保留 class 属性，真实保留由浏览器 e2e 复核）', async () => {
    const spy = vi.fn<SanitizeHtml>(makeStubSanitizer())
    const preview = await buildHighlightedPreview(
      '```js\nconst x = 1;\n```\n\n<script>alert(1)</script>',
      { sanitize: spy, noHighlightLabel: '无高亮' },
    )

    expect(spy).toHaveBeenCalledTimes(1)
    const sanitizedMaterial = spy.mock.calls[0]?.[0] ?? ''
    expect(sanitizedMaterial).toContain('class="hljs language-js"') // 净化器看到的是带 hljs 标记的预览物料
    // 桩镜像 DOMPurify：script 移除、hljs class 保留
    expect(preview.html).not.toMatch(/<script/i)
    expect(preview.html).not.toContain('alert(')
    expect(preview.html).toContain('class="hljs language-js"')
  })
})
