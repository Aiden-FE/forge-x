import { test, expect } from '@playwright/test'

// 票据：.scratch/hot-tools-v0.3.0/issues/12-csv-json-spec.md（验收 10 的 e2e 主路径扩写）
// - 引号内逗号/换行/"" 转义 → 对象数组正确（RFC 4180 严格解析）
// - 值无损性：007 保持字符串
// - JSON 顶层数组 → CSV（表头为 key 并集；缺失 key / null → 空字段）
// - 坏 JSON / 嵌套值 → 行级错误提示
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/csv-json')
  await page.waitForSelector('[data-test="csv-json-input"]')
}

test.describe('CSV↔JSON e2e', () => {
  test('CSV→JSON：引号内逗号/换行、"" 转义、值无损', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="csv-json-input"]', [
      'name,note,code',
      '"A, comma","line1',
      'line2",007',
      'plain,"say ""hi""",3.10',
    ].join('\n'))

    const output = page.locator('[data-test="csv-json-output"]')
    // 引号内逗号不切列；引号内换行保留
    await expect(output).toHaveValue(/"name": "A, comma"/)
    await expect(output).toHaveValue(/"note": "line1\\nline2"/)
    // "" 转义引号；007 / 3.10 一律字符串不变形（值无损性）
    await expect(output).toHaveValue(/"note": "say \\"hi\\""/)
    await expect(output).toHaveValue(/"code": "007"/)
    await expect(output).toHaveValue(/"code": "3\.10"/)
    // 对象数组形态
    await expect(output).toHaveValue(/^\[\s*\{/)
    await expect(output).toHaveValue(/\}\s*\]\s*$/)
  })

  test('JSON→CSV：表头为 key 并集，缺失 key / null 填空', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="direction-json-to-csv"]')
    await page.fill('[data-test="csv-json-input"]',
      '[{"a":"1","b":"2"},{"b":"3","c":null},{"a":"","c":"x"}]')

    const output = page.locator('[data-test="csv-json-output"]')
    // 列集 = 全部对象 key 的并集（按首次出现序 a,b,c）；\r\n 行分隔（jsonToCsv 默认）
    await expect(output).toHaveValue(/^a,b,c\r?\n1,2,\r?\n,3,\r?\n,,x/)
  })

  test('JSON→CSV：嵌套对象/数组 → 行级定位错误（第 N 条 + key）', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="direction-json-to-csv"]')
    await page.fill('[data-test="csv-json-input"]',
      '[{"name":"ok"},{"name":{"nested":true}}]')

    const errors = page.locator('[data-test="errors"] .error')
    await expect(errors).toBeVisible()
    // 行级定位：第 2 条数据的字段 "name" / Entry 2, field "name"
    await expect(errors).toContainText(/(第 2 条数据的字段|Entry 2, field)/)
    await expect(errors.first()).toContainText('name')
  })

  test('坏 JSON → 错误提示出现', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="direction-json-to-csv"]')
    await page.fill('[data-test="csv-json-input"]', '[{"a":1}, {"b":}]')

    const errors = page.locator('[data-test="errors"] .error')
    await expect(errors).toBeVisible()
    const text = ((await errors.first().textContent()) ?? '').trim()
    expect(text.length).toBeGreaterThan(0)
  })

  test('CSV→JSON：未闭合引号 → 错误定位到行', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="csv-json-input"]', 'name,note\n"unclosed')

    const errors = page.locator('[data-test="errors"] .error')
    await expect(errors).toBeVisible()
    // 行级定位：第 2 行 / Line 2
    await expect(errors).toContainText(/(第 2 行|Line 2)/)
  })
})
