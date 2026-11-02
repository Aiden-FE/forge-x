import { test, expect } from '@playwright/test'

// 手写独立真值（不依赖实现重算）：
// - v4/v7：8-4-4-4-12 小写 hex，第三组首字符为版本位（4/7），第四组首字符为
//   RFC 4122 variant 位（10xx → 8/9/a/b）。
// - ULID：26 字符 Crockford base32（排除 I/L/O/U），默认小写展示。
const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const V4_UPPER_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ULID_LOWER_RE = /^[0-9abcdefghjkmnpqrstvwxyz]{26}$/
const ULID_UPPER_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/uuid-generator')
  await page.waitForSelector('[data-test="uuid-rows"]')
}

test.describe('UUID/ULID 生成器 e2e', () => {
  test('进入即生成 1 行 v4；批量预设 10 → 生成 10 行且互不相同', async ({ page }) => {
    await openTool(page)
    const rows = page.locator('[data-test="uuid-row-text"]')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toHaveText(V4_RE)

    // 数量预设 10（锚定正则精确匹配，避免命中 100/1000）
    await page.locator('[data-test="uuid-preset"]', { hasText: /^10$/ }).click()
    await expect(page.locator('[data-test="uuid-count"]')).toHaveValue('10')
    await page.click('[data-test="uuid-generate"]')

    await expect(rows).toHaveCount(10)
    const texts = await rows.allTextContents()
    for (const t of texts) expect(t).toMatch(V4_RE)
    expect(new Set(texts).size).toBe(10)

    // 复制全部 → 「已复制」UI 态（不读剪贴板内容）。
    // clipboard-write 权限 WebKit 不支持（Unknown permission），仅 chromium 验证此 UI 态。
    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.click('[data-test="uuid-copy-all"]')
    await expect(page.locator('[data-test="uuid-copy-all"]')).toHaveText(/已复制|Copied/)
  })

  test('切换 v7 → ULID → 大写：输出形态各自匹配，ULID 隐藏不适用开关', async ({ page }) => {
    await openTool(page)

    // v4 → v7：版本位 7
    await page.locator('[data-test="uuid-version"] input[value="v7"]').check()
    await page.click('[data-test="uuid-generate"]')
    await expect(page.locator('[data-test="uuid-row-text"]').first()).toHaveText(V7_RE)

    // v7 → ULID：默认小写 26 字符 Crockford；花括号/去连字符开关隐藏
    await page.locator('[data-test="uuid-version"] input[value="ulid"]').check()
    await expect(page.locator('[data-test="uuid-format-braces"]')).toHaveCount(0)
    await expect(page.locator('[data-test="uuid-format-hyphenless"]')).toHaveCount(0)
    await page.click('[data-test="uuid-generate"]')
    await expect(page.locator('[data-test="uuid-row-text"]').first()).toHaveText(ULID_LOWER_RE)

    // 大写开关 + 重新生成 → ULID 大写（ULID 下仅大写开关生效）
    await page.locator('[data-test="uuid-format-uppercase"] input').check()
    await page.click('[data-test="uuid-generate"]')
    await expect(page.locator('[data-test="uuid-row-text"]').first()).toHaveText(ULID_UPPER_RE)

    // ULID → v4：大写开关同样作用于 UUID 形态
    await page.locator('[data-test="uuid-version"] input[value="v4"]').check()
    await page.click('[data-test="uuid-generate"]')
    await expect(page.locator('[data-test="uuid-row-text"]').first()).toHaveText(V4_UPPER_RE)
  })
})
