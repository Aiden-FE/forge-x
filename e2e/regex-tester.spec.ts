import { test, expect } from '@playwright/test'

// 正则测试器 e2e（票据 04 验收 #10：打开 /tool/regex-tester，输入模式与文本，
// 验证高亮、列表、替换预览、语言切换；另覆盖验收 #4 页面可交互 / #5 非法模式 / #9 预设）。
//
// 期望值手算（pattern `(\w+)\s(\w+)`，flags 默认 g，文本 `hello world foo bar`）：
// - 匹配 1 `hello world` 区间 [0, 11)，组 $1=hello $2=world；
// - 匹配 2 `foo bar`   区间 [12, 19)，组 $1=foo   $2=bar（索引为 UTF-16 code unit 偏移）；
// - 高亮 2 处 mark，交替底色类 alt-a / alt-b；
// - 替换模板 `$2 $1` → `world hello bar foo`（g 全部替换）。
test.use({ locale: 'zh-CN' })
// 仅断言「已复制」UI 状态（不读剪贴板真实内容）
test.use({ permissions: ['clipboard-write'] })

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/regex-tester')
  await page.waitForSelector('[data-test="pattern-input"]')
}

test.describe('Regex Tester e2e', () => {
  test('匹配列表与高亮、编号组列示、替换预览 $2 $1、语言切换（票据验收 #10）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="pattern-input"]', '(\\w+)\\s(\\w+)')
    await page.fill('[data-test="text-input"]', 'hello world foo bar')
    // 匹配经 Worker 执行（输入防抖 250ms），断言自动重试
    await expect(page.locator('[data-test="summary-count"]')).toHaveText('2 个匹配')
    await expect(page.locator('[data-test="summary-duration"]')).toContainText('ms')

    // 高亮预览：2 处 mark，交替底色
    const marks = page.locator('[data-test="highlight"] .seg-match')
    await expect(marks).toHaveCount(2)
    await expect(marks.nth(0)).toHaveText('hello world')
    await expect(marks.nth(0)).toHaveClass(/alt-a/)
    await expect(marks.nth(1)).toHaveText('foo bar')
    await expect(marks.nth(1)).toHaveClass(/alt-b/)

    // 匹配列表：序号 + [start, end) 区间 + 编号捕获组 $1/$2 内容
    const row0 = page.locator('[data-test="match-row-0"]')
    await expect(row0).toContainText('[0, 11)')
    await expect(row0).toContainText('hello world')
    const chips0 = row0.locator('.group-chip')
    await expect(chips0).toHaveCount(2)
    await expect(chips0.nth(0)).toContainText('$1')
    await expect(chips0.nth(0)).toContainText('hello')
    await expect(chips0.nth(1)).toContainText('$2')
    await expect(chips0.nth(1)).toContainText('world')

    const row1 = page.locator('[data-test="match-row-1"]')
    await expect(row1).toContainText('[12, 19)')
    await expect(row1).toContainText('foo bar')
    await expect(row1.locator('.group-chip').nth(0)).toContainText('foo')
    await expect(row1.locator('.group-chip').nth(1)).toContainText('bar')

    // 复制该匹配 JSON：仅断言「已复制」UI 状态
    await page.click('[data-test="copy-match-0"]')
    await expect(page.locator('[data-test="copy-match-0"]')).toContainText('已复制')

    // 替换模板 $2 $1 → 交换两组（g 全部替换）
    await page.fill('[data-test="replacement-input"]', '$2 $1')
    await expect(page.locator('[data-test="replace-preview"]')).toHaveText('world hello bar foo')

    // 语言切换即时更新（AppHeader 切换按钮：zh-CN 下显示 EN）
    await page.getByRole('button', { name: 'EN', exact: true }).click()
    await expect(page.locator('[data-test="summary-count"]')).toHaveText('2 matches')
    await expect(page.locator('[data-test="replace-preview"]')).toHaveText('world hello bar foo')
  })

  test('非法模式 `(`：错误条显示本地化前缀，无结果区残留（票据验收 #5）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="pattern-input"]', '(')
    await page.fill('[data-test="text-input"]', 'abc')
    const error = page.locator('[data-test="pattern-error"]')
    // 本地化前缀「非法模式：」+ 透传的 JS 错误信息（浏览器语言相关，不 断言其内容）
    await expect(error).toBeVisible()
    await expect(error).toContainText('非法模式：')

    // 无结果区残留：概要/高亮/列表不渲染，仅空状态提示
    await expect(page.locator('[data-test="summary"]')).toHaveCount(0)
    await expect(page.locator('[data-test="highlight"]')).toHaveCount(0)
    await expect(page.locator('[data-test="match-list"]')).toHaveCount(0)
    await expect(page.locator('[data-test="waiting"]')).toBeVisible()
  })

  test('ReDoS 样例 1.5s 超时终止，页面保持可交互（票据验收 #4）', async ({ page }) => {
    await openTool(page)

    // (a+)+$ 对 35 个 a + b 灾难性回溯：主线程 1.5s terminate 兜底
    await page.fill('[data-test="pattern-input"]', '(a+)+$')
    await page.fill('[data-test="text-input"]', 'a'.repeat(35) + 'b')
    await expect(page.locator('[data-test="timeout-error"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-test="timeout-badge"]')).toBeVisible()

    // 超时后页面可交互：换简单模式立即出新结果
    await page.fill('[data-test="pattern-input"]', 'b')
    await expect(page.locator('[data-test="summary-count"]')).toHaveText('1 个匹配')
    await expect(page.locator('[data-test="timeout-error"]')).toHaveCount(0)
  })

  test('预设插入模式框并可立即运行（票据验收 #9）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="text-input"]', 'contact: 13800138000')
    await page.click('[data-test="preset-phone"]')
    await expect(page.locator('[data-test="pattern-input"]')).toHaveValue('1[3-9]\\d{9}')
    // 插入后自动运行：11 位手机号整串 1 处匹配
    await expect(page.locator('[data-test="summary-count"]')).toHaveText('1 个匹配')
  })
})
