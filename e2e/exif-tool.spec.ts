import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { richJpegFixture } from '../src/tools/exif-tool/testFixtures'

// 票据：.scratch/hot-tools-v0.3.0/issues/14-exif-tool-spec.md（验收 8 的 e2e 主路径）
// - 带元数据的 JPEG（运行时构造：APP1/Exif + GPS + XMP + ICC 的段级手工字节，
//   复用 src/tools/exif-tool/testFixtures.ts 的 richJpegFixture——与单元测试同源，
//   不引入新 fixture 文件）
// - 上传 → 查看区出现分组字段（基本信息 / 拍摄参数 / GPS）+ GPS 摘要 + ICC 保留徽章
// - 点击清除 → 自动重解析闭环 → 「残留元数据：0」
// - 无元数据 PNG → 「无元数据」空态；清除/清空按钮存在

async function openTool(page: Page) {
  await page.goto('/#/tool/exif-tool')
  await page.waitForSelector('[data-test="dropzone"]')
}

test.describe('EXIF 查看/清除 e2e', () => {
  test('带 EXIF 的 JPEG：分组字段 + GPS 摘要 → 清除 → 残留=0（ICC 保留）', async ({ page }) => {
    await openTool(page)

    await page.locator('[data-test="file-input"]').setInputFiles({
      name: 'exif-photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(richJpegFixture()),
    } as never)

    // 查看完成 → viewing 行 + 格式徽章；详情默认展开
    const row = page.locator('[data-test="row"][data-status="viewing"]')
    await expect(row).toBeVisible({ timeout: 20000 })
    await expect(row.locator('[data-test="row-format"]')).toHaveText('JPEG')

    // 行级「清除」按钮（JPEG 可剥除）
    const stripButton = row.locator('[data-test="row-strip"]')
    await expect(stripButton).toBeVisible()

    // 分组字段：相机（Make='TestCam'）、基本信息（Orientation）、拍摄参数、GPS（39°54′15″N / 116°23′29″E）
    const detail = row.locator('.detail')
    await expect(detail.locator('[data-test="group-camera"]')).toContainText('TestCam')
    await expect(detail.locator('[data-test="group-basic"]')).toContainText('Rotate 90')
    await expect(detail.locator('[data-test="group-capture"]')).toContainText('400')
    await expect(detail.locator('[data-test="group-gps"]')).toBeVisible()
    const gpsSummary = detail.locator('[data-test="gps-summary"]')
    await expect(gpsSummary).toBeVisible()
    await expect(gpsSummary).toContainText('39.90')
    await expect(gpsSummary).toContainText('116.39')

    // 条目计数 > 0（ICC 不计入条目，仅以徽章展示）
    await expect(row.locator('[data-test="row-icc"]')).toBeVisible()
    const entriesText = (await row.locator('[data-test="row-entries"]').textContent()) ?? ''
    expect(entriesText).not.toMatch(/^\s*0\s/)

    // 清除 → 自动重解析闭环 → cleaned + 残留 0
    await stripButton.click()
    const cleaned = page.locator('[data-test="row"][data-status="cleaned"]')
    await expect(cleaned).toBeVisible({ timeout: 20000 })
    await expect(cleaned.locator('[data-test="row-residual"]'))
      .toHaveText(/(残留元数据：|Residual metadata: )\s*0/)
    // 前后大小对比仍在；ICC 徽章保留（白名单唯一项）
    await expect(cleaned.locator('[data-test="row-sizes"]')).toContainText('→')
    await expect(cleaned.locator('[data-test="row-icc"]')).toBeVisible()
    // 产物单文件下载按钮出现
    await expect(cleaned.locator('[data-test="row-download"]')).toBeVisible()
  })

  test('无元数据 PNG → 「无元数据」空态；清除/清空按钮存在', async ({ page }) => {
    await openTool(page)

    const png = readFileSync(path.resolve(process.cwd(), 'e2e', 'fixtures', 'sample.png'))
    await page.locator('[data-test="file-input"]').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    } as never)

    const row = page.locator('[data-test="row"][data-status="viewing"]')
    await expect(row).toBeVisible({ timeout: 20000 })
    await expect(row.locator('[data-test="row-format"]')).toHaveText('PNG')

    // 条目 0 → 详情显示「无元数据」空态，不渲染分组视图
    await expect(row.locator('[data-test="row-entries"]')).toContainText('0')
    await expect(row.locator('[data-test="row-no-metadata"]')).toBeVisible()
    await expect(row.locator('[data-test="group-basic"]')).toHaveCount(0)

    // 顶部「全部清除」「清空」按钮存在（清空因有行而可用）
    await expect(page.locator('[data-test="strip-all-btn"]')).toBeVisible()
    await expect(page.locator('[data-test="clear-btn"]')).toBeVisible()
    await expect(page.locator('[data-test="clear-btn"]')).toBeEnabled()
    // PNG 可剥除 → 行级清除按钮也在
    await expect(row.locator('[data-test="row-strip"]')).toBeVisible()
  })
})
