import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


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

// ---------------------------------------------------------------------------
// 位视图（票据 14 扩展 #3）
//
// 位视图跟随主输入整数值实时联动：固定位宽（8/16/32）位格、补码有符号/
// 无符号双解读、大端/小端字节序。补零是位宽选择的自然结果（无独立开关）。
// 范围错误只错位视图区块，位格保留上一次合法值。
// ---------------------------------------------------------------------------
test.describe('位视图 e2e', () => {
  test('255 在 8 位：位格全 1，双解读 (-1 / 255)；宽度切 16 高位补零（验收）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="dec-input"]', '255')
    await expect(page.locator('[data-test="bit-cell"]')).toHaveCount(8)
    const cells = page.locator('[data-test="bit-cell"]')
    for (let i = 0; i < 8; i++) await expect(cells.nth(i)).toHaveText('1')
    await expect(page.locator('[data-test="bit-signed"]')).toContainText('-1')
    await expect(page.locator('[data-test="bit-unsigned"]')).toContainText('255')

    // 位宽切换 → 补零联动（自然结果，无独立开关）
    await page.click('[data-test="bit-width-16"]')
    await expect(page.locator('[data-test="bit-cell"]')).toHaveCount(16)
    for (let i = 0; i < 8; i++) await expect(cells.nth(i)).toHaveText('0')
    for (let i = 8; i < 16; i++) await expect(cells.nth(i)).toHaveText('1')
    // 16 位下有符号解读变为 255
    await expect(page.locator('[data-test="bit-signed"]')).toContainText('255')

    await page.click('[data-test="bit-width-32"]')
    await expect(page.locator('[data-test="bit-cell"]')).toHaveCount(32)
  })

  test('-1 在 8 位：补码位格全 1，双解读 (-1 / 255)（验收）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="dec-input"]', '-1')
    const cells = page.locator('[data-test="bit-cell"]')
    await expect(cells).toHaveCount(8)
    for (let i = 0; i < 8; i++) await expect(cells.nth(i)).toHaveText('1')
    await expect(page.locator('[data-test="bit-signed"]')).toContainText('-1')
    await expect(page.locator('[data-test="bit-unsigned"]')).toContainText('255')
  })

  test('字节序：0x12345678 在 32 位 → 大端 12 34 56 78 / 小端 78 56 34 12（验收）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="hex-input"]', '12345678')
    await page.click('[data-test="bit-width-32"]')
    await expect(page.locator('[data-test="bit-be-value"]')).toHaveText('12 34 56 78')
    await expect(page.locator('[data-test="bit-le-value"]')).toHaveText('78 56 34 12')
  })

  test('范围错误只错位视图：8 位下输入 300 → 错误定位，位格保留上一次合法值（验收）', async ({ page }) => {
    await openTool(page)

    // 先建立合法值 255（8 位全 1）
    await page.fill('[data-test="dec-input"]', '255')
    const cells = page.locator('[data-test="bit-cell"]')
    await expect(cells).toHaveCount(8)
    await expect(cells.nth(0)).toHaveText('1')

    // 超范围：错误定位到位视图区块
    await page.fill('[data-test="dec-input"]', '300')
    await expect(page.locator('[data-test="bit-range-error"]')).toBeVisible()
    // 位格保留上一次合法值（仍是 255 的全 1 位格），无空态
    await expect(cells).toHaveCount(8)
    for (let i = 0; i < 8; i++) await expect(cells.nth(i)).toHaveText('1')

    // 回到合法值：错误消失，位格按新值重排
    await page.fill('[data-test="dec-input"]', '5')
    await expect(page.locator('[data-test="bit-range-error"]')).toHaveCount(0)
    await expect(cells).toHaveCount(8)
    await expect(cells.nth(7)).toHaveText('1')
    await expect(cells.nth(6)).toHaveText('0')
  })

  test('空输入：位视图显示空态提示，无错误', async ({ page }) => {
    await openTool(page)
    await expect(page.locator('[data-test="bit-empty"]')).toBeVisible()
    await expect(page.locator('[data-test="bit-range-error"]')).toHaveCount(0)
    await expect(page.locator('[data-test="bit-cell"]')).toHaveCount(0)

    await page.fill('[data-test="dec-input"]', '7')
    await expect(page.locator('[data-test="bit-empty"]')).toHaveCount(0)
    await expect(page.locator('[data-test="bit-cell"]')).toHaveCount(8)
  })
})
