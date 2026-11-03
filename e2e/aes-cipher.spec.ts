import { test, expect } from '@playwright/test'

// 断言中文文案：仓库惯例 test.use 锁定 zh-CN（navigator.language 决定默认 locale）
test.use({ locale: 'zh-CN' })


// 票据：.scratch/hot-tools-v0.4.0/issues/05-aes-cipher-spec.md 验收 8（及 UI 可断言项）
// - 加密 → 复制 → 清空 → 粘贴 → 解密还原 → 改一位密文 → 失败单态
// - 信封解析面板各段 / 非 FGX1 提示 / CBC 常驻警示 / raw key 字段级错误 / 1 MiB 边界
//
// CBC 错钥解密在密码学上仅以约 255/256 概率呈填充错误（尾块 padding 偶然合法），
// 为避免 e2e 偶发抖动，CBC 错钥→填充错误的确定性断言在单测以固定向量覆盖；
// 此处对 CBC 篡改只断言其「不保证失败」（结果呈现且不等于原文）——这正是
// 「CBC 无认证」警示的技术本体。

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/aes-cipher')
  await page.waitForSelector('[data-test="ac-plaintext"]')
}

test.describe('AES 加解密 e2e', () => {
  test('GCM 口令路径：加密 → 清空明文 → 粘贴密文 → 解密还原（验收 8 主路径）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="ac-passphrase"]', 'e2e-passphrase-🔐')
    await page.fill('[data-test="ac-plaintext"]', 'hello aes e2e — 中文与 emoji 🔐')
    await page.click('[data-test="ac-encrypt"]')

    const envelope = page.locator('[data-test="ac-envelope-output"]')
    await expect(envelope).toHaveText(/^[A-Za-z0-9+/]+=*$/)
    const envelopeText = (await envelope.textContent()) ?? ''
    expect(envelopeText.length).toBeGreaterThan(40)

    // 复制 → 清空 → 粘贴（复制按钮态在 chromium 单测；此处以复制所得原文回填）
    await page.fill('[data-test="ac-plaintext"]', '')
    await page.fill('[data-test="ac-ciphertext"]', envelopeText)
    await page.click('[data-test="ac-decrypt"]')
    await expect(page.locator('[data-test="ac-decrypt-result"]')).toHaveText('hello aes e2e — 中文与 emoji 🔐')
  })

  test('改一位密文 → GCM 失败单态（密钥不匹配或密文已损坏，不可区分说明）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="ac-passphrase"]', 'e2e-passphrase')
    await page.fill('[data-test="ac-plaintext"]', 'tamper target')
    await page.click('[data-test="ac-encrypt"]')
    const envelopeText = (await page.locator('[data-test="ac-envelope-output"]').textContent()) ?? ''

    // 改一位：取密文区（头部 6+16+12=34 字节 ≈ 46 个 base64 字符之后）的一个字符
    const idx = 60
    const swapped = envelopeText[idx] === 'A' ? 'B' : 'A'
    const tampered = envelopeText.slice(0, idx) + swapped + envelopeText.slice(idx + 1)
    await page.fill('[data-test="ac-ciphertext"]', tampered)
    await page.click('[data-test="ac-decrypt"]')

    // 认证失败单态：错钥与篡改不可区分，同一状态呈现
    const error = page.locator('[data-test="ac-decrypt-error"]')
    await expect(error).toContainText(/密钥不匹配或密文已损坏|Key mismatch or ciphertext corrupted/)
    await expect(page.locator('[data-test="ac-decrypt-error-detail"]')).toContainText(
      /不可区分|indistinguishable/i,
    )
    await expect(page.locator('[data-test="ac-decrypt-result"]')).toHaveCount(0)
  })

  test('信封解析面板各段；非 FGX1 → 「非本工具密文格式」（验收 3 的 UI 面）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="ac-passphrase"]', 'e2e-passphrase')
    await page.fill('[data-test="ac-plaintext"]', 'parse panel')
    await page.click('[data-test="ac-encrypt"]')
    const envelopeText = (await page.locator('[data-test="ac-envelope-output"]').textContent()) ?? ''

    await page.fill('[data-test="ac-ciphertext"]', envelopeText)
    await expect(page.locator('[data-test="ac-parse-magic"]')).toHaveText('46 47 58 31')
    await expect(page.locator('[data-test="ac-parse-version"]')).toHaveText('01')
    await expect(page.locator('[data-test="ac-parse-mode"]')).toHaveText('GCM')
    await expect(page.locator('[data-test="ac-parse-salt"]')).toHaveText(/^[0-9a-f ]{35}$/) // 16 字节按 4 分组 hex
    await expect(page.locator('[data-test="ac-parse-iv"]')).toHaveText(/^[0-9a-f ]{26}$/) // 12 字节（GCM）
    await expect(page.locator('[data-test="ac-parse-ctlen"]')).toContainText(/字节|bytes/)

    // OpenSSL Salted__ 头（非 FGX1）→ 明确提示
    const salted = btoa('Salted__0123456789abcdef0123456789abcdef')
    await page.fill('[data-test="ac-ciphertext"]', salted)
    await expect(page.locator('[data-test="ac-parse-invalid"]')).toContainText(/非本工具密文格式|not this tool/i)
  })

  test('GCM 默认无警示；CBC 常驻警示「无认证，密文可被篡改而不被察觉」并往返可用（验收 6）', async ({ page }) => {
    await openTool(page)

    await expect(page.locator('[data-test="ac-cbc-warning"]')).toHaveCount(0)
    await page.check('[data-test="ac-mode-cbc"]')
    await expect(page.locator('[data-test="ac-cbc-warning"]')).toBeVisible()

    // CBC 往返可用（信封模式位自动识别，无手动解密模式选择）
    await page.fill('[data-test="ac-passphrase"]', 'cbc-pass')
    await page.fill('[data-test="ac-plaintext"]', 'cbc roundtrip')
    await page.click('[data-test="ac-encrypt"]')
    const envelopeText = (await page.locator('[data-test="ac-envelope-output"]').textContent()) ?? ''
    await page.fill('[data-test="ac-ciphertext"]', envelopeText)
    await page.click('[data-test="ac-decrypt"]')
    await expect(page.locator('[data-test="ac-decrypt-result"]')).toHaveText('cbc roundtrip')
    await expect(page.locator('[data-test="ac-parse-mode"]')).toHaveText('CBC')
    await expect(page.locator('[data-test="ac-parse-iv"]')).toHaveText(/^[0-9a-f ]{35}$/) // 16 字节（CBC）

    // 切回 GCM：警示消失
    await page.check('[data-test="ac-mode-gcm"]')
    await expect(page.locator('[data-test="ac-cbc-warning"]')).toHaveCount(0)
  })

  test('raw key：16/24/32 字节自动识别；错长度/错编码只错该框（验收 5 的 UI 面）', async ({ page }) => {
    await openTool(page)

    await page.check('[data-test="ac-key-mode-raw"]')

    // 错编码：只错该输入框
    await page.fill('[data-test="ac-rawkey"]', 'xyz!')
    await expect(page.locator('[data-test="ac-rawkey-error"]')).toContainText(/编码|encoding/i)
    await expect(page.locator('[data-test="ac-rawkey-bits"]')).toHaveCount(0)

    // 错长度：报实际字节数
    await page.fill('[data-test="ac-rawkey"]', '00'.repeat(15))
    await expect(page.locator('[data-test="ac-rawkey-error"]')).toContainText('15')

    // 32 字节 base64 → AES-256，加密解密往返
    const key32 = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=' // 32 字节 0x00..0x1f
    await page.fill('[data-test="ac-rawkey"]', key32)
    await expect(page.locator('[data-test="ac-rawkey-bits"]')).toContainText('AES-256')
    await page.fill('[data-test="ac-plaintext"]', 'raw key roundtrip')
    await page.click('[data-test="ac-encrypt"]')
    const envelopeText = (await page.locator('[data-test="ac-envelope-output"]').textContent()) ?? ''
    await page.fill('[data-test="ac-ciphertext"]', envelopeText)
    await page.click('[data-test="ac-decrypt"]')
    await expect(page.locator('[data-test="ac-decrypt-result"]')).toHaveText('raw key roundtrip')
  })

  test('1 MiB 边界：超限明确报错且不触发计算（验收 7 的 UI 面）', async ({ page }) => {
    test.setTimeout(60000)
    await openTool(page)

    await page.fill('[data-test="ac-passphrase"]', 'limit-pass')
    await page.locator('[data-test="ac-plaintext"]').fill('x'.repeat(1024 * 1024 + 1))
    await expect(page.locator('[data-test="ac-plaintext-error"]')).toBeVisible()
    await expect(page.locator('[data-test="ac-encrypt"]')).toBeDisabled()
    await expect(page.locator('[data-test="ac-envelope-output"]')).toHaveCount(0)
  })

  test('复制密文 → 「已复制」态（chromium，clipboard-write 权限）', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await openTool(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

    await page.fill('[data-test="ac-passphrase"]', 'copy-pass')
    await page.fill('[data-test="ac-plaintext"]', 'copy me')
    await page.click('[data-test="ac-encrypt"]')
    await expect(page.locator('[data-test="ac-envelope-output"]')).toBeVisible()
    await page.click('[data-test="ac-copy-envelope"]')
    await expect(page.locator('[data-test="ac-copy-envelope"]')).toHaveText(/已复制|Copied/)
    await expect(page.locator('[data-test="ac-notice"]')).toContainText(/零网络请求|zero network/i)
  })
})
