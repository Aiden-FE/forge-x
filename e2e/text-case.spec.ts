import { test, expect } from '@playwright/test'

// 文本大小写转换 e2e（票据 08 验收 #7：打开 /tool/text-case，粘贴多行，切样式验证输出）。
//
// 期望值按票据词边界语义手算：
// - `HTTPServer` → 缩写词组切分 [http, server]（HTTP|Server 在「大写+大写+小写」处切）；
// - `用户` 为 CJK 不透明词，恒透传；中西文切换处即词边界；
// - 七样式输出（票据验收 #1）。组件现状：CJK 不透明词也参与样式分隔符拼接
//   （TextCase.vue/casing.ts 注释「CJK 不透明词参与拼接」，票据仅给出 camel `api接口`
//   一例，snake/kebab 与拉丁-CJK 交界处的分隔符以组件现状为准）：
//   camel httpServer用户 / pascal HttpServer用户 / snake http_server_用户 /
//   CONSTANT HTTP_SERVER_用户 / kebab http-server-用户 /
//   Title Http Server 用户 / sentence Http server 用户。
//
// UI 默认语言跟随 Playwright context locale，这里固定 zh-CN 保证文案断言确定。
test.use({ locale: 'zh-CN' })
// 仅断言「已复制」UI 状态（不读剪贴板真实内容），需授予写权限避免文案走「复制失败」分支。
test.use({ permissions: ['clipboard-write'] })

async function openTool(page: import('@playwright/test').Page) {
  await page.goto('/#/tool/text-case')
  await page.waitForSelector('[data-test="text-case-input"]')
}

/** 切换目标样式（分段控件内的 radio，value 与组件 CASE_STYLES 一致）。 */
async function selectStyle(page: import('@playwright/test').Page, style: string) {
  await page.check(`[data-test="text-case-style"] input[value="${style}"]`)
}

test.describe('Text Case e2e', () => {
  test('HTTPServer 用户：七种样式输出正确，CJK 透传', async ({ page }) => {
    await openTool(page)
    const output = page.locator('[data-test="text-case-output"]')

    await page.fill('[data-test="text-case-input"]', 'HTTPServer 用户')
    // 默认样式 camel（组件 style ref 初始 'camel'）；输出防抖 250ms，toHaveValue 自动重试
    await expect(output).toHaveValue('httpServer用户')

    await selectStyle(page, 'snake')
    await expect(output).toHaveValue('http_server_用户')
    await selectStyle(page, 'kebab')
    await expect(output).toHaveValue('http-server-用户')
    await selectStyle(page, 'title')
    await expect(output).toHaveValue('Http Server 用户')
    await selectStyle(page, 'pascal')
    await expect(output).toHaveValue('HttpServer用户')
    await selectStyle(page, 'constant')
    await expect(output).toHaveValue('HTTP_SERVER_用户')
    await selectStyle(page, 'sentence')
    await expect(output).toHaveValue('Http server 用户')

    // CJK 不透明词在各样式下原样透传
    await selectStyle(page, 'kebab')
    await expect(output).toHaveValue(/用户$/)
  })

  test('多行逐行：虚词表、空行与行首尾空白保留（票据验收 #4/#5）', async ({ page }) => {
    await openTool(page)
    const output = page.locator('[data-test="text-case-output"]')

    // 三行：中间为空行（原样保留）；第三行行首尾空白原样保留、连续分隔符折叠；
    // Title 虚词 of 非行首/行尾 → 小写；abc123 数字并入前词、v2-beta 按分隔符切词
    await page.fill('[data-test="text-case-input"]', 'the art of war\n\n  abc123  v2-beta  ')

    // 默认 camel
    await expect(output).toHaveValue('theArtOfWar\n\n  abc123V2Beta  ')

    await selectStyle(page, 'title')
    await expect(output).toHaveValue('The Art of War\n\n  Abc123 V2 Beta  ')

    await selectStyle(page, 'snake')
    await expect(output).toHaveValue('the_art_of_war\n\n  abc123_v2_beta  ')
  })

  test('复制按钮出现「已复制」状态；清空同时清空输入与输出两侧', async ({ page }) => {
    await openTool(page)

    await page.fill('[data-test="text-case-input"]', 'HTTPServer')
    const output = page.locator('[data-test="text-case-output"]')
    await expect(output).toHaveValue('httpServer')

    // 仅断言「已复制」UI 状态，不读剪贴板内容
    await page.click('[data-test="text-case-copy"]')
    await expect(page.locator('[data-test="text-case-copy"]')).toContainText('已复制')

    await page.click('[data-test="text-case-clear"]')
    await expect(page.locator('[data-test="text-case-input"]')).toHaveValue('')
    await expect(output).toHaveValue('')
  })
})
