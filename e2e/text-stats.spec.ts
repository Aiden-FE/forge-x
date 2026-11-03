import { test, expect } from '@playwright/test'

// 文本统计 e2e（票据 09 验收 #9：打开 /tool/text-stats，输入样例文本，验证各指标行）。
//
// 全部期望值按 stats.ts 口径手算（码点 / 字素 / UTF-8 字节 / 统计词 / 阅读时长）：
//
// 样例 A `你好👨‍👩‍👧 world`：
// - 码点 13：你好(2) + 👨‍👩‍👧 为 5 个码点(👨 U+1F468、ZWJ U+200D、👩 U+1F469、ZWJ、👧 U+1F467)
//   + 空格(1) + world(5)；
// - 非空白 12（仅 1 个空格）；
// - 字素 9：你、好、👨‍👩‍👧（ZWJ 序列 1 个字素）、空格、w/o/r/l/d → 与码点数不等，字素行显示；
// - 字节 30：你好 2×3 + 👨👩👧 3×4 + ZWJ 2×3 = 24，空格 1，world 5；
// - 词 3：汉字逐字计词（你、好）+ 拉丁词 world；
// - 行 1、段落 1；
// - 阅读时长 1/200 + 2/300 ≈ 0.012 分钟 → 不足 1 分钟 →「< 1 分钟」（票据 09 §3）。
//
// 样例 B `abc\\n\\ndef\\nghi`：码点 12、空白 3（非空白 9）、字节 12、词 3、
// 行 4（按 \\n 切分）、段落 2（空行分块，def/ghi 同块）；字素 12 = 码点 → 字素行隐藏。
//
// 样例 C `'word '.repeat(400)`：400 个拉丁词 → 400/200 = 2 分钟 →「约 2 分钟」；
// 码点 2000、空白 400（每个 'word ' 一个空格，含末尾）→ 非空白 1600、字节 2000；
// 字素 2000 = 码点 → 字素行隐藏。
test.use({ locale: 'zh-CN' })

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/text-stats')
  await page.waitForSelector('[data-test="stats-input"]')
}

/** 单个指标卡的数值（.metric-value 文本）。 */
function metric(page: import('@playwright/test').Page, key: string) {
  return page.locator(`[data-test="stat-${key}"] .metric-value`)
}

