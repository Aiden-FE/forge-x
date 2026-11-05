import { test, expect } from '@playwright/test'

// 票据 .scratch/hot-tools-v0.5.0/issues/08-rsa-keypair-spec.md（主路径 e2e）。
// 生成走浏览器原生 WebCrypto（真浏览器闭环）；只生成 EC P-256（快），
// RS256 徽标为纯控件投影（不触发生成），全程不生成任何 RSA 密钥（4096 数十秒）。
test.use({ locale: 'zh-CN' })

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/keypair-generator')
  await page.waitForSelector('[data-test="kp-generate"]')
}

test.describe('密钥对生成器 e2e', () => {
  test('档位 → JWT alg 徽标投影：默认 RSA 2048 = RS256；EC P-256 = ES256', async ({ page }) => {
    await openTool(page)

    // 默认 rsa + 2048：徽标 RS256（控制即投影，无需生成）
    await expect(page.locator('[data-test="kp-algo-rsa"]')).toBeChecked()
    await expect(page.locator('[data-test="kp-jwt-alg"]')).toHaveText('RS256')

    // 切到 EC：曲线组出现，默认 P-256 → ES256
    await page.check('[data-test="kp-algo-ec"]')
    await expect(page.locator('[data-test="kp-curve-p256"]')).toBeChecked()
    await expect(page.locator('[data-test="kp-jwt-alg"]')).toHaveText('ES256')
  })

  test('EC P-256 生成：双 PEM 唯二形态 + 耗时显示 + 控件切换不动已生成结果', async ({ page }) => {
    await openTool(page)

    await page.check('[data-test="kp-algo-ec"]')
    await page.click('[data-test="kp-generate"]')

    // 私钥 PKCS#8 / 公钥 SPKI——唯二文本形态（RFC 7468 头尾标签硬断言）
    await expect(page.locator('[data-test="kp-private"]')).toHaveValue(
      /^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+-----END PRIVATE KEY-----$/,
    )
    await expect(page.locator('[data-test="kp-public"]')).toHaveValue(
      /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----$/,
    )
    // 结果面板 alg 标签 = ES256
    await expect(page.locator('[data-test="kp-private-alg"]')).toHaveText('ES256')
    await expect(page.locator('[data-test="kp-public-alg"]')).toHaveText('ES256')

    // 耗时显示（performance.now 计时，非零值）
    await expect(page.locator('[data-test="kp-elapsed"]')).toBeVisible()
    await expect(page.locator('[data-test="kp-elapsed"]')).toContainText('耗时')

    // 生成类非实时：控件切回 RSA 只影响下一次生成，已展示的密钥保持不变
    const privatePem = await page.locator('[data-test="kp-private"]').inputValue()
    await page.check('[data-test="kp-algo-rsa"]')
    await expect(page.locator('[data-test="kp-jwt-alg"]')).toHaveText('RS256')
    await expect(page.locator('[data-test="kp-private"]')).toHaveValue(privatePem)
    await expect(page.locator('[data-test="kp-private-alg"]')).toHaveText('ES256')
  })
})
