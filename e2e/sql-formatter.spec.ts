import { test, expect } from '@playwright/test'

// 300ms 实时防抖（Worker 执行），断言交给 toHaveValue 自动重试。
// 主线程零阻塞（1 MiB Worker 内 < 2s）为规格手动验收项，自动化不覆盖。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/sql-formatter')
  await page.waitForSelector('[data-test="sql-input"]')
}

test.describe('SQL 格式化 e2e', () => {
  test('粘贴 → 默认方言排版输出；选方言 → 输出随方言变化；调选项 → 重排', async ({ page }) => {
    await openTool(page)
    const input =
      'select user_id, name from users where status = \'active\' order by created_at desc limit 10;'

    await page.fill('[data-test="sql-input"]', input)
    await expect(page.locator('[data-test="sql-output"]')).toHaveValue(/SELECT\n  user_id,\n  name\nFROM/)
    await expect(page.locator('[data-test="sql-error"]')).toHaveCount(0)

    // 方言切换：T-SQL 的 LIMIT 与 DESC 同行（标准 SQL 折行），输出随方言变化
    await page.selectOption('[data-test="sql-dialect"]', 'transactsql')
    await expect(page.locator('[data-test="sql-output"]')).toHaveValue(/created_at DESC LIMIT 10;/)

    // 缩进宽度 4：行前缀由 2 空格变 4 空格
    await page.selectOption('[data-test="sql-indent"]', '4')
    await expect(page.locator('[data-test="sql-output"]')).toHaveValue(/SELECT\n    user_id,/)

    // 关键字 lower
    await page.selectOption('[data-test="sql-keyword-case"]', 'lower')
    await expect(page.locator('[data-test="sql-output"]')).toHaveValue(/select\n    user_id,/)
  })

  test('防抖期间连续输入仅以最终内容计算一次（300ms 节奏内快速补写）', async ({ page }) => {
    await openTool(page)
    // 300ms 内连续两段输入：最终输出只反映合并后的完整语句
    await page.fill('[data-test="sql-input"]', 'select a from t')
    await page.keyboard.type(' where x > 1', { delay: 10 })
    await expect(page.locator('[data-test="sql-output"]')).toHaveValue(/SELECT\n  a\nFROM\n  t\nWHERE\n  x > 1/)
  })

  test('词法崩溃 → 错误态 + 旧输出保留（尽力而为格式化）', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="sql-input"]', 'select a from t where x > 1')
    await expect(page.locator('[data-test="sql-output"]')).toHaveValue(/x > 1/)

    await page.fill('[data-test="sql-input"]', "select 'unclosed")
    await expect(page.locator('[data-test="sql-error"]')).toBeVisible()
    // 旧输出原样保留
    await expect(page.locator('[data-test="sql-output"]')).toHaveValue(/SELECT\n  a\nFROM\n  t\nWHERE\n  x > 1/)
  })

  test('复制输出（含复制语义正确）', async ({ page }) => {
    await openTool(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.fill('[data-test="sql-input"]', 'select 42')
    await expect(page.locator('[data-test="sql-output"]')).toHaveValue(/42/)

    await page.click('[data-test="sql-copy"]')
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toContain('SELECT')
    expect(clipboard).toContain('42')
  })
})
