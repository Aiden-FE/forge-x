import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

// 票据：.scratch/hot-tools-v0.3.0/issues/15-image-resize-spec.md（验收 8 的 e2e 主路径）
// - setInputFiles 上传 → 转换列表出现行，显示输出尺寸 / 压缩率
// - 下载全部按钮可见（zip 下载事件）
// - 质量滑杆仅对 JPEG/WebP 显示（PNG 输出时隐藏——组件现状是 v-if 隐藏而非禁用）
// fixture 复用 webp-helpers 的路径定位（e2e/fixtures）。

const fixture = (name: string) => path.resolve(process.cwd(), 'e2e', 'fixtures', name)

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

async function openTool(page: Page) {
  await page.goto('/#/tool/image-resize')
  await page.waitForSelector('[data-test="dropzone"]')
}

async function uploadFixture(page: Page, name: string) {
  const file = fixture(name)
  await page.locator('[data-test="file-input"]').setInputFiles({
    name,
    mimeType: MIME_BY_EXT[path.extname(name)] ?? 'application/octet-stream',
    buffer: readFileSync(file),
  } as never)
}

const rowByStatus = (page: Page, status: string) =>
  page.locator(`[data-test="row"][data-status="${status}"]`)

test.describe('图片压缩/缩放 e2e', () => {
  test('上传 PNG（百分比 50%）→ 成功行显示输出尺寸 / 压缩率，下载全部可用', async ({ page }) => {
    await openTool(page)

    // 上传前先设为 50% 等比：64×64 → 32×32（避免上传后再改设置触发「重新转换」横幅）
    await page.click('[data-test="mode-percent"]')
    await page.locator('[data-test="percent-input"]').fill('50')

    await uploadFixture(page, 'sample.png')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })

    const row = page.locator('[data-test="row"]').first()
    // 输出名：basename + 输出格式扩展名
    await expect(row.locator('.row-name')).toContainText('sample.webp')
    // 缩略图
    await expect(row.locator('[data-test="row-thumb"]')).toBeVisible()
    // 尺寸 64×64 → 32×32
    await expect(row.locator('[data-test="row-dims"]')).toHaveText(/64×64\s*→\s*32×32/)
    // 前后大小与压缩率（含负值语义的百分比格式）
    await expect(row.locator('[data-test="row-sizes"]')).toContainText('→')
    await expect(row.locator('[data-test="row-ratio"]')).toHaveText(/-?\d+(\.\d)?%/)

    // 下载全部按钮可见且可用（成功数 > 0）
    const downloadAll = page.locator('[data-test="download-all-btn"]')
    await expect(downloadAll).toBeVisible()
    await expect(downloadAll).toBeEnabled()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadAll.click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^image-resized-\d{8}-\d{6}\.zip$/)
  })

  test('质量滑杆仅对 JPEG/WebP 显示：PNG 输出时隐藏，JPEG 时恢复', async ({ page }) => {
    await openTool(page)

    // 默认输出 WebP → 质量控件显示
    await expect(page.locator('[data-test="quality-control"]')).toBeVisible()
    await expect(page.locator('[data-test="quality-slider"]')).toBeVisible()
    await expect(page.locator('[data-test="quality-input"]')).toBeVisible()

    // 切 PNG → 无质量概念，控件隐藏（组件现状：v-if 隐藏而非禁用）
    await page.click('[data-test="format-png"]')
    await expect(page.locator('[data-test="quality-control"]')).toHaveCount(0)
    await expect(page.locator('[data-test="quality-slider"]')).toHaveCount(0)

    // 切 JPEG → 恢复显示
    await page.click('[data-test="format-jpeg"]')
    await expect(page.locator('[data-test="quality-control"]')).toBeVisible()

    // WebP → 恢复显示
    await page.click('[data-test="format-webp"]')
    await expect(page.locator('[data-test="quality-control"]')).toBeVisible()
  })

  test('JPEG 输出：修改质量 → 「设置已变更」→ 重新转换后成功', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="format-jpeg"]')
    await uploadFixture(page, 'sample.png')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    const row = page.locator('[data-test="row"]').first()
    await expect(row.locator('.row-name')).toContainText('sample.jpg')

    const banner = page.locator('[data-test="reconvert-banner"]')
    await expect(banner).toHaveCount(0)

    await page.locator('[data-test="quality-input"]').fill('50')
    await expect(banner).toBeVisible()

    await page.click('[data-test="reconvert-btn"]')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    await expect(banner).toHaveCount(0)
  })
})
