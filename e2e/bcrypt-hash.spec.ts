import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 票据：.scratch/hot-tools-v0.4.0/issues/03-bcrypt-spec.md 验收 8（及 UI 可断言项）
// - 生成 → 复制 → 粘贴到校验 → 匹配；改一字 → 不匹配
// - 格式非法三态 / 解析区四段 / cost 联动与秒级提示 / 72 字节截断警示
// 注意：Worker 隔离（cost 15 期间主线程不冻结）为手动验收项，不在 e2e 断言范围。

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/bcrypt-hash')
  await page.waitForSelector('[data-test="bc-password"]')
}

const HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

test.describe('bcrypt 哈希/校验 e2e', () => {
  test('生成 → 复制原文回填校验 → 匹配；改一字 → 不匹配（验收 8）', async ({ page }) => {
    await openTool(page)

    // 生成：按钮触发、非实时；60 字符 modular crypt 输出
    await page.fill('[data-test="bc-password"]', 'e2e-pass-123')
    await page.click('[data-test="bc-generate"]')
    const hash = page.locator('[data-test="bc-hash-output"]')
    await expect(hash).toHaveText(HASH_RE)
    const hashText = (await hash.textContent()) ?? ''

    // 复制 → 粘贴到校验（复制按钮态另测；此处以复制得到的原文回填）
    await page.fill('[data-test="bc-verify-password"]', 'e2e-pass-123')
    await page.fill('[data-test="bc-verify-hash"]', hashText)
    await page.click('[data-test="bc-verify"]')
    const verdict = page.locator('[data-test="bc-verify-result"]')
    await expect(verdict).toHaveClass(/match/)
    await expect(verdict).toContainText(/匹配|Match/)

    // 改一字 → 不匹配（红字）
    await page.fill('[data-test="bc-verify-password"]', 'e2e-pass-124')
    await page.click('[data-test="bc-verify"]')
    await expect(verdict).toHaveClass(/mismatch/)
    await expect(verdict).toContainText(/不匹配|Mismatch/)
  })

  test('合法哈希拆解四段；非法串 → 格式非法态且不拆解（验收 2 的 UI 面）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="bc-verify-password"]', 'whatever')
    await page.fill(
      '[data-test="bc-verify-hash"]',
      '$2b$10$Iv9Co4r3Qb60ic8ISW0IIebRywG0srRgQq3y2cMT3AwPu2HirRkxu',
    )
    // 解析区实时拆解（纯格式判定，零计算）
    await expect(page.locator('[data-test="bc-parse-prefix"]')).toHaveText('$2b$')
    await expect(page.locator('[data-test="bc-parse-cost"]')).toHaveText('10')
    await expect(page.locator('[data-test="bc-parse-salt"]')).toHaveText('Iv9Co4r3Qb60ic8ISW0IIe')
    await expect(page.locator('[data-test="bc-parse-digest"]')).toHaveText('bRywG0srRgQq3y2cMT3AwPu2HirRkxu')

    // 校验三态：该向量对应 'password'
    await page.fill('[data-test="bc-verify-password"]', 'password')
    await page.click('[data-test="bc-verify"]')
    await expect(page.locator('[data-test="bc-verify-result"]')).toHaveClass(/match/)

    // 非法串：解析区消失，校验呈格式非法态
    await page.fill('[data-test="bc-verify-hash"]', 'not-a-bcrypt-hash-at-all')
    await expect(page.locator('[data-test="bc-parse-panel"]')).toHaveCount(0)
    await page.click('[data-test="bc-verify"]')
    const verdict = page.locator('[data-test="bc-verify-result"]')
    await expect(verdict).toHaveClass(/invalid-format/)
    await expect(verdict).toContainText(/格式非法|Invalid format/)
  })

  test('工作因子滑杆与数值输入联动；>12 出现「约秒级耗时」提示（验收 5）', async ({ page }) => {
    await openTool(page)

    // 滑杆 → 数值输入联动
    await page.locator('[data-test="bc-cost-slider"]').fill('13')
    await expect(page.locator('[data-test="bc-cost-input"]')).toHaveValue('13')
    await expect(page.locator('[data-test="bc-cost-slow-hint"]')).toBeVisible()

    // 数值输入 → 滑杆联动；回到 ≤12 提示消失
    await page.fill('[data-test="bc-cost-input"]', '5')
    await expect(page.locator('[data-test="bc-cost-slider"]')).toHaveValue('5')
    await expect(page.locator('[data-test="bc-cost-slow-hint"]')).toHaveCount(0)
  })

  test('72 字节截断警示：73 字节触发；24 汉字恰达上限不触发，25 汉字触发（验收 3）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="bc-password"]', 'a'.repeat(73))
    await expect(page.locator('[data-test="bc-truncate-warning"]')).toBeVisible()

    await page.fill('[data-test="bc-password"]', '汉'.repeat(24))
    await expect(page.locator('[data-test="bc-truncate-warning"]')).toHaveCount(0)

    await page.fill('[data-test="bc-password"]', '汉'.repeat(25))
    await expect(page.locator('[data-test="bc-truncate-warning"]')).toBeVisible()

    // 校验区明文侧同样受截断警示约束
    await page.fill('[data-test="bc-verify-password"]', 'a'.repeat(80))
    await expect(page.locator('[data-test="bc-verify-truncate-warning"]')).toBeVisible()
  })

  test('生成后明文保留不清空；安全声明常驻（验收 5 的 UI 面）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="bc-password"]', 'keep-me')
    await page.click('[data-test="bc-generate"]')
    await expect(page.locator('[data-test="bc-hash-output"]')).toHaveText(HASH_RE)
    // 生成后明文输入保留不自动清空
    await expect(page.locator('[data-test="bc-password"]')).toHaveValue('keep-me')
    await expect(page.locator('[data-test="bc-notice"]')).toContainText(/零网络请求|zero network/i)
  })

  test('复制哈希 → 「已复制」态（chromium，clipboard-write 权限）', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await openTool(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

    await page.fill('[data-test="bc-password"]', 'copy-test')
    await page.click('[data-test="bc-generate"]')
    await expect(page.locator('[data-test="bc-hash-output"]')).toBeVisible()
    await page.click('[data-test="bc-copy-hash"]')
    await expect(page.locator('[data-test="bc-copy-hash"]')).toHaveText(/已复制|Copied/)
  })
})
