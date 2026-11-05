import { test, expect } from '@playwright/test'

// 票据 .scratch/hot-tools-v0.5.0/issues/04-xml-formatter-spec.md（主路径 e2e）。
// 行/列断言基于真 Chromium（channel=chrome）DOMParser 的 parsererror 文案：
//   <a><b></a>  → error on line 1 at column 10: Unexpected closing tag: a != b
//   <a>AT&T</a> → error on line 1 at column 8: Unexpected token inside entity: <
// 良构校验权威是浏览器原生 DOMParser（无 XXE 面），e2e 在真浏览器闭环。
test.use({ locale: 'zh-CN' })

// 输入/模式切换均有 300ms 防抖，断言交给 toHaveValue/toContainText 自动重试。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/xml-formatter')
  await page.waitForSelector('[data-test="xml-input"]')
}

const GOOD_XML = '<a x="1"><b>text</b><c/></a>'

test.describe('XML 格式化 e2e', () => {
  test('良构 XML：格式化（2/4 空格）与压缩双模式', async ({ page }) => {
    await openTool(page)

    // 默认格式化 + 2 空格缩进：子元素换行缩进、自闭合 <c/> 保真
    await page.fill('[data-test="xml-input"]', GOOD_XML)
    await expect(page.locator('[data-test="xml-output"]')).toHaveValue(
      '<a x="1">\n  <b>text</b>\n  <c/>\n</a>',
    )
    await expect(page.locator('[data-test="xml-status"]')).toHaveText('XML 良构')

    // 缩进档位 4 空格
    await page.click('[data-test="xml-indent-4"]')
    await expect(page.locator('[data-test="xml-output"]')).toHaveValue(
      '<a x="1">\n    <b>text</b>\n    <c/>\n</a>',
    )

    // 压缩模式：换行与缩进剥离
    await page.click('[data-test="xml-minify"]')
    await expect(page.locator('[data-test="xml-output"]')).toHaveValue('<a x="1"><b>text</b><c/></a>')
    await expect(page.locator('[data-test="xml-status"]')).toHaveText('XML 良构')
  })

  test('畸形 XML：行/列错误呈现（真 Chromium 硬断言）；输出保留旧值', async ({ page }) => {
    await openTool(page)

    // 先有一次成功输出，确立「旧值」
    await page.fill('[data-test="xml-input"]', GOOD_XML)
    await expect(page.locator('[data-test="xml-output"]')).toHaveValue(
      '<a x="1">\n  <b>text</b>\n  <c/>\n</a>',
    )

    // 闭合标签错配：Chromium parsererror → 第 1 行第 10 列 + 引擎描述
    await page.fill('[data-test="xml-input"]', '<a><b></a>')
    await expect(page.locator('[data-test="xml-error"]')).toBeVisible()
    await expect(page.locator('[data-test="xml-error"]')).toContainText('XML 不良构')
    await expect(page.locator('[data-test="xml-error"]')).toContainText('第 1 行第 10 列')
    await expect(page.locator('[data-test="xml-error"]')).toContainText('Unexpected closing tag: a != b')
    // 只错该处：输出保留上一次成功值；良构状态行让位于错误行
    await expect(page.locator('[data-test="xml-output"]')).toHaveValue(
      '<a x="1">\n  <b>text</b>\n  <c/>\n</a>',
    )
    await expect(page.locator('[data-test="xml-status"]')).toHaveCount(0)
  })

  test('裸 & 实体非法：真浏览器良构拦截（happy-dom 单测缺口的闭环）', async ({ page }) => {
    await openTool(page)

    // 裸 & 在真 Chromium DOMParser 下即 parsererror（happy-dom 放行，单测无法覆盖）
    await page.fill('[data-test="xml-input"]', '<a>AT&T</a>')
    await expect(page.locator('[data-test="xml-error"]')).toBeVisible()
    await expect(page.locator('[data-test="xml-error"]')).toContainText('第 1 行第 8 列')
    await expect(page.locator('[data-test="xml-error"]')).toContainText('Unexpected token inside entity')
    // 无输出产生（从未成功过）
    await expect(page.locator('[data-test="xml-output"]')).toHaveValue('')
  })
})
