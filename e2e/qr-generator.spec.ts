import { test, expect } from '@playwright/test'

// QR generator capacity guard: over-capacity input must never reach
// `qrcode-generator` (it throws on `make()` and used to abort the render).
test.use({ locale: 'zh-CN' })

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/qr-generator')
  await page.waitForSelector('[data-test="qr-input"]')
}

const preview = (page: import('@playwright/test').Page) => page.locator('[data-test="qr-preview"]')
const limitError = (page: import('@playwright/test').Page) =>
  page.locator('[data-test="qr-limit-error"]')

test.describe('QR 生成器输入上限 e2e', () => {
  test('超长输入不再崩溃：内联报错、无二维码，缩短后恢复生成', async ({ page }) => {
    await openTool(page)
    const input = page.locator('[data-test="qr-input"]')

    await input.fill('a'.repeat(3000)) // M 级上限 2331 字节
    await expect(limitError(page)).toBeVisible()
    await expect(limitError(page)).toContainText('2331')
    await expect(limitError(page)).toContainText('3000')
    await expect(preview(page)).toHaveCount(0)
    await expect(page.locator('[data-test="qr-limit-empty"]')).toBeVisible()

    // 页面仍可交互：缩短到可编码内容后自动恢复
    await input.fill('hello')
    await expect(limitError(page)).toHaveCount(0)
    await expect(preview(page)).toBeVisible()
  })

  test('上限随纠错级别变化：可编码 → 切换 H 超限 → 切回 L 恢复', async ({ page }) => {
    await openTool(page)
    const input = page.locator('[data-test="qr-input"]')

    await input.fill('a'.repeat(2331)) // 恰好 M 级上限
    await expect(preview(page)).toBeVisible()
    await expect(limitError(page)).toHaveCount(0)

    await page.locator('input[name="qr-ecc"][value="H"]').check()
    await expect(limitError(page)).toContainText('1273')
    await expect(preview(page)).toHaveCount(0)

    await page.locator('input[name="qr-ecc"][value="L"]').check()
    await expect(limitError(page)).toHaveCount(0)
    await expect(preview(page)).toBeVisible()
  })
})
