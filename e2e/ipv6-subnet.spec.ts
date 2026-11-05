import { test, expect } from '@playwright/test'

// 票据 .scratch/hot-tools-v0.5.0/issues/06-ipv6-subnet-and-range-expander-spec.md（主路径 e2e）。
// IPv6 无 broadcast/usable 扣减：首/末地址即区间端点；总容量 BigInt 千分位。
test.use({ locale: 'zh-CN' })

// 输入有 300ms 防抖，断言交给 toHaveText 自动重试。
async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/ipv6-subnet')
  await page.waitForSelector('[data-test="v6-input"]')
}

test.describe('IPv6 子网计算 e2e', () => {
  test('2001:db8::/64 件套：网络/容量/首末/scope=global/二进制行', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="v6-input"]', '2001:db8::/64')
    await expect(page.locator('[data-test="v6-out-network"]')).toHaveText('2001:db8::/64')
    await expect(page.locator('[data-test="v6-out-prefix"]')).toContainText('/64')
    // /64 SLAAC 注记（仅注记不特判）
    await expect(page.locator('[data-test="v6-out-prefix"]')).toContainText('SLAAC')
    // 总容量 2^64（BigInt 千分位，无精度丢失）
    await expect(page.locator('[data-test="v6-out-total"]')).toHaveText('18,446,744,073,709,551,616')
    // 首/末地址 = 区间端点（无扣减语义）
    await expect(page.locator('[data-test="v6-out-first"]')).toHaveText('2001:db8::')
    await expect(page.locator('[data-test="v6-out-last"]')).toHaveText('2001:db8::ffff:ffff:ffff:ffff')
    // scope 判定：2000::/3 全局单播
    await expect(page.locator('[data-test="v6-out-scope"]')).toHaveText('全局单播（2000::/3）')
    // 二进制行：RFC 5952 归一化前的 128 位身份（2001 与 0db8 两组前缀 + 96 位零）
    await expect(page.locator('[data-test="v6-out-binary"]')).toHaveText(
      '0010000000000001.0000110110111000.0000000000000000.0000000000000000.0000000000000000.0000000000000000.0000000000000000.0000000000000000',
    )
    // 网络地址输入无主机位归一化标注
    await expect(page.locator('[data-test="v6-host-annotation"]')).toHaveCount(0)
  })

  test('::1/128：环回 scope，单地址', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="v6-input"]', '::1/128')
    await expect(page.locator('[data-test="v6-out-network"]')).toHaveText('::1/128')
    await expect(page.locator('[data-test="v6-out-total"]')).toHaveText('1')
    await expect(page.locator('[data-test="v6-out-first"]')).toHaveText('::1')
    await expect(page.locator('[data-test="v6-out-last"]')).toHaveText('::1')
    await expect(page.locator('[data-test="v6-out-scope"]')).toHaveText('环回（::1）')
  })

  test('非法输入定位到段；错误时保留上一次结果', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="v6-input"]', '2001:db8::/64')
    await expect(page.locator('[data-test="v6-out-network"]')).toHaveText('2001:db8::/64')

    // 组含非十六进制字符：定位到第 2 组（书写顺序），件套保留旧值
    await page.fill('[data-test="v6-input"]', '2001:xyz::/64')
    await expect(page.locator('[data-test="v6-error"]')).toContainText('第 2 组')
    await expect(page.locator('[data-test="v6-error"]')).toContainText('xyz')
    await expect(page.locator('[data-test="v6-out-network"]')).toHaveText('2001:db8::/64')

    // 组超界（> ffff）：第 2 组超出 0000–ffff
    await page.fill('[data-test="v6-input"]', '2001:db8:1abcd::/64')
    await expect(page.locator('[data-test="v6-error"]')).toContainText('第 3 组')
    await expect(page.locator('[data-test="v6-error"]')).toContainText('超出 0000–ffff')
    await expect(page.locator('[data-test="v6-out-network"]')).toHaveText('2001:db8::/64')

    // 前缀超界（> 128）：报 129
    await page.fill('[data-test="v6-input"]', '2001:db8::/129')
    await expect(page.locator('[data-test="v6-error"]')).toContainText('129')
    await expect(page.locator('[data-test="v6-out-network"]')).toHaveText('2001:db8::/64')
  })

  test('等分切分：2001:db8::/64 切 4 → 四个 /66 首尾相接', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="v6-input"]', '2001:db8::/64')
    await expect(page.locator('[data-test="v6-out-network"]')).toHaveText('2001:db8::/64')

    // 默认按子网数切 4 → /66 × 4（步长 2^62 落在第 5 组：0/4000/8000/c000）
    await expect(page.locator('[data-test="v6-split-cidr-0"]')).toHaveText('2001:db8::/66')
    await expect(page.locator('[data-test="v6-split-cidr-1"]')).toHaveText('2001:db8:0:0:4000::/66')
    await expect(page.locator('[data-test="v6-split-cidr-2"]')).toHaveText('2001:db8:0:0:8000::/66')
    await expect(page.locator('[data-test="v6-split-cidr-3"]')).toHaveText('2001:db8:0:0:c000::/66')
    // 第 1 行区间端点与容量（2^62）
    await expect(page.locator('[data-test="v6-split-row-1"]')).toContainText(
      '2001:db8:0:0:4000:: – 2001:db8::7fff:ffff:ffff:ffff',
    )
    await expect(page.locator('[data-test="v6-split-row-0"]')).toContainText('4,611,686,018,427,387,904')
  })
})
