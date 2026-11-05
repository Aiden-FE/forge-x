import type { ToolLocaleFragment } from '@/locales/types'

// 10 票扩展：JSON 结构化 diff 模式。共享 locale 文件中的既有键不动，
// 这里只深合并新增的 diffchecker.* 键。
export default {
  'zh-CN': {
    diffchecker: {
      modeLabel: '对比模式',
      modeText: '文本',
      modeJson: 'JSON 结构化',
      jsonHint: '两输入按 JSON 解析后树遍历对比；数组按索引对齐（不做移动/LCS 对齐），实时防抖。',
      jsonErrParse: 'JSON 解析错误',
      jsonLineColumn: '第 {{line}} 行第 {{column}} 列',
      jsonRoot: '（根）',
      opAdded: '新增',
      opRemoved: '删除',
      opChanged: '修改',
      jsonSummary: '{{added}} 新增 · {{removed}} 删除 · {{changed}} 修改',
    },
  },
  en: {
    diffchecker: {
      modeLabel: 'Compare mode',
      modeText: 'Text',
      modeJson: 'JSON structured',
      jsonHint: 'Both inputs are parsed as JSON and compared by tree walk; arrays align by index (no move/LCS detection), debounced live.',
      jsonErrParse: 'JSON parse error',
      jsonLineColumn: 'line {{line}}, column {{column}}',
      jsonRoot: '(root)',
      opAdded: 'added',
      opRemoved: 'removed',
      opChanged: 'changed',
      jsonSummary: '{{added}} added · {{removed}} removed · {{changed}} changed',
    },
  },
} satisfies ToolLocaleFragment
