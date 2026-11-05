import { test, expect } from '@playwright/test'

// 票据 .scratch/hot-tools-v0.5.0/issues/07-bip39-spec.md（主路径 e2e）。
// 官方向量：entropy 0x00…00（128 位）→ abandon ×11 + about（BIP39 官方测试向量）。
// 注意 12 × abandon 是确定性校验和失败：全零熵的校验和半字节为 3（about），
// abandon 的索引 0 对不上——不依赖概率构造负路径。
test.use({ locale: 'zh-CN' })

// 校验区有 300ms 防抖；生成/派生为按钮触发（生成类非实时）。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/bip39-generator')
  await page.waitForSelector('[data-test="bip39-generate"]')
}

const VECTOR_ALL_ZERO = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

test.describe('BIP39 助记词 e2e', () => {
  test('12 词档生成：默认遮蔽、12 个词、熵 32 hex', async ({ page }) => {
    await openTool(page)

    // 12 词档（默认档位）生成：敏感呈现，默认遮蔽
    await page.click('[data-test="bip39-strength-12"]')
    await page.click('[data-test="bip39-generate"]')
    await expect(page.locator('[data-test="bip39-mnemonic"]')).toBeVisible()
    await expect(page.locator('[data-test="bip39-mnemonic"] .masked')).toBeVisible()

    // 点击显示 → 12 个词
    await page.click('[data-test="bip39-reveal"]')
    const words = page.locator('[data-test="bip39-mnemonic"] .word')
    await expect(words).toHaveCount(12)

    // 熵（hex，只读折叠展示）：16 字节 → 32 个 hex 字符
    await page.click('[data-test="bip39-entropy-toggle"]')
    await expect(page.locator('[data-test="bip39-entropy"]')).toHaveText(/^[0-9a-f]{32}$/)
  })

  test('校验区官方向量通过：熵回读 + seed 派生 128 hex', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="bip39-verify-input"]', VECTOR_ALL_ZERO)
    await expect(page.locator('[data-test="bip39-verify-result"]')).toBeVisible()
    await expect(page.locator('[data-test="bip39-verify-result"] .badge.ok')).toHaveText('✓ 有效助记词')
    await expect(page.locator('[data-test="bip39-verify-result"] .meta')).toContainText('12 词 → 128 位熵')
    // 熵 hex 回读：官方向量全零熵
    await expect(page.locator('[data-test="bip39-verify-entropy"]')).toHaveText(
      '00000000000000000000000000000000',
    )

    // seed 派生（按钮触发，2048 轮 PBKDF2）：64 字节 → 128 hex 字符
    await page.click('[data-test="bip39-derive"]')
    await expect(page.locator('[data-test="bip39-seed"]')).toHaveText(/^[0-9a-f]{128}$/)
  })

  test('改末词（about → abandon）：校验和失败整体报错，不定位词位', async ({ page }) => {
    await openTool(page)

    // 12 × abandon：词数合法、全词在表内，唯一失败原因是校验和
    await page.fill('[data-test="bip39-verify-input"]', 'abandon '.repeat(11) + 'abandon')
    await expect(page.locator('[data-test="bip39-verify-result"] .badge.bad')).toHaveText('✗ 无效助记词')
    const errors = page.locator('[data-test="bip39-verify-error"]')
    await expect(errors).toHaveCount(1)
    // 信息论边界内如实呈现：整体报错文案，不带词位
    await expect(errors.first()).toContainText('校验和失败')
    // 校验未通过 → 不给出熵
    await expect(page.locator('[data-test="bip39-verify-entropy"]')).toHaveCount(0)
  })

  test('词表外词：定位词位（第 3 词）', async ({ page }) => {
    await openTool(page)

    const phrase =
      'abandon abandon notaword ' + 'abandon '.repeat(8) + 'abandon'
    await page.fill('[data-test="bip39-verify-input"]', phrase)
    await expect(page.locator('[data-test="bip39-verify-result"] .badge.bad')).toBeVisible()
    await expect(page.locator('[data-test="bip39-verify-error"]')).toContainText('第 3 词')
    await expect(page.locator('[data-test="bip39-verify-error"]')).toContainText('notaword')
  })
})
