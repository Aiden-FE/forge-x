import { test, expect } from '@playwright/test'

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/base64-codec')
  await page.waitForSelector('[data-test="b64-input"]')
}

test.describe('Base64 codec e2e smoke', () => {
  test('encodes plain text and round-trips', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="b64-input"]', 'hello forgex')
    await page.click('[data-test="b64-encode"]')
    await expect(page.locator('[data-test="b64-output"]')).toHaveValue('aGVsbG8gZm9yZ2V4')

    await page.fill('[data-test="b64-input"]', 'aGVsbG8gZm9yZ2V4')
    await page.click('[data-test="b64-decode"]')
    await expect(page.locator('[data-test="b64-output"]')).toHaveValue('hello forgex')
  })

  test('invalid base64 surfaces error', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="b64-input"]', '%%%')
    await page.click('[data-test="b64-decode"]')
    await expect(page.locator('[data-test="b64-error"]')).toBeVisible()
  })
})