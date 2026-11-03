import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


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

// ---------------------------------------------------------------------------
// 13 票扩展：完整色板（六规则固定产出；替换原互补色单 swatch 区）
// ---------------------------------------------------------------------------

test.describe('色板 e2e（13 票扩展）', () => {
  test('六规则各产出固定数量：互补(2)/近似(3)/三角(3)/分裂互补(3)/四方(4)/单色(5)；旧互补单 swatch 区已移除', async ({ page }) => {
    await openTool(page)

    await expect(page.locator('[data-test="palette-title"]')).toBeVisible()
    await expect(page.locator('[data-test="complement-apply"]')).toHaveCount(0)

    const counts: Array<[string, number]> = [
      ['complementary', 2],
      ['analogous', 3],
      ['triadic', 3],
      ['split-complementary', 3],
      ['tetradic', 4],
      ['monochrome', 5],
    ]
    for (const [rule, count] of counts) {
      await expect(page.locator(`[data-test="palette-rule-${rule}"]`)).toBeVisible()
      await expect(page.locator(`[data-test="palette-rule-${rule}"] [data-test^="palette-swatch-${rule}-"]`)).toHaveCount(count)
    }
  })

  test('互补规则产出 2 色：基色红 → [#FF0000, #00FFFF]；悬停展示 HEX/RGB/HSL', async ({ page }) => {
    await openTool(page)

    const swatch0 = page.locator('[data-test="palette-swatch-complementary-0"]')
    const swatch1 = page.locator('[data-test="palette-swatch-complementary-1"]')
    await expect(swatch0).toHaveAttribute('title', '#FF0000 · rgb(255, 0, 0) · hsl(0, 100%, 50%)')
    await expect(swatch1).toHaveAttribute('title', '#00FFFF · rgb(0, 255, 255) · hsl(180, 100%, 50%)')
  })

  test('点击复制大写 HEX；色板色回填转换器显示一致（往返）', async ({ page }) => {
  // clipboard-write 仅 chromium 可授权（webkit 不支持该权限，仓库既有惯例）
  test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await openTool(page)

    // 互补 swatch 点击复制 #00FFFF（大写口径）
    await page.click('[data-test="palette-swatch-complementary-1"]')
    await expect(page.locator('[data-test="palette-copied"]')).toContainText('#00FFFF')
    const hex = await page.evaluate(() => navigator.clipboard.readText())
    expect(hex).toBe('#00FFFF')

    // 往返：色板色喂给转换器 → HEX/RGB/HSL 与悬停信息一致
    await page.fill('[data-test="hex-input"]', hex)
    await expect(page.locator('[data-test="rgb-input"]')).toHaveValue('rgb(0, 255, 255)')
    await expect(page.locator('[data-test="hsl-input"]')).toHaveValue('hsl(180, 100%, 50%)')
  })

  test('四方规则角度数学（基色红 0° → [0, +90, +180, +270]）', async ({ page }) => {
    await openTool(page)

    // 基色红经 RGB 量化后 +90/-90 档为 89.9°/270.1°（color.ts 口径）
    const expectedTitles = [
      '#FF0000 · rgb(255, 0, 0) · hsl(0, 100%, 50%)',
      '#80FF00 · rgb(128, 255, 0) · hsl(89.9, 100%, 50%)',
      '#00FFFF · rgb(0, 255, 255) · hsl(180, 100%, 50%)',
      '#8000FF · rgb(128, 0, 255) · hsl(270.1, 100%, 50%)',
    ]
    for (let index = 0; index < expectedTitles.length; index++) {
      await expect(page.locator(`[data-test="palette-swatch-tetradic-${index}"]`)).toHaveAttribute(
        'title',
        expectedTitles[index]!,
      )
    }
  })

  test('单色明暗 5 档：亮度序列可见且中档为基色红', async ({ page }) => {
    await openTool(page)

    // 红 hsl(0,100%,50%) → l ∈ [20, 35, 50, 65, 80]（color.ts 精确换算真值）
    const expectedTitles = [
      '#660000 · rgb(102, 0, 0) · hsl(0, 100%, 20%)',
      '#B30000 · rgb(179, 0, 0) · hsl(0, 100%, 35.1%)',
      '#FF0000 · rgb(255, 0, 0) · hsl(0, 100%, 50%)',
      '#FF4D4D · rgb(255, 77, 77) · hsl(0, 100%, 65.1%)',
      '#FF9999 · rgb(255, 153, 153) · hsl(0, 100%, 80%)',
    ]
    for (let index = 0; index < expectedTitles.length; index++) {
      await expect(page.locator(`[data-test="palette-swatch-monochrome-${index}"]`)).toHaveAttribute(
        'title',
        expectedTitles[index]!,
      )
    }
  })
})
