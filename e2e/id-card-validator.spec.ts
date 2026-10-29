import { test, expect } from '@playwright/test'

// 身份证号校验 e2e（票据 10 验收 #9：打开 /tool/id-card-validator，粘贴合法号 → 解析区出现）。
//
// 测试号（公开测试语义构造，非真实号码）：地区段 110105 + 出生日期 19900315 + 顺序码 001 + 校验码。
//
// 校验码 MOD 11-2（ISO 7064）手算推演（权重 7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2）：
//   主体 17 位 = 1 1 0 1 0 5 1 9 9 0 0 3 1 5 0 0 1
//   加权和 = 1×7 + 1×9 + 0×10 + 1×5 + 0×8 + 5×4 + 1×2 + 9×1 + 9×6 + 0×3
//          + 0×7 + 3×9 + 1×10 + 5×5 + 0×8 + 0×4 + 1×2
//          = 7+9+0+5+0+20+2+9+54+0+0+27+10+25+0+0+2 = 170
//   170 mod 11 = 5（165 = 11×15）→ 余数映射表 ['1','0','X','9','8','7',...][5] = '7'
//   → 合法号 110105199003150017（末位校验码 7）
//
// 解析期望（validator.ts 口径）：
// - 出生日期 1990-03-15；顺序码 001 末位 1 → 奇数 → 男；
// - 年龄按校验时刻整岁（测试内按当日动态计算期望值，避免跨生日漂移）；
// - 末位改 8 → 「校验码不符：期望 7，实际 8」（票据验收 #2）。
test.use({ locale: 'zh-CN' })

const VALID_ID = '110105199003150017'
const BAD_CHECK_ID = '110105199003150018' // 末位 7 → 8，其余段不变

/** 按当日手算 1990-03-15 出生者的整岁（与 calcAge 同口径：生日未到减一）。 */
function expectedAgeNow(): number {
  const now = new Date()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const beforeBirthday = m < 3 || (m === 3 && d < 15)
  return now.getFullYear() - 1990 - (beforeBirthday ? 1 : 0)
}

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/id-card-validator')
  await page.waitForSelector('[data-test="idcard-input"]')
}

test.describe('ID Card Validator e2e', () => {
  test('合法 18 位号：合法徽章 + 出生日期/性别/年龄/校验码解析（票据验收 #1/#9）', async ({
    page,
  }) => {
    await openTool(page)

    // 隐私声明在输入前即可见（票据验收 #8）
    await expect(page.locator('[data-test="privacy-notice"]')).toBeVisible()
    await expect(page.locator('[data-test="privacy-notice"]')).toContainText('不存储、不上传')

    await page.fill('[data-test="idcard-input"]', VALID_ID)
    const parse = page.locator('[data-test="parse-panel"]')
    await expect(parse).toBeVisible() // 校验防抖 250ms，断言自动重试

    await expect(page.locator('[data-test="valid-badge"]')).toContainText('合法')
    // 号码种类标注国标编号（GB 11643 双语保留原形）
    await expect(parse).toContainText('GB 11643-1999')
    await expect(page.locator('[data-test="parse-birth"]')).toHaveText('1990-03-15')
    await expect(page.locator('[data-test="parse-gender"]')).toHaveText('男')
    await expect(page.locator('[data-test="parse-age"]')).toHaveText(`${expectedAgeNow()} 岁`)
    await expect(page.locator('[data-test="parse-check"]')).toHaveText('7 · 通过')
  })

  test('校验码错误号：错误清单出现并定位「校验码」段（票据验收 #2）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="idcard-input"]', BAD_CHECK_ID)
    await expect(page.locator('[data-test="invalid-badge"]')).toContainText('非法')
    const items = page.locator('[data-test="error-item"]')
    // 其余段均合法 → 仅一条错误，定位校验码段并给出期望/实际值
    await expect(items).toHaveCount(1)
    await expect(items.first()).toHaveText('校验码不符：期望 7，实际 8')
    // 校验码不符不影响其余段解析，但 UI 走错误清单分支（valid=false）
    await expect(page.locator('[data-test="parse-panel"]')).toHaveCount(0)
    await expect(page.locator('[data-test="privacy-notice"]')).toBeVisible()
  })

  test('批量多行逐行 ✓/✗ 输出（票据验收 #7）', async ({ page }) => {
    await openTool(page)

    // 三行混合：合法 / 校验码不符 / 长度非法（3 位）
    await page.fill('[data-test="idcard-input"]', `${VALID_ID}\n${BAD_CHECK_ID}\n123`)
    const rows = page.locator('[data-test="batch-row"]')
    await expect(rows).toHaveCount(3)

    await expect(rows.nth(0)).toHaveClass(/ok/)
    await expect(rows.nth(0)).toContainText('✓')
    await expect(rows.nth(0)).toContainText('1990-03-15')

    await expect(rows.nth(1)).toHaveClass(/bad/)
    await expect(rows.nth(1)).toContainText('校验码不符')

    await expect(rows.nth(2)).toHaveClass(/bad/)
    await expect(rows.nth(2)).toContainText('长度非法：3 位')
  })

  test('清空后回到空状态', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="idcard-input"]', VALID_ID)
    await expect(page.locator('[data-test="parse-panel"]')).toBeVisible()

    await page.click('[data-test="clear"]')
    await expect(page.locator('[data-test="idcard-input"]')).toHaveValue('')
    await expect(page.locator('[data-test="parse-panel"]')).toHaveCount(0)
    await expect(page.locator('[data-test="empty"]')).toBeVisible()
  })
})
