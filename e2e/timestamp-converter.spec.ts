import { test, expect } from '@playwright/test'

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/timestamp-converter')
  await page.waitForSelector('[data-test="ts-input"]')
}

test.describe('Timestamp converter e2e smoke', () => {
  test('seconds timestamp → formatted datetime', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="ts-input"]', '1700000000')
    await page.click('[data-test="ts-to-date"]')
    await expect(page.locator('[data-test="ts-result"]')).toContainText('2023-')
  })

  test('ISO datetime → timestamp seconds + ms', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="ts-datetime"]', '2024-01-01T00:00:00Z')
    await page.click('[data-test="ts-from-date"]')
    await expect(page.locator('[data-test="ts-result"]')).toContainText('1704067200')
    await expect(page.locator('[data-test="ts-result"]')).toContainText('1704067200000')
  })
})