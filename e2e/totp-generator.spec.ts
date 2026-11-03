import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 票据：.scratch/hot-tools-v0.4.0/issues/06-totp-spec.md 验收 7（及 UI 可断言项）
// - 粘贴密钥 → 出码 → 复制 otpauth:// → 删除条目
// - otpauth:// 两种 issuer 写法 / 坏 URI 整条报错 / base32 容错
// - 轮换与 RFC 向量：用 page.clock 冻结时钟到 T=59（RFC 6238 向量时刻），
//   出码即为官方 6 位码 287082 —— 全 UI 栈端到端验证。
// - opt-in 持久化：记住 → 刷新后仍在；清除全部 → 空且警示消失；未 opt-in 刷新即失。

const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' // RFC 6238 SHA1 secret（ASCII '12345678901234567890'）

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/totp-generator')
  await page.waitForSelector('[data-test="totp-secret-input"]')
}

test.describe('TOTP 验证器 e2e', () => {
  test('粘贴 base32 密钥 → 出码；冻结时钟 T=59 命中 RFC 官方向量 287082（验收 1 全栈）', async ({ page }) => {
    await page.clock.install()
    await page.clock.setFixedTime(new Date('1970-01-01T00:00:59Z')) // unixSeconds = 59
    await openTool(page)

    // base32 容错粘贴：小写 + 空格
    await page.fill('[data-test="totp-secret-input"]', 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq')
    await page.click('[data-test="totp-add"]')

    await expect(page.locator('[data-test="totp-code"]')).toHaveText('287082')
    // 下一窗口码弱化小字（T=59 下一窗口 counter=2）
    await expect(page.locator('[data-test="totp-next-code"]')).toHaveText(/^\d{6}$/)
    // 剩余秒数与真实周期一致：T=59 → 剩 1 秒
    await expect(page.locator('[data-test="totp-remaining"]')).toHaveText(/^1(秒|s)$/)
    // 进度环 + 参数默认 SHA1/6 位/30 秒
    await expect(page.locator('[data-test="totp-ring"]')).toBeVisible()
    await expect(page.locator('[data-test="totp-algorithm"]')).toHaveValue('SHA1')
    await expect(page.locator('[data-test="totp-digits"]')).toHaveValue('6')
    await expect(page.locator('[data-test="totp-period"]')).toHaveValue('30')
  })

  test('轮换：跨过周期边界瞬间换码（clock 推进 30 秒）', async ({ page }) => {
    // 虚钟从 T=59 起步；pauseAt 跳到边界 T=60 并挂起；fastForward 再推 30 秒
    await page.clock.install({ time: new Date('1970-01-01T00:00:59Z') })
    // 同刻冻结虚钟：不同引擎下的实时流逝会造成竞态（背景时间不再推进）
    await page.clock.pauseAt(new Date('1970-01-01T00:00:59Z'))
    await openTool(page)

    await page.fill('[data-test="totp-secret-input"]', RFC_SECRET_BASE32)
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-code"]')).toHaveText('287082')

    // pauseAt 跳到边界 T=60（counter 1→2）：码立即更换、剩余秒数回到 30
    // runFor 在冻结钟上推进虚拟时间 1 秒（T=60，counter 1→2）
    await page.clock.runFor(1_000)
    const afterBoundary = page.locator('[data-test="totp-code"]')
    await expect(afterBoundary).not.toHaveText('287082')
    await expect(page.locator('[data-test="totp-remaining"]')).toHaveText(/^30(秒|s)$/)
    const codeAtCounter2 = (await afterBoundary.textContent()) ?? ''

    // 再推进 30 秒 → 下一窗口（T=90，counter 3），码再次更换
    await page.clock.runFor(30_000)
    await expect(page.locator('[data-test="totp-code"]')).not.toHaveText(codeAtCounter2)
    await expect(page.locator('[data-test="totp-remaining"]')).toHaveText(/^30(秒|s)$/)
  })

  test('otpauth:// URI 整段解析：label 前缀与 query issuer 两写法、全参数带入（验收 3）', async ({ page }) => {
    await openTool(page)

    // query issuer 写法 + SHA256/8 位/60 秒全参数
    await page.fill(
      '[data-test="totp-secret-input"]',
      `otpauth://totp/GitHub:me%40example.com?secret=${RFC_SECRET_BASE32}&issuer=GitHub&algorithm=SHA256&digits=8&period=60`,
    )
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(1)
    await expect(page.locator('[data-test="totp-entry-label"]')).toHaveText('GitHub · me@example.com')
    await expect(page.locator('[data-test="totp-algorithm"]')).toHaveValue('SHA256')
    await expect(page.locator('[data-test="totp-digits"]')).toHaveValue('8')
    await expect(page.locator('[data-test="totp-period"]')).toHaveValue('60')
    await expect(page.locator('[data-test="totp-code"]')).toHaveText(/^\d{8}$/)

    // label 前缀 issuer 写法（无 query issuer）
    await page.fill(
      '[data-test="totp-secret-input"]',
      `otpauth://totp/My%20Corp:alice?secret=${RFC_SECRET_BASE32}`,
    )
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(2)
    await expect(page.locator('[data-test="totp-entry-label"]').nth(1)).toHaveText('My Corp · alice')
    await expect(page.locator('[data-test="totp-algorithm"]').nth(1)).toHaveValue('SHA1')
  })

  test('坏 URI 与非法 base32 各自整条报错，不动已有条目（验收 2/3 错误面）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="totp-secret-input"]', RFC_SECRET_BASE32)
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(1)

    // 坏 URI：缺 secret
    await page.fill('[data-test="totp-secret-input"]', 'otpauth://totp/a:b')
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-add-error"]')).toBeVisible()
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(1)

    // 非 otpauth 协议
    await page.fill('[data-test="totp-secret-input"]', 'https://totp/a:b?secret=X')
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-add-error"]')).toBeVisible()

    // 非法 base32 字符（0/1 不在 RFC 4648 字母表）定位报错
    await page.fill('[data-test="totp-secret-input"]', 'GEZD1GNBV0')
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-add-error"]')).toContainText('1')

    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(1)
  })

  test('参数变更立即重算（时效码豁免）：位数切到 8 位码即时变化', async ({ page }) => {
    await page.clock.install({ time: new Date('1970-01-01T00:00:59Z') })
    // 同刻冻结虚钟：不同引擎下的实时流逝会造成竞态（背景时间不再推进）
    await page.clock.pauseAt(new Date('1970-01-01T00:00:59Z'))
    await openTool(page)

    await page.fill('[data-test="totp-secret-input"]', RFC_SECRET_BASE32)
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-code"]')).toHaveText('287082')

    // 6 → 8 位：立即重算且与 RFC 8 位口径一致（94287082 尾 6 位 = 287082）
    await page.locator('[data-test="totp-digits"]').selectOption('8')
    await expect(page.locator('[data-test="totp-code"]')).toHaveText('94287082')

    // 周期切 60 秒：counter 变化（floor(59/60)=0）→ 码值更换
    await page.locator('[data-test="totp-period"]').selectOption('60')
    await expect(page.locator('[data-test="totp-code"]')).not.toHaveText('94287082')
    // 周期 60：剩余 = 周期 − (T mod 周期) = 60 − 59 = 1 秒
    await expect(page.locator('[data-test="totp-remaining"]')).toHaveText(/^1(秒|s)$/)
  })

  test('记住条目 opt-in 闭环：记住 → 刷新仍在；未记住 → 刷新即失；清除全部 → 空且警示消失（验收 6）', async ({ page }) => {
    await openTool(page)

    // 未 opt-in：添加后刷新即失
    await page.fill('[data-test="totp-secret-input"]', RFC_SECRET_BASE32)
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(1)
    await page.reload()
    await page.waitForSelector('[data-test="totp-secret-input"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(0)

    // opt-in：记住 → 刷新后仍在，明文警示与一键清除常驻
    await page.fill('[data-test="totp-secret-input"]', RFC_SECRET_BASE32)
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(1)
    await expect(page.locator('[data-test="totp-remembered-banner"]')).toHaveCount(0)
    await page.check('[data-test="totp-remember"]')
    await expect(page.locator('[data-test="totp-remembered-banner"]')).toBeVisible()
    await expect(page.locator('[data-test="totp-remembered-banner"]')).toContainText(/明文|plaintext/i)

    await page.reload()
    await page.waitForSelector('[data-test="totp-secret-input"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(1)
    await expect(page.locator('[data-test="totp-remembered-banner"]')).toBeVisible()

    // 清除全部 → 空且警示消失
    await page.click('[data-test="totp-clear-remembered"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(0)
    await expect(page.locator('[data-test="totp-remembered-banner"]')).toHaveCount(0)
    await page.reload()
    await page.waitForSelector('[data-test="totp-secret-input"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(0)
  })

  test('粘贴密钥 → 出码 → 删除条目（验收 7 主路径，全项目）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="totp-secret-input"]', RFC_SECRET_BASE32)
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-code"]')).toHaveText(/^\d{6}$/)

    // 删除条目 → 列表回空态
    await page.click('[data-test="totp-remove"]')
    await expect(page.locator('[data-test="totp-entry"]')).toHaveCount(0)
    await expect(page.locator('[data-test="totp-empty"]')).toBeVisible()
    await expect(page.locator('[data-test="totp-notice"]')).toContainText(/零网络请求|zero network/i)
  })

  test('复制 otpauth:// URI → 「已复制」态（chromium，clipboard-write 权限）', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await openTool(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

    await page.fill('[data-test="totp-secret-input"]', RFC_SECRET_BASE32)
    await page.click('[data-test="totp-add"]')
    await expect(page.locator('[data-test="totp-code"]')).toHaveText(/^\d{6}$/)

    await page.click('[data-test="totp-copy-uri"]')
    await expect(page.locator('[data-test="totp-copy-uri"]')).toHaveText(/已复制|copied/i)
  })
})
