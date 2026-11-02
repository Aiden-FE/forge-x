import { test, expect } from '@playwright/test'

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/password-generator')
  await page.waitForSelector('[data-test="pw-row"]')
}

test.describe('密码生成器 e2e', () => {
  test('进入生成 1 个 20 位四类齐全；调策略不实时，重生成后按新策略且异于旧值', async ({ page }) => {
    await openTool(page)
    const rows = page.locator('[data-test="pw-row"] code')
    await expect(rows).toHaveCount(1)
    const first = rows.first()
    const initial = (await first.textContent()) ?? ''

    // 默认长度 20；「每已开类至少一字符」按构造保证（非概率碰巧）
    expect(initial).toHaveLength(20)
    expect(initial).toMatch(/[a-z]/)
    expect(initial).toMatch(/[A-Z]/)
    expect(initial).toMatch(/[0-9]/)
    expect(initial).toMatch(/[^A-Za-z0-9]/)

    // 手写真值：默认池 94（26+26+10+32）、长度 20 → 熵 20×log₂94 ≈ 131.1 bit ≥ 80 → 强
    await expect(page.locator('[data-test="pw-entropy"]')).toHaveText(/131\.1/)
    await expect(page.locator('[data-test="pw-tier"]')).toHaveClass(/tier-strong/)

    // 生成类不实时：数量预设 5 + 关闭符号类 → 已展示密码逐字符不变，仅出现过期提示
    await page.click('[data-test="pw-count-5"]')
    await page.uncheck('[data-test="pw-class-symbols"]')
    await expect(first).toHaveText(initial)
    await expect(page.locator('[data-test="pw-stale"]')).toBeVisible()

    // 重新生成 → 5 行 × 20 位：仅小写+大写+数字（无符号、每类齐全），且与旧密码不同
    await page.click('[data-test="pw-regenerate"]')
    await expect(rows).toHaveCount(5)
    const texts = await rows.allTextContents()
    for (const t of texts) {
      expect(t).toHaveLength(20)
      expect(t).toMatch(/^[A-Za-z0-9]+$/)
      expect(t).toMatch(/[a-z]/)
      expect(t).toMatch(/[A-Z]/)
      expect(t).toMatch(/[0-9]/)
      expect(t).not.toBe(initial)
    }
  })

  test('排除易混淆字符：开关不替换已展示密码；重生成后不含 0OoIl1；复制出现已复制态', async ({ page }) => {
    await openTool(page)
    const first = page.locator('[data-test="pw-row"] code').first()
    const initial = (await first.textContent()) ?? ''

    // 开启排除易混淆字符 → 旧密码不变、出现过期提示（生成类不实时）
    await page.check('[data-test="pw-confusable"]')
    await expect(first).toHaveText(initial)
    await expect(page.locator('[data-test="pw-stale"]')).toBeVisible()

    // 重新生成 → 新密码不含 0 O o I l 1，且与旧值不同
    await page.click('[data-test="pw-regenerate"]')
    const updated = (await first.textContent()) ?? ''
    expect(updated).not.toBe(initial)
    expect(updated).toMatch(/^[^0OoIl1]{20}$/)

    // 复制单行 → 按钮短暂进入「已复制/Copied」态（不读剪贴板内容）。
    // clipboard-write 权限 WebKit 不支持（Unknown permission），仅 chromium 验证此 UI 态。
    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.click('[data-test="pw-copy-0"]')
    await expect(page.locator('[data-test="pw-copy-0"]')).toHaveText(/已复制|Copied/)
  })
})
