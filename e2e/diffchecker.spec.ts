import { test, expect } from '@playwright/test'

// 打开工具页：左右两个输入面板 + 「对比」按钮
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/diffchecker')
  await page.waitForSelector('[data-test="left-input"]')
}

async function fillInputs(
  page: import('@playwright/test').Page,
  left: string,
  right: string,
) {
  await page.fill('[data-test="left-input"]', left)
  await page.fill('[data-test="right-input"]', right)
  await page.click('[data-test="compare-btn"]')
}

test.describe('Diffchecker e2e', () => {
  test('打开工具页：左右输入面板与对比按钮可见', async ({ page }) => {
    await openTool(page)
    await expect(page.locator('[data-test="left-input"]')).toBeVisible()
    await expect(page.locator('[data-test="right-input"]')).toBeVisible()
    await expect(page.locator('[data-test="compare-btn"]')).toBeVisible()
  })

  test('对比：修改行行内高亮、独立新增/删除、行号', async ({ page }) => {
    await openTool(page)
    await fillInputs(page, 'a\nold line\nc', 'a\nnew line\nc')

    const rows = page.locator('[data-test="diff-rows"]')
    await expect(rows).toBeVisible()

    // 修改行：左右两侧均渲染，带行内片段
    const mod = rows.locator('.diff-row[data-kind="modified"]')
    await expect(mod).toHaveCount(1)
    await expect(mod.locator('.seg-changed')).toHaveCount(2)
    // 行号
    await expect(mod.locator('[data-test="left-line"]')).toHaveText('2')
    await expect(mod.locator('[data-test="right-line"]')).toHaveText('2')

    // 相等行
    await expect(rows.locator('.diff-row[data-kind="equal"]').first()).toBeVisible()

    // 独立新增/删除行（无配对）
    await fillInputs(page, 'a\nb', 'a\nb\nnew1')
    const added = rows.locator('.diff-row[data-kind="added"]')
    await expect(added).toHaveCount(1)
    await expect(added).toHaveText(/new1/)

    await fillInputs(page, 'a\nold1\nb', 'a\nb')
    const deleted = rows.locator('.diff-row[data-kind="deleted"]')
    await expect(deleted).toHaveCount(1)
    await expect(deleted).toHaveText(/old1/)
  })

  test('相同 → 成功提示；双空 → 占位提示；单侧空 → 全删/全增', async ({ page }) => {
    await openTool(page)
    await fillInputs(page, 'same\nline', 'same\nline')
    await expect(page.locator('[data-test="result-same"]')).toBeVisible()

    await page.fill('[data-test="left-input"]', '')
    await page.fill('[data-test="right-input"]', '')
    await page.click('[data-test="compare-btn"]')
    await expect(page.locator('[data-test="result-empty"]')).toBeVisible()

    await page.fill('[data-test="left-input"]', '')
    await page.fill('[data-test="right-input"]', 'a\nb')
    await page.click('[data-test="compare-btn"]')
    // 全部新增
    await expect(page.locator('.diff-row[data-kind="added"]')).toHaveCount(2)
  })

  test('忽略空白：开启后行首/行尾空白差异判为相同，关闭时判为差异', async ({ page }) => {
    await openTool(page)
    await fillInputs(page, 'a ', 'a')
    // 默认关闭 → 差异
    await expect(page.locator('.diff-row')).toHaveCount(1)

    // 开启忽略空白 → 相同
    await page.check('[data-test="ignore-ws"]')
    await page.click('[data-test="compare-btn"]')
    await expect(page.locator('[data-test="result-same"]')).toBeVisible()
  })

  test('视图切换：统一视图显示 +/- 前缀', async ({ page }) => {
    await openTool(page)
    await fillInputs(page, 'a\nold line\nc', 'a\nnew line\nc')
    await page.click('[data-test="view-btn"]')

    const unified = page.locator('[data-test="diff-rows"]')
    await expect(unified.locator('.prefix', { hasText: '+' }).first()).toBeVisible()
    await expect(unified.locator('.prefix', { hasText: '-' }).first()).toBeVisible()
  })

  test('交换：输入互换并自动重新对比', async ({ page }) => {
    await openTool(page)
    await fillInputs(page, 'a\nX\nc', 'a\nY\nc')
    const before = await page.locator('[data-test="left-input"]').inputValue()

    await page.click('[data-test="swap-btn"]')
    // 输入互换
    await expect(page.locator('[data-test="left-input"]')).toHaveValue('a\nY\nc')
    await expect(page.locator('[data-test="right-input"]')).toHaveValue(before)
    // 自动重新对比 → 结果仍在渲染
    await expect(page.locator('[data-test="diff-rows"]')).toBeVisible()
  })

  test('清空：同时清空两侧输入与结果', async ({ page }) => {
    await openTool(page)
    await fillInputs(page, 'a', 'b')
    await expect(page.locator('[data-test="diff-rows"]')).toBeVisible()

    await page.click('[data-test="clear-btn"]')
    await expect(page.locator('[data-test="left-input"]')).toHaveValue('')
    await expect(page.locator('[data-test="right-input"]')).toHaveValue('')
    await expect(page.locator('[data-test="result-empty"]')).toBeVisible()
  })
})
