import { test, expect } from '@playwright/test'

// 票据 .scratch/hot-tools-v0.5.0/issues/03-llm-repairer-spec.md（主路径 e2e）。
// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）。
test.use({ locale: 'zh-CN' })

// 输入有 300ms 防抖，断言均交给 toHaveValue/toContainText 的自动重试。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/json-repairer')
  await page.waitForSelector('[data-test="repair-input"]')
}

test.describe('JSON 修复器 e2e', () => {
  test('截断 JSON 实时修复：补全闭括号 + 成功状态条', async ({ page }) => {
    await openTool(page)

    // 截断 JSON（missingBrackets 类）：jsonrepair 补全为规范化的 {"a":1}
    //（修复即规范化：库产出紧凑分隔符，非任务描述里的 "a": 1 带空格形态）。
    await page.fill('[data-test="repair-input"]', '{"a":1')
    await expect(page.locator('[data-test="repair-output"]')).toHaveValue('{"a":1}')
    // 状态条出现：成功 + 输入/输出字节数（7 B → 8 B）
    await expect(page.locator('[data-test="repair-status"]')).toBeVisible()
    await expect(page.locator('[data-test="repair-status"]')).toContainText('修复成功')
    await expect(page.locator('[data-test="repair-status"]')).toContainText('输入 6 B')
    await expect(page.locator('[data-test="repair-status"]')).toContainText('输出 7 B')
    // 无错误
    await expect(page.locator('[data-test="repair-error"]')).toHaveCount(0)
  })

  test('不可修复报错；输出保留旧值；失败状态条', async ({ page }) => {
    await openTool(page)

    // 先有一次成功修复，确立「旧值」
    await page.fill('[data-test="repair-input"]', '{"a":1')
    await expect(page.locator('[data-test="repair-output"]')).toHaveValue('{"a":1}')

    // 1 2 3：库无法修复（Unexpected character，platform 约定「只错该处」）
    await page.fill('[data-test="repair-input"]', '1 2 3')
    await expect(page.locator('[data-test="repair-error"]')).toBeVisible()
    await expect(page.locator('[data-test="repair-error"]')).toContainText('无法修复')
    // 输出保留上一次成功值，不被失败清掉
    await expect(page.locator('[data-test="repair-output"]')).toHaveValue('{"a":1}')
    // 状态条翻转为失败
    await expect(page.locator('[data-test="repair-status"]')).toContainText('修复失败')
  })
})
