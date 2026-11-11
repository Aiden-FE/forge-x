import { test, expect, type Page } from '@playwright/test'

test.use({ locale: 'zh-CN' })

const USAGE_KEY = 'forgex-tool-usage'

async function cardIds(page: Page): Promise<string[]> {
  const cards = page.locator('[data-tool-id]')
  await cards.first().waitFor({ state: 'attached' })
  return cards.evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-tool-id') ?? '')
  )
}

async function usageCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), USAGE_KEY)
}

test.describe('收藏与本机使用次数排序', () => {
  test('卡片星标 → 收藏视图 → 刷新保持 → 取消收藏清空', async ({ page }) => {
    await page.goto('/')
    const star = page.locator('[data-test="tool-star-base64-codec"]')
    await star.click()
    await expect(star).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/#\/$/)

    await page.locator('[data-test="nav-favorites"]').click()
    await expect(page.locator('[data-tool-id="base64-codec"]')).toHaveCount(1)
    await expect(page.locator('[data-tool-id="aes-cipher"]')).toHaveCount(0)

    await page.reload()
    await page.locator('[data-test="nav-favorites"]').click()
    await expect(page.locator('[data-tool-id="base64-codec"]')).toHaveCount(1)
    await expect(page.locator('[data-test="tool-star-base64-codec"]')).toHaveAttribute('aria-pressed', 'true')

    await page.locator('[data-test="tool-star-base64-codec"]').click()
    await expect(page.locator('[data-tool-id="base64-codec"]')).toHaveCount(0)
    await expect(page.locator('[data-test="favorites-browse-all"]')).toBeVisible()
    await page.locator('[data-test="favorites-browse-all"]').click()
    await expect(page.locator('[data-test="nav-all"]')).toHaveClass(/active/)
    await expect(page.locator('[data-tool-id="base64-codec"]')).toHaveCount(1)
    await expect(page.locator('[data-test="tool-star-base64-codec"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('实际使用后全部置顶，仅打开不计，刷新保持', async ({ page }) => {
    await page.goto('/')
    const initial = await cardIds(page)
    expect(initial[0]).not.toBe('base64-codec')

    await page.goto('/#/tool/base64-codec')
    await page.locator('[data-test="b64-input"]').fill('hello')
    await page.locator('[data-test="b64-encode"]').click()
    expect(await usageCounts(page)).toMatchObject({ 'base64-codec': 1 })

    await page.goto('/')
    let order = await cardIds(page)
    expect(order[0]).toBe('base64-codec')

    // Merely opening a tool must not count; aes-cipher is statically first, so
    // a count would displace base64-codec from the first position.
    await page.goto('/#/tool/aes-cipher')
    await page.goto('/')
    order = await cardIds(page)
    expect(order[0]).toBe('base64-codec')

    await page.reload()
    order = await cardIds(page)
    expect(order[0]).toBe('base64-codec')

    await page.goto('/#/tool/base64-codec')
    await page.locator('[data-test="b64-input"]').fill('again')
    await page.goto('/')
    expect(await usageCounts(page)).toMatchObject({ 'base64-codec': 2 })
  })

  test('分类视图保持静态顺序', async ({ page }) => {
    await page.goto('/#/tool/base64-codec')
    await page.locator('[data-test="b64-input"]').fill('hello')
    await page.goto('/')
    await page.locator('[data-test="nav-encode"]').click()

    const ids = await cardIds(page)
    expect(ids.indexOf('base-converter')).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf('base64-codec')).toBeGreaterThan(ids.indexOf('base-converter'))
  })

  test('收藏视图按使用次数排序', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-test="tool-star-aes-cipher"]').click()
    await page.locator('[data-test="tool-star-base64-codec"]').click()

    await page.goto('/#/tool/base64-codec')
    await page.locator('[data-test="b64-input"]').fill('hello')
    await page.goto('/')
    await page.locator('[data-test="nav-favorites"]').click()

    expect(await cardIds(page)).toEqual(['base64-codec', 'aes-cipher'])
  })

  test('工具页星标与卡片共享状态，且不产生使用计数', async ({ page }) => {
    await page.goto('/#/tool/base64-codec')
    const toolStar = page.locator('[data-test="tool-star"]')
    await toolStar.click()
    await expect(toolStar).toHaveAttribute('aria-pressed', 'true')

    await page.goto('/')
    await expect(page.locator('[data-test="tool-star-base64-codec"]')).toHaveAttribute('aria-pressed', 'true')
    expect(await usageCounts(page)).toEqual({})
  })

  test('头部搜索回车按当前可见顺序打开第一个工具', async ({ page }) => {
    await page.goto('/#/tool/base64-codec')
    await page.locator('[data-test="b64-input"]').fill('hello')
    await page.goto('/')
    await page.locator('.search-input').fill('base')
    await page.locator('.search-input').press('Enter')
    await expect(page).toHaveURL(/#\/tool\/base64-codec$/)
  })
})
