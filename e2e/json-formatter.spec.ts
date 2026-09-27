import { test, expect } from '@playwright/test'

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/json-formatter')
  await page.waitForSelector('[data-test="json-input"]')
}

test.describe('JsonFormatter e2e smoke', () => {
  test('format valid JSON into pretty output', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="json-input"]', '{"a":1,"b":[2,3]}')
    await page.click('[data-test="json-format"]')
    await expect(page.locator('[data-test="json-output"]')).toHaveValue(/"a":\s*1/)
    await expect(page.locator('[data-test="json-output"]')).toHaveValue(/"b":\s*\[/)
  })

  test('invalid JSON shows error and clears output', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="json-input"]', '{not json}')
    await page.click('[data-test="json-format"]')
    await expect(page.locator('[data-test="json-error"]')).toBeVisible()
  })
})