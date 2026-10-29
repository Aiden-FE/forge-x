import { test, expect } from '@playwright/test'

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
