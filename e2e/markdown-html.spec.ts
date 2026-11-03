import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 票据：.scratch/hot-tools-v0.3.0/issues/13-markdown-html-spec.md（验收 7 的 e2e 主路径）
// - GFM：表格 + 任务列表 checkbox（md→html 源码输出）
// - XSS：`<script>` 样本 → 源码输出与预览 iframe（srcdoc）均无 script 残留
// - html→md：标题 / 链接 / 列表还原
// - 复制 / 下载按钮存在；下载文件名 converted.html
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/markdown-html')
  await page.waitForSelector('[data-test="markdown-html-input"]')
}

const GFM_SAMPLE = [
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '- [x] done task',
  '- [ ] open task',
].join('\n')

test.describe('Markdown↔HTML e2e', () => {
  test('md→html：表格与任务列表 checkbox 渲染进源码输出', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="markdown-html-input"]', GFM_SAMPLE)

    const output = page.locator('[data-test="markdown-html-output"]')
    await expect(output).toHaveValue(/<table>/)
    await expect(output).toHaveValue(/<td>1<\/td>/)
    // 任务列表 → checkbox，勾选项带 checked
    await expect(output).toHaveValue(/type="checkbox"/)
    await expect(output).toHaveValue(/checked/)
    await expect(output).toHaveValue(/done task/)
    await expect(output).toHaveValue(/open task/)
  })

  test('XSS：`<script>` 在源码输出与预览 iframe 中均被净化', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="markdown-html-input"]',
      '<script>alert(1)</script>\n\n# Safe Title')

    const output = page.locator('[data-test="markdown-html-output"]')
    // 转换确实发生了（标题还在），script 标签彻底消失
    await expect(output).toHaveValue(/<h1>Safe Title<\/h1>/)
    await expect(output).not.toHaveValue(/<script/i)

    // 预览（默认收起）：展开后 iframe srcdoc 同样无 script
    await page.click('[data-test="preview-toggle"]')
    const preview = page.locator('[data-test="preview"]')
    await expect(preview).toBeVisible()
    const srcdoc = (await preview.getAttribute('srcdoc')) ?? ''
    expect(srcdoc).not.toMatch(/<script/i)
    expect(srcdoc).toContain('<h1>Safe Title</h1>')
  })

  test('html→md：标题 / 列表 / 链接还原', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="direction-html-to-md"]')
    await page.fill('[data-test="markdown-html-input"]',
      '<h2>Section</h2><ul><li>one</li><li>two</li></ul><p>See <a href="https://example.com/page">ex</a></p>')

    const output = page.locator('[data-test="markdown-html-output"]')
    await expect(output).toHaveValue(/## Section/)
    await expect(output).toHaveValue(/-\s+one/)
    await expect(output).toHaveValue(/-\s+two/)
    await expect(output).toHaveValue(/\[ex\]\(https:\/\/example\.com\/page\)/)
  })

  test('复制 / 下载按钮存在，下载文件名为 converted.html', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="markdown-html-input"]', '# Hello')
    const output = page.locator('[data-test="markdown-html-output"]')
    await expect(output).toHaveValue(/<h1>Hello<\/h1>/)

    const copy = page.locator('[data-test="copy"]')
    const download = page.locator('[data-test="download"]')
    await expect(copy).toBeVisible()
    await expect(download).toBeVisible()
    await expect(copy).toBeEnabled()
    await expect(download).toBeEnabled()

    const [downloadEvent] = await Promise.all([
      page.waitForEvent('download'),
      download.click(),
    ])
    expect(downloadEvent.suggestedFilename()).toBe('converted.html')
  })
})

// ---------------------------------------------------------------------------
// 13 票扩展：围栏代码语法高亮（触达加载 / 仅预览路径 / 主题跟随应用明暗）
// ---------------------------------------------------------------------------

const CODE_SAMPLE = '```js\nconst x = 1;\n```'
const PLAIN_SAMPLE = '# Title\n\nplain paragraph, no fences here.'

async function openHighlightTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/markdown-html')
  await page.waitForSelector('[data-test="markdown-html-input"]')
}

/** 记录所有 hljs/highlight 相关请求（触达加载的网络层断言）。 */
async function trackHljsRequests(page: import('@playwright/test').Page): Promise<string[]> {
  const urls: string[] = []
  await page.route(/hljs|highlight/i, (route) => {
    urls.push(route.request().url())
    return route.continue()
  })
  return urls
}

