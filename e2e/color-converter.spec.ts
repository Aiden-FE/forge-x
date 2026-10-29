import { test, expect } from '@playwright/test'

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/color-converter')
  await page.waitForSelector('[data-test="hex-input"]')
}

test.describe('颜色转换器 e2e', () => {
  test('HEX 输入三向同步（红色 #ff0000 → RGB/HSL）；非法 HEX 只错该框，其余保留旧值', async ({ page }) => {
    await openTool(page)

    // 初值恰好也是红色，先输入蓝色证明三框确实在联动
    await page.fill('[data-test="hex-input"]', '#0000ff')
    await expect(page.locator('[data-test="rgb-input"]')).toHaveValue('rgb(0, 0, 255)')
    await expect(page.locator('[data-test="hsl-input"]')).toHaveValue('hsl(240, 100%, 50%)')

    // 票据样例：HEX 输入 #ff0000 → RGB/HSL 显示红色对应值（手写真值）
    await page.fill('[data-test="hex-input"]', '#ff0000')
    await expect(page.locator('[data-test="rgb-input"]')).toHaveValue('rgb(255, 0, 0)')
    await expect(page.locator('[data-test="hsl-input"]')).toHaveValue('hsl(0, 100%, 50%)')

    // 非法 HEX：仅该框错误态；RGB/HSL 框保留上一个合法值，不回写非法内容
    await page.fill('[data-test="hex-input"]', '#gg')
    await expect(page.locator('[data-test="hex-error"]')).toBeVisible()
    await expect(page.locator('[data-test="hex-input"]')).toHaveValue('#gg')
    await expect(page.locator('[data-test="rgb-input"]')).toHaveValue('rgb(255, 0, 0)')
    await expect(page.locator('[data-test="hsl-input"]')).toHaveValue('hsl(0, 100%, 50%)')
    await expect(page.locator('[data-test="rgb-error"]')).toHaveCount(0)
    await expect(page.locator('[data-test="hsl-error"]')).toHaveCount(0)
  })

  test('对比度区：黑/白=21.00 四档全过；红/白=4.00 仅 AA 大文本过；互换不改比值', async ({ page }) => {
    await openTool(page)
    const ratio = page.locator('[data-test="contrast-ratio"]')
    const badge = (t: string) => page.locator(`[data-test="${t}"]`)
    const ALL_LEVELS = ['level-aa-normal', 'level-aa-large', 'level-aaa-normal', 'level-aaa-large']

    // 默认前景 #000000 / 背景 #ffffff（手写真值：比值 21）→ 四档徽章全部通过
    await expect(ratio).toHaveText('21.00:1')
    for (const t of ALL_LEVELS) await expect(badge(t)).toHaveClass(/\bpass\b/)

    // 红 (#ff0000) 对白：L_red = 0.2126 → 1.05/0.2626 = 4.00（手写真值）
    // 4.00 ≥ 3 仅 AA 大文本过；AA/AAA 普通（≥4.5）与 AAA 大文本（≥4.5）不过
    await page.fill('[data-test="contrast-fg"]', '#ff0000')
    await expect(ratio).toHaveText('4.00:1')
    await expect(badge('level-aa-normal')).toHaveClass(/\bfail\b/)
    await expect(badge('level-aa-large')).toHaveClass(/\bpass\b/)
    await expect(badge('level-aaa-normal')).toHaveClass(/\bfail\b/)
    await expect(badge('level-aaa-large')).toHaveClass(/\bfail\b/)

    // 前景/背景一键互换：比值不变，两输入框文本互换
    await page.click('[data-test="contrast-swap"]')
    await expect(ratio).toHaveText('4.00:1')
    await expect(page.locator('[data-test="contrast-fg"]')).toHaveValue('#ffffff')
    await expect(page.locator('[data-test="contrast-bg"]')).toHaveValue('#ff0000')
  })
})
