import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 输入有 300ms 防抖，断言均交给 toBeVisible/toHaveText 的自动重试。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/cron-tool')
  await page.waitForSelector('[data-test="expr-input"]')
}

test.describe('Cron 解析/生成 e2e', () => {
  test('粘贴表达式 → 描述/字段速览/执行预览出现', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="expr-input"]', '0 9 * * *')
    await expect(page.locator('[data-test="description"]')).toBeVisible()
    await expect(page.locator('[data-test="field-row-minute"]')).toBeVisible()
    await expect(page.locator('[data-test="field-raw-minute"]')).toHaveText('0')
    await expect(page.locator('[data-test="field-raw-hour"]')).toHaveText('9')
    await expect(page.locator('[data-test="field-raw-dom"]')).toHaveText('*')
    await expect(page.locator('[data-test="field-raw-month"]')).toHaveText('*')
    await expect(page.locator('[data-test="field-raw-dow"]')).toHaveText('*')
    // 执行预览 5 条
    await expect(page.locator('[data-test="preview-runs"] > li')).toHaveCount(5)
    // 周字段口径常驻警示可见
    await expect(page.locator('[data-test="dow-warning"]')).toBeVisible()
  })

  test('6 字段（首位秒）自动识别；改一个字段 → 只该字段变化', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="expr-input"]', '0 30 9 * * *')
    await expect(page.locator('[data-test="field-row-second"]')).toBeVisible()
    await expect(page.locator('[data-test="field-raw-second"]')).toHaveText('0')
    await expect(page.locator('[data-test="field-raw-minute"]')).toHaveText('30')

    // 改分字段：30 → 45，秒/时/日/月/周不变
    await page.fill('[data-test="expr-input"]', '0 45 9 * * *')
    await expect(page.locator('[data-test="field-raw-minute"]')).toHaveText('45')
    await expect(page.locator('[data-test="field-raw-second"]')).toHaveText('0')
    await expect(page.locator('[data-test="field-raw-hour"]')).toHaveText('9')
    await expect(page.locator('[data-test="field-raw-dom"]')).toHaveText('*')
    await expect(page.locator('[data-test="field-raw-month"]')).toHaveText('*')
    await expect(page.locator('[data-test="field-raw-dow"]')).toHaveText('*')
    await expect(page.locator('[data-test="preview-run-0"]')).toBeVisible()
  })

  test('非法字段只红该处，其余字段速览照常', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="expr-input"]', '99 9 * * *')
    await expect(page.locator('[data-test="field-error-minute"]')).toBeVisible()
    // 其余字段照常展示
    await expect(page.locator('[data-test="field-raw-hour"]')).toHaveText('9')
    await expect(page.locator('[data-test="field-row-dom"]')).toBeVisible()
    // 无整串错误
    await expect(page.locator('[data-test="parse-error"]')).toHaveCount(0)

    // dow 8 只红周字段
    await page.fill('[data-test="expr-input"]', '* 9 * * 8')
    await expect(page.locator('[data-test="field-error-dow"]')).toBeVisible()
    await expect(page.locator('[data-test="field-error-minute"]')).toHaveCount(0)
    await expect(page.locator('[data-test="field-raw-hour"]')).toHaveText('9')
  })

  test('7 字段整串报错（年份字段不支持）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="expr-input"]', '* * * * * * 2026')
    await expect(page.locator('[data-test="parse-error"]')).toBeVisible()
    await expect(page.locator('[data-test="overview"]')).toHaveCount(0)
    await expect(page.locator('[data-test="preview-runs"]')).toHaveCount(0)
  })

  test('时区切换：预览换算到所选 IANA 时区', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="expr-input"]', '0 9 * * *')
    await expect(page.locator('[data-test="preview-run-0"]')).toBeVisible()

    await page.fill('[data-test="tz-filter"]', 'Shanghai')
    await page.selectOption('[data-test="tz-select"]', 'Asia/Shanghai')
    await expect(page.locator('[data-test="preview-run-0"]')).toContainText('+08:00')
  })

  test('模板一键填入 → 构建器预设产出 → 填入解析区 → 复制表达式', async ({ page }) => {
    await openTool(page)

    // 模板一键：工作日 9 点
    await page.click('[data-test="template-weekday9am"]')
    await expect(page.locator('[data-test="expr-input"]')).toHaveValue('0 9 * * 1-5')
    await expect(page.locator('[data-test="field-raw-dow"]')).toHaveText('1-5')
    await expect(page.locator('[data-test="field-row-dow"]')).toBeVisible()

    // 构建器：默认产出 * * * * *；预设「每天 9 点」→ 0 9 * * *
    await expect(page.locator('[data-test="builder-expr"]')).toHaveText('* * * * *')
    await page.click('[data-test="preset-daily9am"]')
    await expect(page.locator('[data-test="builder-expr"]')).toHaveText('0 9 * * *')

    // 填入解析区：解析区往返一致
    await page.click('[data-test="builder-fill"]')
    await expect(page.locator('[data-test="expr-input"]')).toHaveValue('0 9 * * *')

    // 复制（chromium：clipboard-write 可授权）
    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.click('[data-test="builder-copy"]')
    await expect(page.locator('[data-test="builder-copy"]')).toContainText('已复制')
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe('0 9 * * *')
  })
})
