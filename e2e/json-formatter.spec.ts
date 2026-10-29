import { test, expect } from '@playwright/test'

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/json-formatter')
  await page.waitForSelector('[data-test="json-input"]')
}

test.describe('JsonFormatter e2e smoke', () => {
  test('format valid JSON into pretty output', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="json-input"]', '{"a":1,"b":[2,3]}')
    await page.click('[data-test="json-format"]')
    await expect(page.locator('[data-test="json-output"]')).toHaveValue(/"a":\s*1/)
    await expect(page.locator('[data-test="json-output"]')).toHaveValue(/"b":\s*\[/)
  })

  test('invalid JSON shows error and clears output', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="json-input"]', '{not json}')
    await page.click('[data-test="json-format"]')
    await expect(page.locator('[data-test="json-error"]')).toBeVisible()
  })
})

// E3 扩展（票据 .scratch/hot-tools-v0.3.0/issues/11-extensions-spec.md）：
// JSONPath 查询主路径——Goessner bookstore 样例 → $.store.book[*].author
// 返回匹配数与首个匹配；非法路径 → 行内错误提示，且不影响格式化输出区。
test.describe('JsonFormatter JSONPath e2e (E3)', () => {
  const STORE_JSON = JSON.stringify({
    store: {
      book: [
        { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
        { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
        { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', isbn: '0-553-21311-3', price: 8.99 },
        { category: 'fiction', author: 'J. R. R. Tolkien', title: 'The Lord of the Rings', isbn: '0-395-19395-8', price: 22.99 },
      ],
      bicycle: { color: 'red', price: 19.95 },
    },
  })

  test('format then query $.store.book[*].author → count 4 + first match', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="json-input"]', STORE_JSON)
    await page.click('[data-test="json-format"]')
    await expect(page.locator('[data-test="json-output"]')).toHaveValue(/"author":\s*"Nigel Rees"/)

    await page.fill('[data-test="jsonpath-input"]', '$.store.book[*].author')
    await page.click('[data-test="jsonpath-run"]')

    // 匹配数 4（zh「4 个匹配」/ en「4 matches」）
    await expect(page.locator('[data-test="jsonpath-count"]')).toHaveText(/4( 个匹配| matches)/)
    const matches = page.locator('[data-test="jsonpath-match"]')
    await expect(matches).toHaveCount(4)
    // 首个匹配：Nigel Rees（值以格式化 JSON 呈现）
    await expect(matches.first()).toContainText('Nigel Rees')
    // 查询不影响格式化输出区
    await expect(page.locator('[data-test="json-output"]')).toHaveValue(/"author":\s*"Nigel Rees"/)
  })

  test('invalid JSONPath → inline error, results area untouched', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="json-input"]', STORE_JSON)
    await page.fill('[data-test="jsonpath-input"]', '$..book[?(@.price<)]')
    await page.click('[data-test="jsonpath-run"]')

    await expect(page.locator('[data-test="jsonpath-error"]')).toBeVisible()
    const text = ((await page.locator('[data-test="jsonpath-error"]').textContent()) ?? '').trim()
    expect(text.length).toBeGreaterThan(0)
    // 无结果列表渲染
    await expect(page.locator('[data-test="jsonpath-results"]')).toHaveCount(0)
    // 查询区之外不动：输出区保持空（未点过格式化）
    await expect(page.locator('[data-test="json-output"]')).toHaveValue('')
  })
})