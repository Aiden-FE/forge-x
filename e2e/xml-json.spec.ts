import { test, expect } from '@playwright/test'

// 票据 .scratch/hot-tools-v0.5.0/issues/05-xml-json-spec.md（主路径 e2e）。
// 值保真口径：parseTagValue/parseAttributeValue 关闭 → 属性值一律字符串无损；
// CDATA 用例依赖真浏览器 DOMParser（happy-dom 不支持 CDATA，单测缺口在此闭环）。
test.use({ locale: 'zh-CN' })

// 输入/方向切换均有 300ms 防抖，断言交给 toHaveValue/toContainText 自动重试。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/xml-json')
  await page.waitForSelector('[data-test="xml-json-src"]')
}

test.describe('XML↔JSON 互转 e2e', () => {
  test('XML→JSON：@_ 前缀属性 + 值保真（1.234 / 含撇号字符串不变形）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="xml-json-src"]', `<a x="1.234" y="It's"/>`)
    await expect(page.locator('[data-test="xml-json-dst"]')).toHaveValue(
      '{\n  "a": {\n    "@_x": "1.234",\n    "@_y": "It\'s"\n  }\n}',
    )
    // 无报错
    await expect(page.locator('[data-test="xml-json-error"]')).toHaveCount(0)
  })

  test('XML→JSON：CDATA 独立成 #cdata 键（真浏览器支持）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="xml-json-src"]', '<a><![CDATA[<raw> & stuff]]></a>')
    await expect(page.locator('[data-test="xml-json-dst"]')).toHaveValue(
      '{\n  "a": {\n    "#cdata": "<raw> & stuff"\n  }\n}',
    )
  })

  test('JSON→XML 反向：单一根对象重建 XML（属性撇号按 XML 规范转义）', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="xml-json-dir-json-xml"]')
    await page.fill('[data-test="xml-json-src"]', `{"a":{"@_x":"1.234","@_y":"It's"}}`)
    await expect(page.locator('[data-test="xml-json-dst"]')).toHaveValue(
      '<a x="1.234" y="It&apos;s"></a>\n',
    )
    await expect(page.locator('[data-test="xml-json-error"]')).toHaveCount(0)
  })

  test('不良构 XML：行/列报错（真 Chromium 硬断言）；输出保留旧值', async ({ page }) => {
    await openTool(page)

    // 先有一次成功转换，确立「旧值」
    await page.fill('[data-test="xml-json-src"]', `<a x="1.234" y="It's"/>`)
    await expect(page.locator('[data-test="xml-json-dst"]')).toHaveValue(
      '{\n  "a": {\n    "@_x": "1.234",\n    "@_y": "It\'s"\n  }\n}',
    )

    // 闭合标签错配：Chromium parsererror → 第 1 行第 10 列（与 xml-formatter 同源权威）
    await page.fill('[data-test="xml-json-src"]', '<a><b></a>')
    await expect(page.locator('[data-test="xml-json-error"]')).toBeVisible()
    await expect(page.locator('[data-test="xml-json-error"]')).toContainText('良构校验未通过')
    await expect(page.locator('[data-test="xml-json-error"]')).toContainText('第 1 行第 10 列')
    // 报错只错该处：输出保留上一次成功值
    await expect(page.locator('[data-test="xml-json-dst"]')).toHaveValue(
      '{\n  "a": {\n    "@_x": "1.234",\n    "@_y": "It\'s"\n  }\n}',
    )
  })
})
