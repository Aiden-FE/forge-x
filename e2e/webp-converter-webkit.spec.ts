import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { expectWebpMagic, fixture, openTool, rowByStatus, upload } from './webp-helpers'

/**
 * WebKit 项目专属：验证 wasm 编码链路在 WebKit 下端到端可用
 * （非 SIMD wasm 回退链：显式 wasmBinary 加载 + 编码成功）。
 */
test.describe('WebP 转换器 e2e（WebKit 回退链）', () => {
  test.skip(({ browserName }) => browserName !== 'webkit', '该用例仅在 WebKit 项目运行')

  test('WebKit：PNG → WebP 转换成功且输出为有效 WebP', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png')])

    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 30000 })
    const row = page.locator('[data-test="row"]').first()
    await expect(row.locator('.row-name')).toContainText('sample.webp')

    // 下载并校验 RIFF/WEBP 魔数
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-test="row-download"]'),
    ])
    expect(download.suggestedFilename()).toBe('sample.webp')
    const buf = readFileSync((await download.path()) as string)
    expectWebpMagic(buf)
  })

  test('WebKit：质量变更后重新转换成功', async ({ page }) => {
    await openTool(page)
    await upload(page, [fixture('sample.png')])
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 30000 })

    await page.locator('[data-test="quality-input"]').fill('30')
    await expect(page.locator('[data-test="reconvert-banner"]')).toBeVisible()
    await page.click('[data-test="reconvert-btn"]')
    await expect(rowByStatus(page, 'success')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('[data-test="reconvert-banner"]')).toHaveCount(0)
  })
})
