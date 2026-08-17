import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { test, expect } from '@playwright/test'
import { expectWebpMagic, fixture, openTool, rowByStatus, upload } from './webp-helpers'

test.describe('WebP 转换器 e2e', () => {
  test('打开工具页：拖放区与质量控件可见', async ({ page }) => {
    await openTool(page)
    await expect(page.locator('[data-test="dropzone"]')).toBeVisible()
    await expect(page.locator('[data-test="empty-state"]')).toBeVisible()
    await expect(page.locator('[data-test="quality-slider"]')).toBeVisible()
    await expect(page.locator('[data-test="quality-input"]')).toBeVisible()
    await expect(page.locator('[data-test="download-all-btn"]')).toBeDisabled()
    await expect(page.locator('[data-test="clear-btn"]')).toBeDisabled()
  })

  test('PNG 转换成功：缩略图、大小/压缩率、尺寸', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png')])

    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    const row = page.locator('[data-test="row"]').first()
    // 输出名
    await expect(row.locator('.row-name')).toContainText('sample.webp')
    // 缩略图
    await expect(row.locator('[data-test="row-thumb"]')).toBeVisible()
    // 尺寸 64×64 → 64×64
    await expect(row.locator('[data-test="row-dims"]')).toHaveText(/64×64\s*→\s*64×64/)
    // 大小与压缩率（百分比格式）
    await expect(row.locator('[data-test="row-sizes"]')).toContainText('→')
    await expect(row.locator('[data-test="row-ratio"]')).toHaveText(/-?\d+(\.\d)?%/)
  })

  test('SVG 转换成功：按声明尺寸栅格化（24×24）', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.svg')])

    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    const row = page.locator('[data-test="row"]').first()
    await expect(row.locator('.row-name')).toContainText('sample.webp')
    await expect(row.locator('[data-test="row-dims"]')).toHaveText(/24×24\s*→\s*24×24/)
  })

  test('质量变更 → 显示「设置已变更」→ 重新转换后消失', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png')])
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    const banner = page.locator('[data-test="reconvert-banner"]')
    await expect(banner).toHaveCount(0)

    // 修改质量 → 出现提示
    await page.locator('[data-test="quality-input"]').fill('50')
    await expect(banner).toBeVisible()

    // 重新转换 → 成功且提示消失
    await page.click('[data-test="reconvert-btn"]')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    await expect(banner).toHaveCount(0)
  })

  test('整批下载 zip：文件名规则 + 解包含预期 .webp', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png'), fixture('sample.png')])
    await expect(rowByStatus(page, 'success')).toHaveCount(2, { timeout: 20000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-test="download-all-btn"]'),
    ])
    expect(download.suggestedFilename()).toMatch(/^webp-converted-\d{8}-\d{6}\.zip$/)
    const buf = readFileSync((await download.path()) as string)

    // 解包验证 zip 内容与魔数
    const zip = await JSZip.loadAsync(buf)
    expect(Object.keys(zip.files).sort()).toEqual(['sample.webp', 'sample_1.webp'])
    const entry = await zip.file('sample.webp')!.async('uint8array')
    expectWebpMagic(entry)
  })

  test('单文件下载：.webp 且为有效 WebP（RIFF/WEBP 魔数）', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png')])
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-test="row-download"]'),
    ])
    expect(download.suggestedFilename()).toBe('sample.webp')
    const buf = readFileSync((await download.path()) as string)
    expectWebpMagic(buf)
  })

  test('GIF 转换成功：显示「第一帧」标记', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.gif')])
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    const row = page.locator('[data-test="row"]').first()
    await expect(row.locator('.row-name')).toContainText('sample.webp')
    await expect(row.locator('[data-test="row-first-frame"]')).toBeVisible()
    await expect(row.locator('[data-test="row-dims"]')).toHaveText(/8×8\s*→\s*8×8/)
  })

  test('噪声图转 WebP 输出更大 → 压缩率为负值（-X%）', async ({ page }) => {
    await openTool(page)
    await page.locator('[data-test="quality-input"]').fill('100')
    await upload(page, [fixture('noise.gif')])

    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })
    const ratio = rowByStatus(page, 'success').locator('[data-test="row-ratio"]')
    await expect(ratio).toHaveText(/^-\d+(\.\d)?%/)
    await expect(ratio).toHaveClass(/negative/)
  })

  test('不支持格式 / 超尺寸文件 → 逐文件失败，不影响其他文件', async ({ page }) => {
    await openTool(page)
    await upload(page, [
      fixture('sample.png'),
      { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
      fixture('oversize.png'),
    ])

    // 1 成功 + 2 失败
    await expect(rowByStatus(page, 'success')).toHaveCount(1, { timeout: 20000 })
    await expect(rowByStatus(page, 'failed')).toHaveCount(2)
    // 失败行显示错误信息
    const errors = page.locator('[data-test="row-error"]')
    await expect(errors).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      const text = ((await errors.nth(i).textContent()) ?? '').trim()
      expect(text.length).toBeGreaterThan(0)
    }
    // 成功行不受影响
    await expect(rowByStatus(page, 'success').locator('[data-test="row-thumb"]')).toBeVisible()
  })

  test('同名文件 → 追加 _1 后缀', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png'), fixture('sample.png')])
    await expect(rowByStatus(page, 'success')).toHaveCount(2, { timeout: 20000 })
    const names = page.locator('[data-test="row"] .row-name')
    await expect(names.first()).toContainText('sample.webp')
    await expect(names.nth(1)).toContainText('sample_1.webp')
  })

  test('清空批次 → 回到空状态', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png')])
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 20000 })

    await page.click('[data-test="clear-btn"]')
    await expect(page.locator('[data-test="row"]')).toHaveCount(0)
    await expect(page.locator('[data-test="empty-state"]')).toBeVisible()
    await expect(page.locator('[data-test="clear-btn"]')).toBeDisabled()
  })

  test('移除单个文件 → 释放名称可被重新使用', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png'), fixture('sample.png')])
    await expect(rowByStatus(page, 'success')).toHaveCount(2, { timeout: 20000 })

    await page.locator('[data-test="row-remove"]').first().click()
    await expect(page.locator('[data-test="row"]')).toHaveCount(1)

    // 再上传同名文件 → 名称回到 sample.webp（_1 已释放）
    await upload(page, [fixture('sample.png')])
    await expect(rowByStatus(page, 'success')).toHaveCount(2, { timeout: 20000 })
    const names = page.locator('[data-test="row"] .row-name')
    const texts = (await names.allTextContents()).map((s) => s.trim())
    expect(texts).toEqual(expect.arrayContaining(['sample_1.webp', 'sample.webp']))
  })
})
