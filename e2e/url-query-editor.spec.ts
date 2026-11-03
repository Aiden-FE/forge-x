import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 300ms 实时防抖，断言交给自动重试。
// e2e 主路径（验收 8）：粘贴 URL → 表格编辑 → 复制输出 → 粘贴回输入往返一致。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/url-query-editor')
  await page.waitForSelector('[data-test="uqe-input"]')
}

test.describe('URL 查询编辑器 e2e', () => {
  test('原样保真：未编辑粘贴 → 输出字节级一致；编辑 y → 只重编码该行', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="uqe-input"]', 'https://e.cn/p?x=%2Fpath&y=a+b#frag')

    // URL 模式只读骨架展示
    await expect(page.locator('[data-test="uqe-url-head"]')).toHaveValue('https://e.cn/p')
    await expect(page.locator('[data-test="uqe-url-tail"]')).toHaveValue('#frag')

    // 两行参数实例
    await expect(page.locator('[data-test="uqe-row"]')).toHaveCount(2)
    // 解码显示：y 行值为 a b（+ = 空格）
    await expect(page.locator('[data-test="uqe-value-1"]')).toHaveValue('a b')
    // 未编辑 → 输出字节级一致（含 %2F、+、#frag）
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue('https://e.cn/p?x=%2Fpath&y=a+b#frag')

    // 编辑 y → 重编码 a%20b；x 行与骨架字节不动
    await page.fill('[data-test="uqe-value-1"]', 'a b')
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue(
      'https://e.cn/p?x=%2Fpath&y=a%20b#frag',
    )
  })

  test('重复键不合并、中间行编辑保持首尾位置；key-only 行按规则输出', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="uqe-input"]', '?a=1&a=2&a=3')
    await expect(page.locator('[data-test="uqe-row"]')).toHaveCount(3)
    await page.fill('[data-test="uqe-value-1"]', '9')
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue('?a=1&a=9&a=3')

    // key-only：flag 无值输出不带 =；填值后带 =
    await page.fill('[data-test="uqe-input"]', '?flag&x=1')
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue('?flag&x=1')
    await page.fill('[data-test="uqe-value-0"]', '1')
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue('?flag=1&x=1')
  })

  test('%ZZ 行级错误只定位该行，其余行与输出其余部分照常', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="uqe-input"]', '?x=%ZZ&y=ok')
    await expect(page.locator('[data-test="uqe-row-errors"]')).toBeVisible()
    await expect(page.locator('[data-test="uqe-row-errors"]')).toContainText('1')
    // 错误行原样保留，其余行照常
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue('?x=%ZZ&y=ok')
    await expect(page.locator('[data-test="uqe-value-0"]')).toHaveValue('%ZZ')
    await expect(page.locator('[data-test="uqe-value-1"]')).toHaveValue('ok')
  })

  test('排序开关：开启按 key 字典序，关闭恢复行序', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="uqe-input"]', 'b=1&a=2&c=3')
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue('b=1&a=2&c=3')

    await page.check('[data-test="uqe-sort"]')
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue('a=2&b=1&c=3')

    await page.uncheck('[data-test="uqe-sort"]')
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue('b=1&a=2&c=3')
  })

  test('往返一致：表格编辑 → 复制输出 → 粘贴回输入 → 输出不变（验收 8）', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="uqe-input"]', 'https://e.cn/p?x=%2Fpath&y=a+b#frag')
    await page.fill('[data-test="uqe-value-1"]', 'edited value')
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue(
      'https://e.cn/p?x=%2Fpath&y=edited%20value#frag',
    )

    // 复制输出（剪贴板）→ 粘贴回输入：输出应保持不变（字节级往返一致）
  // clipboard-write 仅 chromium 可授权（webkit 不支持该权限，仓库既有惯例）
  test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.click('[data-test="uqe-copy"]')
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe('https://e.cn/p?x=%2Fpath&y=edited%20value#frag')

    await page.fill('[data-test="uqe-input"]', clipboard)
    await expect(page.locator('[data-test="uqe-output"]')).toHaveValue(
      'https://e.cn/p?x=%2Fpath&y=edited%20value#frag',
    )
  })
})
