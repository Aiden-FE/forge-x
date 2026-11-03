import { test, expect } from '@playwright/test'

// 300ms 实时防抖（DOMParser 主线程执行），断言交给自动重试。
// e2e 主路径（验收 7）：粘贴 → 实时解码 → 切换方向 → 复制。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/html-entity')
  await page.waitForSelector('[data-test="he-input"]')
}

test.describe('HTML 实体转义 e2e', () => {
  test('escape 方向：五必需实体实时转义，撇号产出 &#39;', async ({ page }) => {
    await openTool(page)
    // 默认 escape 方向
    await page.fill('[data-test="he-input"]', 'A & B < C > D " E \' F')
    await expect(page.locator('[data-test="he-output"]')).toHaveValue(
      'A &amp; B &lt; C &gt; D &quot; E &#39; F',
    )
    await expect(page.locator('[data-test="he-error"]')).toHaveCount(0)
  })

  test('unescape 方向：标签字面保留 + 命名/数字引用解码', async ({ page }) => {
    await openTool(page)
    await page.click('[data-test="he-mode-unescape"]')

    await page.fill('[data-test="he-input"]', '<b>x</b>&amp;y')
    await expect(page.locator('[data-test="he-output"]')).toHaveValue('<b>x</b>&y')

    // 全表抽样 + 数字引用（星面 emoji）
    await page.fill('[data-test="he-input"]', '&copy; &eacute; &forall; &#x1F600; &#20013;')
    await expect(page.locator('[data-test="he-output"]')).toHaveValue('© é ∀ 😀 中')

    // 无分号历史实体按原生规则
    await page.fill('[data-test="he-input"]', 'a&ampb')
    await expect(page.locator('[data-test="he-output"]')).toHaveValue('a&b')
  })

  test('未知命名实体 → 行级错误定位，其余行照常', async ({ page }) => {
    await openTool(page)
    await page.click('[data-test="he-mode-unescape"]')
    await page.fill('[data-test="he-input"]', 'fine &amp;\nbad &unknownname;')
    await expect(page.locator('[data-test="he-output"]')).toHaveValue('fine &\nbad &unknownname;')
    await expect(page.locator('[data-test="he-error"]')).toBeVisible()
    await expect(page.locator('[data-test="he-error"]')).toContainText('2')
  })

  test('切换方向 → 同一输入即时按新方向重算；复制语义正确', async ({ page }) => {
    await openTool(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.fill('[data-test="he-input"]', '<b>')
    await expect(page.locator('[data-test="he-output"]')).toHaveValue('&lt;b&gt;')

    // 切到反转义：字面标签中的字符引用解码回文本
    await page.click('[data-test="he-mode-unescape"]')
    await expect(page.locator('[data-test="he-output"]')).toHaveValue('<b>')

    await page.click('[data-test="he-copy"]')
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe('<b>')
  })
})
