import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/base64-codec')
  await page.waitForSelector('[data-test="b64-input"]')
}

test.describe('Base64 codec e2e smoke', () => {
  test('encodes plain text and round-trips', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="b64-input"]', 'hello forgex')
    await page.click('[data-test="b64-encode"]')
    await expect(page.locator('[data-test="b64-output"]')).toHaveValue('aGVsbG8gZm9yZ2V4')

    await page.fill('[data-test="b64-input"]', 'aGVsbG8gZm9yZ2V4')
    await page.click('[data-test="b64-decode"]')
    await expect(page.locator('[data-test="b64-output"]')).toHaveValue('hello forgex')
  })

  test('invalid base64 surfaces error', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="b64-input"]', '%%%')
    await page.click('[data-test="b64-decode"]')
    await expect(page.locator('[data-test="b64-error"]')).toBeVisible()
  })
})

// 票据：.scratch/hot-tools-v0.4.0/issues/13-extensions-format-spec.md §2（图片↔Base64）
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_DATA_URI = `data:image/png;base64,${PNG_BASE64}`

async function openImageMode(page: import('@playwright/test').Page) {
  await openTool(page)
  await page.click('[data-test="b64-mode-image"]')
  await expect(page.locator('[data-test="b64-img-drop"]')).toBeVisible()
}

test.describe('图片↔Base64 e2e（13 票扩展）', () => {
  test('文本模式默认保留；切到图片模式出现正向/反向区', async ({ page }) => {
    await openTool(page)
    await expect(page.locator('[data-test="b64-mode-text"]')).toHaveClass(/active/)
    await page.click('[data-test="b64-mode-image"]')
    await expect(page.locator('[data-test="b64-mode-image"]')).toHaveClass(/active/)
    await expect(page.locator('[data-test="b64-img-decode-input"]')).toBeVisible()
    // 文本模式控件随页签隐藏
    await expect(page.locator('[data-test="b64-input"]')).toBeHidden()
  })

  test('正向：批量入批产出三形态；超出 20 个的文件不入批并报错', async ({ page }) => {
    await openImageMode(page)

    // 21 个 1×1 PNG：前 20 入批，第 21 个 tooMany
    const files = Array.from({ length: 21 }, (_, i) => ({
      name: `pixel-${i}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    }))
    await page.setInputFiles('[data-test="b64-img-picker"]', files)

    await expect(page.locator('[data-test="b64-img-item"]')).toHaveCount(20)
    const errors = page.locator('[data-test="b64-img-errors"] li')
    await expect(errors).toHaveCount(1)
    await expect(errors.first()).toContainText('pixel-20.png')
    await expect(errors.first()).toContainText('20')

    // 首个结果的三形态与 mime
    const firstMime = page.locator('[data-test="b64-img-item"]').first().locator('[data-test="b64-img-mime"]')
    await expect(firstMime).toHaveText('image/png')
    await expect(page.locator('[data-test="b64-img-copy-duri"]').first()).toBeVisible()
    await expect(page.locator('[data-test="b64-img-copy-img"]').first()).toBeVisible()
    await expect(page.locator('[data-test="b64-img-copy-css"]').first()).toBeVisible()

    // data URI 形态点击复制 → 剪贴板为完整 data URI
  // clipboard-write 仅 chromium 可授权（webkit 不支持该权限，仓库既有惯例）
  test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.locator('[data-test="b64-img-copy-duri"]').first().click()
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe(PNG_DATA_URI)
  })

  test('反向：粘贴 data URI → 预览 + mime 识别 + 下载命名冲突追加 _1', async ({ page }) => {
    await openImageMode(page)

    await page.fill('[data-test="b64-img-decode-input"]', PNG_DATA_URI)
    await expect(page.locator('[data-test="b64-img-preview"]')).toBeVisible()
    await expect(page.locator('[data-test="b64-img-decode-mime"]')).toHaveText('image/png')

    // 缺失 ;base64 参数容错（mime 大小写不敏感）
    await page.fill('[data-test="b64-img-decode-input"]', PNG_DATA_URI.replace('data:image/png;base64,', 'DATA:Image/PNG,'))
    await expect(page.locator('[data-test="b64-img-preview"]')).toBeVisible()

    // 非图片 data URI → 报错
    await page.fill('[data-test="b64-img-decode-input"]', 'data:text/html;base64,PGgxPmhpPC9oMT4=')
    await expect(page.locator('[data-test="b64-img-decode-error"]')).toBeVisible()
    await expect(page.locator('[data-test="b64-img-preview"]')).toHaveCount(0)

    // 下载命名：image.png → 冲突追加 _1
    await page.fill('[data-test="b64-img-decode-input"]', PNG_DATA_URI)
    await expect(page.locator('[data-test="b64-img-preview"]')).toBeVisible()
    const [first] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-test="b64-img-download"]'),
    ])
    expect(first.suggestedFilename()).toBe('image.png')
    const [second] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-test="b64-img-download"]'),
    ])
    expect(second.suggestedFilename()).toBe('image_1.png')
  })
})