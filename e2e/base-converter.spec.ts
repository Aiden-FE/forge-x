import { test, expect } from '@playwright/test'

// 字段输入有 250ms 防抖，断言均交给 toHaveValue/toBeVisible 的自动重试。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/base-converter')
  await page.waitForSelector('[data-test="dec-input"]')
}

test.describe('进制转换 e2e', () => {
  test('DEC 255 → BIN/OCT/HEX/自定义36 联动；码点行显示 ÿ (U+00FF)；HEX 接受 0xff 前缀', async ({ page }) => {
    await openTool(page)

    // 手写真值：255 = 0b11111111 = 0o377 = 0xff = 36 进制 73（7×36+3）
    await page.fill('[data-test="dec-input"]', '255')
    await expect(page.locator('[data-test="bin-input"]')).toHaveValue('11111111')
    await expect(page.locator('[data-test="oct-input"]')).toHaveValue('377')
    await expect(page.locator('[data-test="hex-input"]')).toHaveValue('ff')
    await expect(page.locator('[data-test="custom-input"]')).toHaveValue('73')

    // 码点联动行：255 = U+00FF = ÿ
    await expect(page.locator('[data-test="char-char"]')).toHaveText('ÿ')
    await expect(page.locator('[data-test="char-code"]')).toHaveText('U+00FF')

    // HEX 输入带匹配前缀的 0xff：解析合法，其余字段重排，hex 框保留输入文本
    await page.fill('[data-test="hex-input"]', '0xff')
    await expect(page.locator('[data-test="dec-input"]')).toHaveValue('255')
    await expect(page.locator('[data-test="bin-input"]')).toHaveValue('11111111')
    await expect(page.locator('[data-test="oct-input"]')).toHaveValue('377')
    await expect(page.locator('[data-test="custom-input"]')).toHaveValue('73')
    await expect(page.locator('[data-test="hex-input"]')).toHaveValue('0xff')
    await expect(page.locator('[data-test="hex-error"]')).toHaveCount(0)
  })

  test('前缀/大写开关即时联动（dec 与自定义无前缀）；非法字符只错该框其余保留旧值', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="dec-input"]', '255')
    await expect(page.locator('[data-test="bin-input"]')).toHaveValue('11111111')

    // 前缀记法：仅 bin/oct/hex 生效；dec 与自定义 36 进制无前缀概念
    await page.check('[data-test="toggle-prefix"]')
    await expect(page.locator('[data-test="bin-input"]')).toHaveValue('0b11111111')
    await expect(page.locator('[data-test="oct-input"]')).toHaveValue('0o377')
    await expect(page.locator('[data-test="hex-input"]')).toHaveValue('0xff')
    await expect(page.locator('[data-test="dec-input"]')).toHaveValue('255')
    await expect(page.locator('[data-test="custom-input"]')).toHaveValue('73')

    // 字母大写：HEX 数字大写、前缀记法保持小写
    await page.check('[data-test="toggle-uppercase"]')
    await expect(page.locator('[data-test="hex-input"]')).toHaveValue('0xFF')
    await expect(page.locator('[data-test="bin-input"]')).toHaveValue('0b11111111')
    await expect(page.locator('[data-test="oct-input"]')).toHaveValue('0o377')

    // 非法字符（二进制框输入 12 的 2）：仅该框错误态，其余字段保留旧值
    await page.fill('[data-test="bin-input"]', '12')
    await expect(page.locator('[data-test="bin-error"]')).toBeVisible()
    await expect(page.locator('[data-test="bin-input"]')).toHaveValue('12')
    await expect(page.locator('[data-test="dec-input"]')).toHaveValue('255')
    await expect(page.locator('[data-test="oct-input"]')).toHaveValue('0o377')
    await expect(page.locator('[data-test="hex-input"]')).toHaveValue('0xFF')
    await expect(page.locator('[data-test="custom-input"]')).toHaveValue('73')
  })
})
