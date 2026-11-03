import { generateKeyPairSync } from 'node:crypto'
import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 票据：.scratch/hot-tools-v0.4.0/issues/13-extensions-format-spec.md §1
//（JWT 非对称签名 e2e 主路径；HS256 主路径在 jwt-generate.spec.ts，保持不动）
// - 算法下拉选 RS256/ES256 → 粘贴 PKCS#8 PEM 私钥 → 生成三段式 token
//   （header alg 覆写为所选算法、base64url 无填充）
// - 一键「用公钥验签」→ 既有验签区通过徽章
// - PKCS#1 私钥 → PEM 框定位报错 + 转换提示，不生成
// - 私钥仅内存级警示可见

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/jwt-verifier')
  await page.waitForSelector('[data-test="jwt-tabs"]')
  await page.click('[data-test="jwt-tab-generate"]')
  await page.waitForSelector('[data-test="jwt-gen-alg"]')
}

function pemEncode(der: Buffer, label: string): string {
  const lines = der.toString('base64').match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

function rsaPkcs8Pem(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return pemEncode(privateKey.export({ type: 'pkcs8', format: 'der' }), 'PRIVATE KEY')
}

function rsaPkcs1Pem(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
}

function ecPkcs8Pem(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return pemEncode(privateKey.export({ type: 'pkcs8', format: 'der' }), 'PRIVATE KEY')
}

async function generateAsymmetric(page: import('@playwright/test').Page, algorithm: 'RS256' | 'ES256') {
  await page.selectOption('[data-test="jwt-gen-alg"]', algorithm)
  await page.fill(
    '[data-test="jwt-gen-pem"]',
    algorithm === 'RS256' ? rsaPkcs8Pem() : ecPkcs8Pem(),
  )
  // 仅内存级警示可见（v0.3.0 secret 警示同族文案）
  await expect(page.locator('[data-test="jwt-gen-pem-warning"]')).toBeVisible()

  await page.click('[data-test="jwt-gen-run"]')
  const tokenBox = page.locator('[data-test="jwt-gen-token"]')
  await expect(tokenBox).toBeVisible({ timeout: 10000 })
  return ((await tokenBox.textContent()) ?? '').trim()
}

test.describe('JWT 非对称签发 e2e（生成 → 用公钥验签闭环）', () => {
  for (const algorithm of ['RS256', 'ES256'] as const) {
    test(`${algorithm}：PKCS#8 PEM 签发 → 用公钥验签 → 既有验签区通过`, async ({ page }) => {
      await openTool(page)

      // HS256 专属控件随算法切换隐藏/显示
      await expect(page.locator('[data-test="jwt-gen-secret"]')).toBeVisible()
      await page.selectOption('[data-test="jwt-gen-alg"]', algorithm)
      await expect(page.locator('[data-test="jwt-gen-secret"]')).toBeHidden()

      const token = await generateAsymmetric(page, algorithm)

      // 三段式、base64url 无填充
      const segments = token.split('.')
      expect(segments).toHaveLength(3)
      for (const segment of segments) {
        expect(segment).not.toMatch(/[=+/]/)
      }

      // header alg 覆写为所选算法（默认 header 文本仍是 HS256）
      const headerJson = await page.evaluate((t) =>
        JSON.parse(decodeURIComponent(escape(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))))),
        token,
      )
      expect(headerJson).toMatchObject({ alg: algorithm, typ: 'JWT' })

      // 一键「用公钥验签」→ 切回验签视图 → 自动验签通过徽章
      await page.click('[data-test="jwt-gen-verify-public"]')
      await expect(page.locator('[data-test="jwt-tab-verify"]')).toHaveClass(/active/)
      await expect(page.locator('[data-test="jwt-token"]')).toHaveValue(token)
      const keyInput = await page.locator('[data-test="jwt-key"]').inputValue()
      expect(JSON.parse(keyInput)).toMatchObject({ kty: algorithm === 'RS256' ? 'RSA' : 'EC' })
      const status = page.locator('[data-test="jwt-status"] .badge.success')
      await expect(status).toBeVisible({ timeout: 10000 })

      // 解码视图 header 显示所选算法
      await expect(page.locator('[data-test="jwt-header"]')).toContainText(algorithm)
    })
  }

  test('篡改 payload 后验签失败（RS256）', async ({ page }) => {
    await openTool(page)
    const token = await generateAsymmetric(page, 'RS256')

    const [headerSegment, , signatureSegment] = token.split('.')
    const tampered = `${headerSegment}.${Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url')}.${signatureSegment}`

    await page.click('[data-test="jwt-gen-verify-public"]')
    await expect(page.locator('[data-test="jwt-status"] .badge.success')).toBeVisible({ timeout: 10000 })

    // 换成篡改 token 重新验签 → 失败徽章
    await page.fill('[data-test="jwt-token"]', tampered)
    await page.click('[data-test="jwt-decode"]')
    await page.click('[data-test="jwt-verify"]')
    await expect(page.locator('[data-test="jwt-status"] .badge.error')).toBeVisible({ timeout: 10000 })
  })

  test('PKCS#1 私钥定位报错并提示转换，且不生成 token', async ({ page }) => {
    await openTool(page)
    await page.selectOption('[data-test="jwt-gen-alg"]', 'RS256')
    await page.fill('[data-test="jwt-gen-pem"]', rsaPkcs1Pem())

    const error = page.locator('[data-test="jwt-gen-pem-error"]')
    await expect(error).toBeVisible()
    await expect(error).toContainText('PKCS#1')
    await expect(error).toContainText('openssl pkcs8') // 转换提示
    await expect(page.locator('[data-test="jwt-gen-run"]')).toBeDisabled()
    await expect(page.locator('[data-test="jwt-gen-token"]')).toHaveCount(0)
  })
})
