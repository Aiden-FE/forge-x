import { test, expect } from '@playwright/test'

// 票据：.scratch/hot-tools-v0.3.0/issues/11-extensions-spec.md E2（e2e 主路径）
// - 打开 /#/tool/jwt-verifier → 切到「生成」标签
// - 默认 header/payload（{"alg":"HS256","typ":"JWT"} / {"sub":"user-1"}）+ secret
// - 点生成 → 三段式 token；点「送入验签」→ 验签视图显示通过徽章

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/jwt-verifier')
  await page.waitForSelector('[data-test="jwt-tabs"]')
}

test.describe('JWT 生成 e2e（生成 → 验签闭环）', () => {
  test('默认 header/payload + secret → 生成三段式 token → 送入验签通过', async ({ page }) => {
    await openTool(page)

    // 切到「生成」标签
    await page.click('[data-test="jwt-tab-generate"]')
    const genPane = page.locator('[data-test="jwt-gen-header"]')
    await expect(genPane).toBeVisible()

    // 默认 header/payload 已预置
    await expect(page.locator('[data-test="jwt-gen-header"]')).toHaveValue(/"alg":\s*"HS256"/)
    await expect(page.locator('[data-test="jwt-gen-payload"]')).toHaveValue(/"sub":\s*"user-1"/)
    // secret 保密提示可见
    await expect(page.locator('[data-test="jwt-gen-secret-warning"]')).toBeVisible()

    // 生成按钮在无 secret 时禁用
    const run = page.locator('[data-test="jwt-gen-run"]')
    await expect(run).toBeDisabled()

    await page.fill('[data-test="jwt-gen-secret"]', 'e2e-secret')
    await expect(run).toBeEnabled()
    await run.click()

    // 三段式 token 出现（base64url × 3，无 padding）
    const tokenBox = page.locator('[data-test="jwt-gen-token"]')
    await expect(tokenBox).toBeVisible({ timeout: 10000 })
    const tokenText = ((await tokenBox.textContent()) ?? '').trim()
    expect(tokenText).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

    // header 段解码回默认 header（alg=HS256）
    const headerJson = await page.evaluate((t) =>
      JSON.parse(decodeURIComponent(escape(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))))),
      tokenText,
    )
    expect(headerJson).toMatchObject({ alg: 'HS256', typ: 'JWT' })

    // 「送入验签」→ 切回验签视图并自动解码 + 验签 → 通过徽章
    await page.click('[data-test="jwt-gen-send"]')
    await expect(page.locator('[data-test="jwt-tab-verify"]')).toHaveClass(/active/)
    await expect(page.locator('[data-test="jwt-token"]')).toHaveValue(tokenText)
    await expect(page.locator('[data-test="jwt-key"]')).toHaveValue('e2e-secret')
    const status = page.locator('[data-test="jwt-status"] .badge.success')
    await expect(status).toBeVisible({ timeout: 10000 })

    // 解码视图显示 header/payload
    await expect(page.locator('[data-test="jwt-header"]')).toContainText('HS256')
    await expect(page.locator('[data-test="jwt-payload"]')).toContainText('user-1')
  })

  test('payload 非法 JSON → 错误提示且不生成', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="jwt-tab-generate"]')
    await page.fill('[data-test="jwt-gen-secret"]', 'e2e-secret')
    await page.fill('[data-test="jwt-gen-payload"]', '{not-json}')

    await expect(page.locator('[data-test="jwt-gen-payload-error"]')).toBeVisible()
    await expect(page.locator('[data-test="jwt-gen-run"]')).toBeDisabled()
    await expect(page.locator('[data-test="jwt-gen-token"]')).toHaveCount(0)
  })
})
