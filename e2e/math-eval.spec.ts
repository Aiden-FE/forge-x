import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 输入有 300ms 防抖，断言均交给 toBeVisible/toHaveText 的自动重试。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/math-eval')
  await page.waitForSelector('[data-test="math-input"]')
}

test.describe('数学表达式求值 e2e', () => {
  test('输入多行 → 实时出结果：定义回显、浮点如实、∞/NaN、行级错误只红该行', async ({ page }) => {
    await openTool(page)

    const input = ['x = 5', 'x * 2', '0.1+0.2', '1/0', '0/0', 'y + 1'].join('\n')
    await page.fill('[data-test="math-input"]', input)

    // 定义行回显绑定名，不显示结果值
    await expect(page.locator('[data-test="math-row-0"] [data-test="def-name"]')).toContainText('x')
    // 表达式行右对齐结果
    await expect(page.locator('[data-test="math-result-1"]')).toHaveText('10')
    // 浮点如实：完整位数
    await expect(page.locator('[data-test="math-result-2"]')).toHaveText('0.30000000000000004')
    // ∞ / NaN 特殊呈现（特殊值附带本地化名称小字，故用 containText）
    await expect(page.locator('[data-test="math-result-3"]')).toContainText('∞')
    await expect(page.locator('[data-test="math-result-4"]')).toContainText('NaN')
    // undefined 变量只红该行（最后一行），他行结果保留
    await expect(page.locator('[data-test="math-error-5"]')).toContainText('y')
    await expect(page.locator('[data-test="math-row-5"]')).toHaveClass(/invalid/)
    await expect(page.locator('[data-test="math-row-1"]')).not.toHaveClass(/invalid/)
    await expect(page.locator('[data-test="math-result-2"]')).toHaveText('0.30000000000000004')
  })

  test('改一行 → 只该行变化（重绑后行生效）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="math-input"]', ['x = 5', 'x * 2'].join('\n'))
    await expect(page.locator('[data-test="math-result-1"]')).toHaveText('10')

    // 重绑 x = 7：后行生效为 14
    await page.fill('[data-test="math-input"]', ['x = 5', 'x * 2', 'x = 7', 'x * 2'].join('\n'))
    await expect(page.locator('[data-test="math-result-1"]')).toHaveText('10')
    await expect(page.locator('[data-test="math-result-3"]')).toHaveText('14')

    // 引入错误行只影响该行
    await page.fill('[data-test="math-input"]', ['x = 5', 'x * 2', 'nope + 1'].join('\n'))
    await expect(page.locator('[data-test="math-row-2"]')).toHaveClass(/invalid/)
    await expect(page.locator('[data-test="math-result-1"]')).toHaveText('10')
  })

  test('历史记录回填完整多行块', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="math-input"]', ['x = 5', 'x * 2'].join('\n'))
    await expect(page.locator('[data-test="math-result-1"]')).toHaveText('10')

    const second = ['a = 0.1', 'a + 0.2'].join('\n')
    await page.fill('[data-test="math-input"]', second)
    await expect(page.locator('[data-test="math-result-1"]')).toHaveText('0.30000000000000004')

    // 历史最近 20 条：最新块在顶部；点击回填完整多行块
    await expect(page.locator('[data-test="history-item-0"]')).toBeVisible()
    await page.click('[data-test="history-item-0"]')
    await expect(page.locator('[data-test="math-input"]')).toHaveValue(second)

    // 回填的是上一个块：继续上滑到更早块
    await page.click('[data-test="history-item-1"]')
    await expect(page.locator('[data-test="math-input"]')).toHaveValue(['x = 5', 'x * 2'].join('\n'))
  })
})
