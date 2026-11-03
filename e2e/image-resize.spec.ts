import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


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

// ---------------------------------------------------------------------------
// 裁剪/旋转（票据 14 扩展 #4）
//
// 单向管线：裁剪 → 旋转 → 缩放/质量（裁剪/旋转文件级，缩放/质量批量级）。
// cropperjs 触达加载断言用 page.route 监听 `**/cropper*`（dev 下 dynamic
// import 走该 URL；vendor 构建产物亦含 cropperjs 名字）。
// 裁剪框×旋转的数值语义（1000×1000 裁 200×300 → 限长边 100 → 100×150、
// 旋转交换宽高先于缩放）已由 pipeline.spec / edit.spec 的 node 锚点覆盖；
// e2e 只覆盖 GUI 层：触达加载、徽标状态机（裁 → 改 → 清）、管线控件可见。
// 现有 fixture 均为正方形（64×64），宽高互换在尺寸标签上不可观测。
// ---------------------------------------------------------------------------
test.describe('裁剪/旋转 e2e', () => {
  async function trackCropper(page: Page) {
    const hits: string[] = []
    await page.route('**/cropper*', (route) => {
      hits.push(route.request().url())
      return route.continue()
    })
    return hits
  }

  const firstRow = (page: Page) => page.locator('[data-test="row"]').first()

  test('cropperjs 触达加载：不上传/不打开裁剪器零请求；打开裁剪器才加载（验收）', async ({ page }) => {
    const hits = await trackCropper(page)
    await openTool(page)

    // 页面加载 + 上传转换全程不触发 cropperjs
    await page.click('[data-test="mode-percent"]')
    await page.locator('[data-test="percent-input"]').fill('50')
    await uploadFixture(page, 'sample.png')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    expect(hits).toEqual([])

    // 打开裁剪器 → cropperjs（及其 CSS）此刻才请求
    await firstRow(page).locator('[data-test="row-crop-btn"]').click()
    await expect(page.locator('[data-test="crop-overlay"]')).toBeVisible({ timeout: 15000 })
    await expect(hits.length).toBeGreaterThan(0)
    await expect(page.locator('[data-test="crop-confirm"]')).toBeDisabled() // cropper ready 前不可确认

    // 取消关闭：不挂裁剪参数，无徽标
    await page.click('[data-test="crop-cancel"]')
    await expect(page.locator('[data-test="crop-overlay"]')).toHaveCount(0)
    await expect(page.locator('[data-test="row-cropped"]')).toHaveCount(0)
  })

  test('已裁剪徽标状态机：裁（确认出徽标）→ 改（重开再确认）→ 清（清除恢复）（验收）', async ({ page }) => {
    await trackCropper(page)
    await openTool(page)

    await uploadFixture(page, 'sample.png')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })

    // 裁：默认裁剪框为全图（autoCropArea 1），直接确认 → 徽标显示全图裁剪 64×64
    await firstRow(page).locator('[data-test="row-crop-btn"]').click()
    await expect(page.locator('[data-test="crop-overlay"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-test="crop-confirm"]')).toBeEnabled({ timeout: 15000 })
    await page.click('[data-test="crop-confirm"]')
    await expect(page.locator('[data-test="crop-overlay"]')).toHaveCount(0)
    const badge = firstRow(page).locator('[data-test="row-cropped"]')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText(/64×64/)

    // 改：重开编辑 → 确认（恢复已有裁剪框后再次确认）
    await firstRow(page).locator('[data-test="row-crop-btn"]').click()
    await expect(page.locator('[data-test="crop-overlay"]')).toBeVisible({ timeout: 15000 })
    await page.click('[data-test="crop-confirm"]')
    await expect(page.locator('[data-test="row-cropped"]')).toBeVisible()

    // 清：清除裁剪 → 徽标消失，按钮文案回到「裁剪」
    await firstRow(page).locator('[data-test="row-clear-crop"]').click()
    await expect(page.locator('[data-test="row-cropped"]')).toHaveCount(0)
    await expect(firstRow(page).locator('[data-test="row-crop-btn"]')).toContainText(/裁剪|Crop/)
    await expect(firstRow(page).locator('[data-test="row-clear-crop"]')).toHaveCount(0)
  })

  test('裁剪后批量缩放参数不受影响：确认裁剪 → 出现重新转换提示 → 重新转换成功（验收）', async ({ page }) => {
    await trackCropper(page)
    await openTool(page)

    await page.click('[data-test="mode-percent"]')
    await page.locator('[data-test="percent-input"]').fill('50')
    await uploadFixture(page, 'sample.png')
    const row = firstRow(page)
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    await expect(row.locator('[data-test="row-dims"]')).toHaveText(/64×64\s*→\s*32×32/)
    const banner = page.locator('[data-test="reconvert-banner"]')
    await expect(banner).toHaveCount(0)

    // 裁剪（文件级）→ 缩放/质量（批量级）设置本身没变，但行级生效快照失配 → 提示
    await row.locator('[data-test="row-crop-btn"]').click()
    await expect(page.locator('[data-test="crop-confirm"]')).toBeEnabled({ timeout: 15000 })
    await page.click('[data-test="crop-confirm"]')
    await expect(banner).toBeVisible()

    await page.click('[data-test="reconvert-btn"]')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    await expect(banner).toHaveCount(0)
    // 全图裁剪不改变尺寸语义：仍 64×64 → 32×32
    await expect(row.locator('[data-test="row-dims"]')).toHaveText(/64×64\s*→\s*32×32/)
  })

  test('旋转控件：90° 步进 0/90/180/270，切档出现重新转换提示，重转成功（验收）', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="mode-percent"]')
    await page.locator('[data-test="percent-input"]').fill('50')
    await uploadFixture(page, 'sample.png')
    const row = firstRow(page)
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })

    const banner = page.locator('[data-test="reconvert-banner"]')
    await expect(page.locator('[data-test="row-rot-0"]')).toHaveClass(/active/)
    await page.click('[data-test="row-rot-90"]')
    await expect(page.locator('[data-test="row-rot-90"]')).toHaveClass(/active/)
    await expect(banner).toBeVisible()

    await page.click('[data-test="reconvert-btn"]')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    await expect(banner).toHaveCount(0)
    // 正方形 fixture 旋转后缩放结果不变：64×64 → 32×32
    await expect(row.locator('[data-test="row-dims"]')).toHaveText(/64×64\s*→\s*32×32/)
  })

  test('管线提示可见（单向固定：裁剪 → 旋转 → 缩放/质量）', async ({ page }) => {
    await openTool(page)
    await expect(page.locator('[data-test="pipeline-hint"]')).toContainText(/裁剪|Crop/)
    await expect(page.locator('[data-test="pipeline-hint"]')).toContainText(/旋转|Rotate/)
    await expect(page.locator('[data-test="pipeline-hint"]')).toContainText(/缩放|quality|Scale/i)
  })
})
