import type { ToolLocaleFragment } from '@/locales/types'

// JSON formatter extension fragment (E3: JSONPath query layer).
// Only adds new `jsonFormatter.path.*` sub-keys; existing jsonFormatter
// strings stay in the shared locale files and are deep-merged untouched
// (see src/composables/useI18n.ts).
export default {
  'zh-CN': {
    jsonFormatter: {
      path: {
        label: 'JSONPath 查询',
        placeholder: '输入 JSONPath，如 $.store.book[*].author',
        run: '查询',
        emptyInput: '请先输入 JSON 文档',
        matchCount: '{{count}} 个匹配',
        copyNode: '复制',
        copyAll: '复制全部',
        empty: '无匹配结果',
        errors: {
          invalidPath: '路径语法错误',
          queryError: '查询执行错误',
        },
      },
    },
  },
  en: {
    jsonFormatter: {
      path: {
        label: 'JSONPath Query',
        placeholder: 'Enter a JSONPath, e.g. $.store.book[*].author',
        run: 'Query',
        emptyInput: 'Enter a JSON document first',
        matchCount: '{{count}} matches',
        copyNode: 'Copy',
        copyAll: 'Copy all',
        empty: 'No matches',
        errors: {
          invalidPath: 'Invalid path syntax',
          queryError: 'Query execution error',
        },
      },
    },
  },
} satisfies ToolLocaleFragment
