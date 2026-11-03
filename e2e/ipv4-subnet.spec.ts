import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 输入有 300ms 防抖，断言均交给 toBeVisible/toHaveText 的自动重试。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/ipv4-subnet')
  await page.waitForSelector('[data-test="subnet-input"]')
}

test.describe('IPv4 子网计算 e2e', () => {
  test('输入 → 实时九件套：10.0.0.0/8 全对', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="subnet-input"]', '10.0.0.0/8')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('10.0.0.0/8')
    await expect(page.locator('[data-test="out-broadcast"]')).toHaveText('10.255.255.255')
    await expect(page.locator('[data-test="out-mask"]')).toContainText('255.0.0.0')
    await expect(page.locator('[data-test="out-wildcard"]')).toHaveText('0.255.255.255')
    await expect(page.locator('[data-test="out-host-range"]')).toHaveText('10.0.0.1 – 10.255.255.254')
    await expect(page.locator('[data-test="out-host-count"]')).toContainText('16,777,214')
    await expect(page.locator('[data-test="out-total"]')).toHaveText('16,777,216')
    await expect(page.locator('[data-test="out-class"]')).toHaveText('A')
    await expect(page.locator('[data-test="out-label"]')).toContainText('私网')
    // 二进制行
    await expect(page.locator('[data-test="out-binary-mask"]')).toHaveText('11111111.00000000.00000000.00000000')
    await expect(page.locator('[data-test="out-binary-network"]')).toHaveText('00001010.00000000.00000000.00000000')
    // 主机地址无归一化标注
    await expect(page.locator('[data-test="host-annotation"]')).toHaveCount(0)
  })

  test('主机地址归一化 + 标注；点分掩码与裸 IP 形态', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="subnet-input"]', '192.168.1.77/26')
    await expect(page.locator('[data-test="host-annotation"]')).toBeVisible()
    await expect(page.locator('[data-test="out-network"]')).toHaveText('192.168.1.64/26')
    await expect(page.locator('[data-test="out-broadcast"]')).toHaveText('192.168.1.127')
    await expect(page.locator('[data-test="out-mask"]')).toContainText('255.255.255.192')
    await expect(page.locator('[data-test="out-wildcard"]')).toHaveText('0.0.0.63')

    // 点分掩码（空格分隔）与 /24 互通
    await page.fill('[data-test="subnet-input"]', '10.0.0.0 255.255.255.0')
    await expect(page.locator('[data-test="out-mask"]')).toContainText('255.255.255.0')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('10.0.0.0/24')

    // 裸 IP 自动补 /32：单主机，可用 1
    await page.fill('[data-test="subnet-input"]', '8.8.8.8')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('8.8.8.8/32')
    await expect(page.locator('[data-test="out-total"]')).toHaveText('1')
    await expect(page.locator('[data-test="out-host-range"]')).toHaveText('—')
  })

  test('特例：/31 RFC 3021 无广播可用 2', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="subnet-input"]', '10.0.0.0/31')
    await expect(page.locator('[data-test="out-broadcast"]')).toHaveText('—')
    await expect(page.locator('[data-test="out-host-range"]')).toHaveText('10.0.0.0 – 10.0.0.1')
    await expect(page.locator('[data-test="out-host-count"]')).toContainText('2')
    await expect(page.locator('[data-test="out-host-count"]')).toContainText('RFC 3021')
  })

  test('非法输入定位到段；错误时保留上一次结果', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="subnet-input"]', '10.0.0.0/8')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('10.0.0.0/8')

    // IP 段 >255：定位到第 4 段，九件套保留旧值
    await page.fill('[data-test="subnet-input"]', '10.0.0.300/8')
    await expect(page.locator('[data-test="subnet-error"]')).toContainText('第 4 段')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('10.0.0.0/8')

    // 前缀 >32 定位到前缀
    await page.fill('[data-test="subnet-input"]', '10.0.0.0/33')
    await expect(page.locator('[data-test="subnet-error"]')).toContainText('33')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('10.0.0.0/8')

    // 非连续掩码明确报错
    await page.fill('[data-test="subnet-input"]', '10.0.0.0 255.0.255.0')
    await expect(page.locator('[data-test="subnet-error"]')).toContainText('255.0.255.0')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('10.0.0.0/8')
  })

  test('等分切分：10.0.0.0/24 切 4 → 四个 /26；1024 上限提示；点击行复制 CIDR', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="subnet-input"]', '10.0.0.0/24')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('10.0.0.0/24')

    // 默认按子网数切 4 → /26 × 4，首尾相接
    await expect(page.locator('[data-test="split-cidr-0"]')).toHaveText('10.0.0.0/26')
    await expect(page.locator('[data-test="split-cidr-1"]')).toHaveText('10.0.0.64/26')
    await expect(page.locator('[data-test="split-cidr-2"]')).toHaveText('10.0.0.128/26')
    await expect(page.locator('[data-test="split-cidr-3"]')).toHaveText('10.0.0.192/26')
    await expect(page.locator('[data-test="split-row-0"]')).toHaveCount(1)
    await expect(page.locator('[data-test="split-row-3"]')).toHaveCount(1)
    // 第 2 行可用范围
    await expect(page.locator('[data-test="split-row-1"]')).toContainText('10.0.0.65 – 10.0.0.126')

    // 1024 行上限：/23 切 1024 → 超前缀，提示改用更大前缀
    await page.fill('[data-test="subnet-input"]', '10.0.0.0/23')
    await expect(page.locator('[data-test="out-network"]')).toHaveText('10.0.0.0/23')
    await page.selectOption('[data-test="split-count"]', '1024')
    await expect(page.locator('[data-test="split-cap-hint"]')).toBeVisible()

    // 点击行复制 CIDR（chromium：clipboard-write 可授权）
    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.fill('[data-test="subnet-input"]', '10.0.0.0/24')
    // splitCount 仍是上一步选的 1024（/24 切 1024 超上限不出行），先恢复 4
    await page.selectOption('[data-test="split-count"]', '4')
    await expect(page.locator('[data-test="split-cidr-1"]')).toHaveText('10.0.0.64/26')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.click('[data-test="split-row-1"]')
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe('10.0.0.64/26')
  })
})
