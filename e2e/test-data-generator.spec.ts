import { test, expect } from '@playwright/test'

// 生成类非实时：显式「生成」按钮触发，控制只影响下一次生成。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/test-data-generator')
  await page.waitForSelector('[data-test="tdg-generate"]')
}

test.describe('测试数据生成器 e2e', () => {
  test('0 字段勾选 → 生成按钮禁用；勾选后可生成，结构字段通过结构校验', async ({ page }) => {
    await openTool(page)
    await expect(page.locator('[data-test="tdg-generate"]')).toBeDisabled()

    await page.check('[data-test="tdg-field-name"]')
    await page.check('[data-test="tdg-field-phone"]')
    await page.check('[data-test="tdg-field-idCard"]')
    await page.check('[data-test="tdg-field-bankCard"]')
    await expect(page.locator('[data-test="tdg-generate"]')).toBeEnabled()

    // 常驻声明可见
    await expect(page.locator('[data-test="tdg-notice"]')).toContainText('仅供软件测试')

    await page.click('[data-test="tdg-generate"]')
    const rows = page.locator('[data-test="tdg-row"]')
    await expect(rows.first()).toBeVisible()
    const cells = rows.first().locator('td')
    // 姓名（中文词库）/ 手机号 1[3-9]\d{9}
    await expect(cells.nth(0)).toHaveText(/[\u4e00-\u9fff]/)
    await expect(cells.nth(1)).toHaveText(/^1[3-9]\d{9}$/)
  })

  test('数据语言切换：中文姓名 ↔ English 合成词（独立于界面语言，仅影响下一次生成）', async ({ page }) => {
    await openTool(page)
    await page.check('[data-test="tdg-field-name"]')
    await page.click('[data-test="tdg-generate"]')
    let cells = page.locator('[data-test="tdg-row"]').first().locator('td')
    await expect(cells.nth(0)).toHaveText(/[\u4e00-\u9fff]/)

    // 切换数据语言 → 生成 → 姓名换轨为英文合成词
    await page.click('[data-test="tdg-locale-en"]')
    await page.click('[data-test="tdg-generate"]')
    cells = page.locator('[data-test="tdg-row"]').first().locator('td')
    await expect(cells.nth(0)).toHaveText(/^[A-Za-z]+ [A-Za-z]+$/)
  })

  test('条数边界：0/1001 报错，1 与 1000 可生成', async ({ page }) => {
    await openTool(page)
    await page.check('[data-test="tdg-field-phone"]')

    await page.fill('[data-test="tdg-count"]', '0')
    await page.click('[data-test="tdg-generate"]')
    await expect(page.locator('[data-test="tdg-error"]')).toBeVisible()

    await page.fill('[data-test="tdg-count"]', '1001')
    await page.click('[data-test="tdg-generate"]')
    await expect(page.locator('[data-test="tdg-error"]')).toBeVisible()

    await page.fill('[data-test="tdg-count"]', '1')
    await page.click('[data-test="tdg-generate"]')
    await expect(page.locator('[data-test="tdg-row"]')).toHaveCount(1)

    // 1000 行：表格预览截断为前 100 行（导出含全部）
    await page.fill('[data-test="tdg-count"]', '1000')
    await page.click('[data-test="tdg-generate"]')
    await expect(page.locator('[data-test="tdg-row"]')).toHaveCount(100)
    await expect(page.locator('[data-test="tdg-rows-note"]')).toContainText('1000')
  })

  test('导出 JSON / CSV：文件名与内容（值字符串无损）', async ({ page }) => {
    await openTool(page)
    await page.check('[data-test="tdg-field-name"]')
    await page.check('[data-test="tdg-field-phone"]')
    await page.fill('[data-test="tdg-count"]', '3')
    await page.click('[data-test="tdg-generate"]')
    await expect(page.locator('[data-test="tdg-row"]').first()).toBeVisible()

    const jsonDownload = page.waitForEvent('download')
    await page.click('[data-test="tdg-export-json"]')
    const json = await jsonDownload
    expect(json.suggestedFilename()).toBe('test-data.json')
    const jsonPath = await json.path()
    const jsonText = (await import('node:fs/promises')).readFile(jsonPath!, 'utf-8')
    const parsed = JSON.parse(await jsonText) as Array<Record<string, string>>
    expect(parsed).toHaveLength(3)
    // 键 = 字段名（界面语言标签），值一律字符串
    const keys = Object.keys(parsed[0]!)
    expect(keys).toHaveLength(2)
    expect(keys.every((k) => k === '姓名' || k === 'Name')).toBe(true)
    expect(typeof parsed[0]![keys[0]!]).toBe('string')

    const csvDownload = page.waitForEvent('download')
    await page.click('[data-test="tdg-export-csv"]')
    const csv = await csvDownload
    expect(csv.suggestedFilename()).toBe('test-data.csv')
  })
})