test.describe('Text Stats e2e', () => {
  test('中英混排 + ZWJ emoji：码点/字素/字节/词/行/段落/阅读时长（票据验收 #1/#3）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="stats-input"]', '你好👨‍👩‍👧 world')
    // 统计防抖 250ms，断言自动重试
    await expect(metric(page, 'chars')).toHaveText('13')
    await expect(metric(page, 'chars-ns')).toHaveText('12')
    // 字素行显示：9 ≠ 13
    await expect(metric(page, 'graphemes')).toHaveText('9')
    await expect(metric(page, 'bytes')).toHaveText('30')
    await expect(metric(page, 'words')).toHaveText('3')
    await expect(metric(page, 'lines')).toHaveText('1')
    await expect(metric(page, 'paragraphs')).toHaveText('1')
    await expect(page.locator('[data-test="stat-reading"]')).toContainText('< 1 分钟')
  })

  test('多行与段落分块；字素数等于码点数时字素行隐藏（票据验收 #4/#5/#7）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="stats-input"]', 'abc\n\ndef\nghi')
    await expect(metric(page, 'chars')).toHaveText('12')
    await expect(metric(page, 'chars-ns')).toHaveText('9')
    await expect(metric(page, 'bytes')).toHaveText('12')
    await expect(metric(page, 'words')).toHaveText('3')
    await expect(metric(page, 'lines')).toHaveText('4')
    await expect(metric(page, 'paragraphs')).toHaveText('2')
    // 字素 12 = 码点 12 → 条件行隐藏（组件 v-if="stats.showGraphemes"）
    await expect(page.locator('[data-test="stat-graphemes"]')).toHaveCount(0)
    await expect(page.locator('[data-test="stat-reading"]')).toContainText('< 1 分钟')
  })

  test('阅读时长分钟值：400 拉丁词 → 约 2 分钟（票据 09 §3 速率 200 词/分钟）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="stats-input"]', 'word '.repeat(400))
    await expect(metric(page, 'chars')).toHaveText('2000')
    await expect(metric(page, 'chars-ns')).toHaveText('1600')
    await expect(metric(page, 'bytes')).toHaveText('2000')
    await expect(metric(page, 'words')).toHaveText('400')
    await expect(metric(page, 'lines')).toHaveText('1')
    await expect(metric(page, 'paragraphs')).toHaveText('1')
    await expect(page.locator('[data-test="stat-reading"]')).toContainText('约 2 分钟')
    await expect(page.locator('[data-test="stat-graphemes"]')).toHaveCount(0)
  })

  test('清空后指标归零、条件行隐藏、输入清空', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="stats-input"]', '你好👨‍👩‍👧 world')
    await expect(metric(page, 'words')).toHaveText('3')
    await expect(page.locator('[data-test="stat-reading"]')).toBeVisible()

    await page.click('[data-test="clear"]')
    await expect(page.locator('[data-test="stats-input"]')).toHaveValue('')
    await expect(metric(page, 'chars')).toHaveText('0')
    await expect(metric(page, 'chars-ns')).toHaveText('0')
    await expect(metric(page, 'bytes')).toHaveText('0')
    await expect(metric(page, 'words')).toHaveText('0')
    await expect(metric(page, 'lines')).toHaveText('0')
    await expect(metric(page, 'paragraphs')).toHaveText('0')
    // 空文本：阅读时长行与字素行隐藏
    await expect(page.locator('[data-test="stat-reading"]')).toHaveCount(0)
    await expect(page.locator('[data-test="stat-graphemes"]')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// 词频 Top-N（票据 14 扩展 #1）
//
// 分词口径（CONTEXT.md）：按词 = Segmenter 词级切分（真词频）；按字 = CJK 逐字。
// 运行时实测（Node 22 / Chromium 同族 ICU cjdict）：「人工智能」按词切为
// 人工 + 智能（2 词）；按字逐字计 4。票面「1 词 vs 3 词」与任何真实 Segmenter
// 都对不上（人工智能是 4 个汉字），按实测口径断言。
// ---------------------------------------------------------------------------
test.describe('词频 Top-N e2e', () => {
  test('按词档：「人工智能」= 人工 + 智能 2 词，占比各 50%', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="stats-input"]', '人工智能')
    await expect(page.locator('[data-test="freq-row"]')).toHaveCount(2)
    const rows = page.locator('[data-test="freq-row"]')
    await expect(rows.nth(0)).toContainText('人工')
    await expect(rows.nth(0)).toContainText('1')
    await expect(rows.nth(0)).toContainText('50.0%')
    await expect(rows.nth(1)).toContainText('智能')
    await expect(page.locator('[data-test="freq-total"]')).toContainText('2')
  })

  test('口径切换按字：汉字逐字计 4 词，占比各 25%（与按词档不同）', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="stats-input"]', '人工智能')
    await expect(page.locator('[data-test="freq-row"]')).toHaveCount(2)

    await page.click('[data-test="freq-mode-char"]')
    const rows = page.locator('[data-test="freq-row"]')
    await expect(rows).toHaveCount(4)
    await expect(rows.nth(0)).toContainText('人')
    await expect(rows.nth(1)).toContainText('工')
    await expect(rows.nth(2)).toContainText('智')
    await expect(rows.nth(3)).toContainText('能')
    // 占比 = 频次 / 该口径总词数：4 字各 25%，合计 100%
    for (let i = 0; i < 4; i++) await expect(rows.nth(i)).toContainText('25.0%')
    await expect(page.locator('[data-test="freq-total"]')).toContainText('4')
  })

  test('拉丁词小写归一：The / THE 并入 the；纯拉丁两档等价', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="stats-input"]', 'The cat THE dog the')
    const rows = page.locator('[data-test="freq-row"]')
    await expect(rows.nth(0)).toContainText('the')
    await expect(rows.nth(0)).toContainText('3')
    await expect(rows.nth(0)).toContainText('60.0%')

    // 两档等价：切到按字，拉丁结果不变
    await page.click('[data-test="freq-mode-char"]')
    await expect(rows.nth(0)).toContainText('the')
    await expect(rows.nth(0)).toContainText('3')
    await expect(rows.nth(1)).toContainText('cat')
    await expect(rows.nth(2)).toContainText('dog')
  })

  test('档位联动 10/20/50/100：截断不丢失总数依据（Top-N 外仍计入占比分母）', async ({ page }) => {
    await openTool(page)

    // 12 个不同单词：默认档 20 → 全部显示；切 10 → 只显示 10 行，总词数仍 12
    const text = 'a b c d e f g h i j k l'
    await page.fill('[data-test="stats-input"]', text)
    await expect(page.locator('[data-test="freq-row"]')).toHaveCount(12)
    await expect(page.locator('[data-test="freq-total"]')).toContainText('12')
    // 默认档位 20 高亮
    await expect(page.locator('[data-test="freq-tier-20"]')).toHaveClass(/active/)

    await page.click('[data-test="freq-tier-10"]')
    await expect(page.locator('[data-test="freq-row"]')).toHaveCount(10)
    // 截断后总词数依据不变（仍是该口径全部词数）
    await expect(page.locator('[data-test="freq-total"]')).toContainText('12')

    await page.click('[data-test="freq-tier-50"]')
    await expect(page.locator('[data-test="freq-row"]')).toHaveCount(12)
    await expect(page.locator('[data-test="freq-tier-50"]')).toHaveClass(/active/)
  })

  test('点击词复制（chromium；clipboard-write 仅 chromium 可授权）', async ({ page }) => {
    await openTool(page)
    await page.fill('[data-test="stats-input"]', 'hello world hello')
    const firstRow = page.locator('[data-test="freq-row"]').first()
    await expect(firstRow).toContainText('hello')

    test.skip(test.info().project.name !== 'chromium', 'clipboard-write 仅 chromium 可授权')
    await firstRow.click()
    await expect(firstRow).toHaveClass(/copied/)
  })
})