test.describe('围栏代码语法高亮 e2e（13 票扩展）', () => {
  test('触达加载：无代码块的文档不发起 hljs 请求；含代码块才加载', async ({ page }) => {
    await openHighlightTool(page)
    const hljsRequests = await trackHljsRequests(page)

    // 分支 A：无代码块 → 零 hljs 请求
    await page.fill('[data-test="markdown-html-input"]', PLAIN_SAMPLE)
    await expect(page.locator('[data-test="markdown-html-output"]')).toHaveValue(/<h1>Title<\/h1>/)
    await page.waitForTimeout(600) // 超过防抖 + 懒加载窗口，确认无请求
    expect(hljsRequests).toHaveLength(0)

    // 分支 B：含围栏代码块 → hljs chunk 被拉起
    await page.fill('[data-test="markdown-html-input"]', CODE_SAMPLE)
    await expect(page.locator('[data-test="markdown-html-output"]')).toHaveValue(/<pre><code>/)
    await expect(page.locator('[data-test="hljs-note"]')).toBeVisible({ timeout: 15000 })
    expect(hljsRequests.length).toBeGreaterThan(0)
  })

  test('hljs span 仅在预览 DOM：源码输出无 class，复制剪贴板无 span（输出即语义）', async ({ page }) => {
  // clipboard-write 仅 chromium 可授权（webkit 不支持该权限，仓库既有惯例）
  test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await openHighlightTool(page)
    await trackHljsRequests(page)

    await page.fill('[data-test="markdown-html-input"]', CODE_SAMPLE)
    const output = page.locator('[data-test="markdown-html-output"]')
    await expect(output).toHaveValue(/<pre><code>const x = 1;<\/code><\/pre>/)
    await expect(output).not.toHaveValue(/hljs/)

    await page.click('[data-test="copy"]')
    await page.waitForTimeout(200)
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toContain('<pre><code>const x = 1;</code></pre>')
    expect(clipboard).not.toContain('hljs')
    expect(clipboard).not.toContain('<span')

    // 预览 DOM（真实 DOMPurify 保留 hljs class）
    await page.click('[data-test="preview-toggle"]')
    const preview = page.locator('[data-test="preview"]')
    await expect(preview).toBeVisible({ timeout: 15000 })
    const srcdoc = (await preview.getAttribute('srcdoc')) ?? ''
    expect(srcdoc).toMatch(/hljs-keyword/)
    expect(srcdoc).not.toMatch(/<script/i)
  })

  test('明暗切换即时：srcdoc 的主题样式跟随 data-theme 翻转', async ({ page }) => {
    await openHighlightTool(page)
    await trackHljsRequests(page)

    await page.fill('[data-test="markdown-html-input"]', CODE_SAMPLE)
    await page.click('[data-test="preview-toggle"]')
    const preview = page.locator('[data-test="preview"]')
    await expect(preview).toBeVisible({ timeout: 15000 })
    await expect(preview).toHaveAttribute('srcdoc', /hljs-keyword/, { timeout: 15000 })

    // light 样式标记（github 主题基色）出现
    const srcdocLight = (await preview.getAttribute('srcdoc')) ?? ''
    const startTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    if (startTheme === 'light') {
      expect(srcdocLight).toContain('#24292e')
    } else {
      expect(srcdocLight).toContain('#c9d1d9')
    }

    // 点击头部主题按钮翻转 → srcdoc 主题样式随之切换（两套 CSS 均为触达加载）
    const before = (await preview.getAttribute('srcdoc')) ?? ''
    await page.click('header button.action-btn:has(svg.lucide-sun), header button.action-btn:has(svg.lucide-moon)')
    await expect(preview).not.toHaveAttribute('srcdoc', before, { timeout: 10000 })
    const after = (await preview.getAttribute('srcdoc')) ?? ''
    if (startTheme === 'light') {
      expect(after).toContain('#c9d1d9')
      expect(after).not.toContain('#24292e')
    } else {
      expect(after).toContain('#24292e')
      expect(after).not.toContain('#c9d1d9')
    }
  })

  test('冷门语言在预览中标注「无高亮」，输出保持裸代码', async ({ page }) => {
    await openHighlightTool(page)
    await trackHljsRequests(page)

    await page.fill('[data-test="markdown-html-input"]', '```brainfuck\n+++\n```')
    const output = page.locator('[data-test="markdown-html-output"]')
    await expect(output).toHaveValue(/<pre><code>\+\+\+<\/code><\/pre>/)

    await page.click('[data-test="preview-toggle"]')
    const preview = page.locator('[data-test="preview"]')
    await expect(preview).toBeVisible({ timeout: 15000 })
    const srcdoc = (await preview.getAttribute('srcdoc')) ?? ''
    expect(srcdoc).toContain('无高亮')
    expect(srcdoc).not.toContain('language-brainfuck')
  })
})
