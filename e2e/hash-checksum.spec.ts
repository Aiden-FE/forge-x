import { test, expect } from '@playwright/test'

// 票据：.scratch/hot-tools-v0.3.0/issues/11-extensions-spec.md E1（e2e 主路径）
// - 文本输入 + 密钥框填入 → HMAC-SHA256 已知真值
// - 密钥清空 → 回落普通 SHA-256，与已知真值比对且与 HMAC 值不同
// - HMAC 激活时 MD5 / CRC32 不可用（checkbox 置灰）
//
// 注意：任务描述中给出的 HMAC 值尾部与实际不符；此处真值以本机
// `node crypto.createHmac('sha256','key')` 与 Python hmac 双实现交叉验证为准。
const HMAC_SHA256_KNOWN = 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'
const SHA256_KNOWN = 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'

const FOX = 'The quick brown fox jumps over the lazy dog'

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/hash-checksum')
  await page.waitForSelector('[data-test="hash-text-input"]')
}

function resultRow(page: import('@playwright/test').Page, algorithmLabel: string) {
  return page.locator('.result', { hasText: algorithmLabel }).locator('[data-test="hash-result"]')
}

test.describe('哈希/校验和 e2e（HMAC 扩展）', () => {
  test('文本 + 密钥 → HMAC-SHA256 已知真值；MD5/CRC32 置灰', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="hash-text-input"]', FOX)
    await page.fill('[data-test="hash-hmac-key"]', 'key')
    await page.click('[data-test="hash-text-compute"]')

    const sha256 = resultRow(page, 'SHA-256')
    await expect(sha256).toHaveText(HMAC_SHA256_KNOWN)
    // SHA-1/384/512 同样以密钥参与（非空、十六进制），与普通哈希不同路径
    await expect(resultRow(page, 'SHA-1')).toHaveText(/^[0-9a-f]{40}$/)
    await expect(resultRow(page, 'SHA-384')).toHaveText(/^[0-9a-f]{96}$/)
    await expect(resultRow(page, 'SHA-512')).toHaveText(/^[0-9a-f]{128}$/)

    // HMAC 激活：MD5 / CRC32 checkbox 置灰且结果占位为 —
    await expect(page.locator('.algorithm', { hasText: 'MD5' }).locator('input')).toBeDisabled()
    await expect(page.locator('.algorithm', { hasText: 'CRC32' }).locator('input')).toBeDisabled()
    await expect(resultRow(page, 'MD5')).toHaveText('—')
    await expect(resultRow(page, 'CRC32')).toHaveText('—')
  })

  test('清空密钥 → 回落普通 SHA-256（已知真值，且与 HMAC 值不同）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="hash-text-input"]', FOX)
    await page.fill('[data-test="hash-hmac-key"]', 'key')
    await page.click('[data-test="hash-text-compute"]')
    await expect(resultRow(page, 'SHA-256')).toHaveText(HMAC_SHA256_KNOWN)

    await page.fill('[data-test="hash-hmac-key"]', '')
    await page.click('[data-test="hash-text-compute"]')

    const sha256 = resultRow(page, 'SHA-256')
    await expect(sha256).toHaveText(SHA256_KNOWN)
    expect(SHA256_KNOWN).not.toEqual(HMAC_SHA256_KNOWN)
    // MD5 / CRC32 恢复可用并出值
    await expect(page.locator('.algorithm', { hasText: 'MD5' }).locator('input')).toBeEnabled()
    await expect(resultRow(page, 'MD5')).toHaveText(/^[0-9a-f]{32}$/)
  })
})
