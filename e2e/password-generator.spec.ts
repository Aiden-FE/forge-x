import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/password-generator')
  await page.waitForSelector('[data-test="pw-row"]')
}

test.describe('密码生成器 e2e', () => {
  test('进入生成 1 个 20 位四类齐全；调策略不实时，重生成后按新策略且异于旧值', async ({ page }) => {
    await openTool(page)
    const rows = page.locator('[data-test="pw-row"] code')
    await expect(rows).toHaveCount(1)
    const first = rows.first()
    const initial = (await first.textContent()) ?? ''

    // 默认长度 20；「每已开类至少一字符」按构造保证（非概率碰巧）
    expect(initial).toHaveLength(20)
    expect(initial).toMatch(/[a-z]/)
    expect(initial).toMatch(/[A-Z]/)
    expect(initial).toMatch(/[0-9]/)
    expect(initial).toMatch(/[^A-Za-z0-9]/)

    // 手写真值：默认池 94（26+26+10+32）、长度 20 → 熵 20×log₂94 ≈ 131.1 bit ≥ 80 → 强
    await expect(page.locator('[data-test="pw-entropy"]')).toHaveText(/131\.1/)
    await expect(page.locator('[data-test="pw-tier"]')).toHaveClass(/tier-strong/)

    // 生成类不实时：数量预设 5 + 关闭符号类 → 已展示密码逐字符不变，仅出现过期提示
    await page.click('[data-test="pw-count-5"]')
    await page.uncheck('[data-test="pw-class-symbols"]')
    await expect(first).toHaveText(initial)
    await expect(page.locator('[data-test="pw-stale"]')).toBeVisible()

    // 重新生成 → 5 行 × 20 位：仅小写+大写+数字（无符号、每类齐全），且与旧密码不同
    await page.click('[data-test="pw-regenerate"]')
    await expect(rows).toHaveCount(5)
    const texts = await rows.allTextContents()
    for (const t of texts) {
      expect(t).toHaveLength(20)
      expect(t).toMatch(/^[A-Za-z0-9]+$/)
      expect(t).toMatch(/[a-z]/)
      expect(t).toMatch(/[A-Z]/)
      expect(t).toMatch(/[0-9]/)
      expect(t).not.toBe(initial)
    }
  })

  test('排除易混淆字符：开关不替换已展示密码；重生成后不含 0OoIl1；复制出现已复制态', async ({ page }) => {
    await openTool(page)
    const first = page.locator('[data-test="pw-row"] code').first()
    const initial = (await first.textContent()) ?? ''

    // 开启排除易混淆字符 → 旧密码不变、出现过期提示（生成类不实时）
    await page.check('[data-test="pw-confusable"]')
    await expect(first).toHaveText(initial)
    await expect(page.locator('[data-test="pw-stale"]')).toBeVisible()

    // 重新生成 → 新密码不含 0 O o I l 1，且与旧值不同
    await page.click('[data-test="pw-regenerate"]')
    const updated = (await first.textContent()) ?? ''
    expect(updated).not.toBe(initial)
    expect(updated).toMatch(/^[^0OoIl1]{20}$/)

    // 复制单行 → 按钮短暂进入「已复制/Copied」态（不读剪贴板内容）。
    // clipboard-write 权限 WebKit 不支持（Unknown permission），仅 chromium 验证此 UI 态。
    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await page.click('[data-test="pw-copy-0"]')
    await expect(page.locator('[data-test="pw-copy-0"]')).toHaveText(/已复制|Copied/)
  })
})

