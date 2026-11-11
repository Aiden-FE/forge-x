import { test, expect } from '@playwright/test'

// 顶栏全局 `/` 快捷键不能抢占文本输入；在非输入区域仍应聚焦搜索框。
test.use({ locale: 'zh-CN' })

test.describe('顶栏搜索快捷键 /', () => {
  test('在工具 textarea 中输入 URL 时 / 正常插入，焦点留在输入框', async ({ page }) => {
    await page.goto('/#/tool/qr-generator')
    const qrInput = page.locator('[data-test="qr-input"]')
    const search = page.locator('.search-input')

    await qrInput.click()
    await page.keyboard.type('https://example.com')

    await expect(qrInput).toHaveValue('https://example.com')
    await expect(qrInput).toBeFocused()
    await expect(search).not.toBeFocused()
    await expect(search).toHaveValue('')
  })

  test('非文本输入区域按 / 仍聚焦搜索框', async ({ page }) => {
    await page.goto('/#/tool/qr-generator')
    const search = page.locator('.search-input')

    // 点 main 的空白内边距，避免把焦点落到任何表单控件
    await page.locator('main').click({ position: { x: 4, y: 4 } })
    await expect(search).not.toBeFocused()

    await page.keyboard.press('/')
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('')
  })

  test('搜索框自身输入 / 正常插入，不被快捷键吞掉', async ({ page }) => {
    await page.goto('/')
    const search = page.locator('.search-input')

    await search.click()
    await page.keyboard.type('/tool')

    await expect(search).toHaveValue('/tool')
    await expect(search).toBeFocused()
  })
})