// ---------------------------------------------------------------------------
// passphrase / PIN / Hex（票据 14 扩展 #2）
//
// 触达加载断言用 page.route 网络监听：passphrase 词表数据模块在 dev 下按
// `**/wordlist*` 请求加载——未选中 passphrase 模式前不得出现该请求。
// ---------------------------------------------------------------------------
test.describe('口令短语 / PIN / Hex e2e', () => {
  async function trackWordlist(page: import('@playwright/test').Page) {
    const hits: string[] = []
    await page.route('**/wordlist*', (route) => {
      hits.push(route.request().url())
      return route.continue()
    })
    return hits
  }

  test('触达加载：密码模式零词表请求；选中 passphrase 才加载（票据验收）', async ({ page }) => {
    const hits = await trackWordlist(page)
    await openTool(page)
    await expect(page.locator('[data-test="pw-row"]')).toHaveCount(1)
    // 密码模式（默认）生成若干次也不触发词表加载
    await page.click('[data-test="pw-regenerate"]')
    await expect(page.locator('[data-test="pw-row"]')).toHaveCount(1)
    expect(hits).toEqual([])

    await page.click('[data-test="pw-mode-passphrase"]')
    await expect(page.locator('[data-test="pp-wordlist-state"]')).toContainText(/词表就绪|Loading|加载中|ready/i, { timeout: 15000 })
    await expect(page.locator('[data-test="pp-wordlist-state"]')).toContainText('7776')
    expect(hits.length).toBeGreaterThan(0)
  })

  test('passphrase 默认 4 词 `-` 连接；理论熵 = log₂(7776⁴) ≈ 51.7 bit → 中（验收）', async ({ page }) => {
    await trackWordlist(page)
    await openTool(page)

    await page.click('[data-test="pw-mode-passphrase"]')
    await expect(page.locator('[data-test="pp-wordlist-state"]')).toContainText('7776', { timeout: 15000 })
    await page.click('[data-test="pw-regenerate"]')

    const rows = page.locator('[data-test="pw-row"] code')
    await expect(rows).toHaveCount(1)
    const line = (await rows.first().textContent()) ?? ''
    const words = line.split('-')
    expect(words).toHaveLength(4)
    for (const w of words) expect(w).toMatch(/^[a-z-]+$/)

    // 手写真值：4 × log₂7776 ≈ 51.7 → 40–80 区间 → 中
    await expect(page.locator('[data-test="pw-entropy"]')).toHaveText(/51\.7/)
    await expect(page.locator('[data-test="pw-tier"]')).toHaveClass(/tier-medium/)
    await expect(page.locator('[data-test="pw-entropy-note"]')).toContainText(/词表口径|wordlist/)
  })

  test('首字母大写档逐词生效；分隔符可切空格（验收）', async ({ page }) => {
    await trackWordlist(page)
    await openTool(page)

    await page.click('[data-test="pw-mode-passphrase"]')
    await expect(page.locator('[data-test="pp-wordlist-state"]')).toContainText('7776', { timeout: 15000 })

    await page.click('[data-test="pp-case-capitalize"]')
    await page.click('[data-test="pp-sep-space"]')
    await page.click('[data-test="pw-regenerate"]')

    const line = (await page.locator('[data-test="pw-row"] code').first().textContent()) ?? ''
    const words = line.split(' ')
    expect(words).toHaveLength(4)
    for (const w of words) {
      expect(w[0]).toMatch(/[A-Z]/)
      // 逐词大写：仅首字符大写，其余保持小写（连字符词 t-shirt → T-shirt）
      expect(w.slice(1)).toMatch(/^[a-z-]*$/)
    }
  })

  test('PIN：默认 6 位严格 ^[0-9]{6}$；切 4 位联动；熵 19.9 bit → 弱（验收）', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="pw-mode-pin"]')
    await page.click('[data-test="pw-regenerate"]')
    const rows = page.locator('[data-test="pw-row"] code')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toHaveText(/^[0-9]{6}$/)
    // 手写真值：6 × log₂10 ≈ 19.9 bit → 弱
    await expect(page.locator('[data-test="pw-entropy"]')).toHaveText(/19\.9/)
    await expect(page.locator('[data-test="pw-tier"]')).toHaveClass(/tier-weak/)

    await page.click('[data-test="pin-length-4"]')
    await page.click('[data-test="pw-regenerate"]')
    await expect(rows.first()).toHaveText(/^[0-9]{4}$/)
    await expect(page.locator('[data-test="pw-entropy"]')).toHaveText(/13\.3/)
  })

  test('Hex：默认 16 字符严格 ^[0-9a-f]{16}$；切 32 联动；熵 64 bit → 中（验收）', async ({ page }) => {
    await openTool(page)

    await page.click('[data-test="pw-mode-hex"]')
    await page.click('[data-test="pw-regenerate"]')
    const rows = page.locator('[data-test="pw-row"] code')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toHaveText(/^[0-9a-f]{16}$/)
    await expect(page.locator('[data-test="pw-entropy"]')).toHaveText(/64\.0/)
    await expect(page.locator('[data-test="pw-tier"]')).toHaveClass(/tier-medium/)

    await page.click('[data-test="hex-length-32"]')
    await page.click('[data-test="pw-regenerate"]')
    await expect(rows.first()).toHaveText(/^[0-9a-f]{32}$/)
    await expect(page.locator('[data-test="pw-entropy"]')).toHaveText(/128\.0/)
    await expect(page.locator('[data-test="pw-tier"]')).toHaveClass(/tier-strong/)
  })

  test('模式互斥：参数区按模式显隐（密码参数区离开密码模式即隐藏）', async ({ page }) => {
    await openTool(page)
    await expect(page.locator('[data-test="pw-classes"]')).toBeVisible()
    await expect(page.locator('[data-test="pw-length"]')).toBeVisible()

    await page.click('[data-test="pw-mode-pin"]')
    await expect(page.locator('[data-test="pw-classes"]')).toHaveCount(0)
    await expect(page.locator('[data-test="pw-length"]')).toHaveCount(0)
    await expect(page.locator('[data-test="pin-length-6"]')).toBeVisible()

    await page.click('[data-test="pw-mode-password"]')
    await expect(page.locator('[data-test="pw-classes"]')).toBeVisible()
    await expect(page.locator('[data-test="pin-length-6"]')).toHaveCount(0)
  })
})
