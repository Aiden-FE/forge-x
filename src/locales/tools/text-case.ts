import type { ToolLocaleFragment } from '@/locales/types'

export default {
  'zh-CN': {
    tools: {
      'text-case': '文本大小写转换',
      'text-caseDesc': '七种大小写样式互转，CJK 透传',
    },
    textCase: {
      inputLabel: '输入',
      inputPlaceholder: '粘贴多行文本或标识符…',
      styleLabel: '目标样式',
      outputLabel: '输出',
      outputPlaceholder: '转换结果实时显示在这里',
      copy: '复制全部',
      copied: '已复制',
      clear: '清空',
      truncated: '输入超过 1 MiB，已截断超出部分',
      copyError: '复制失败，请手动复制',
    },
  },
  en: {
    tools: {
      'text-case': 'Text Case Converter',
      'text-caseDesc': 'Convert between seven case styles, CJK passthrough',
    },
    textCase: {
      inputLabel: 'Input',
      inputPlaceholder: 'Paste multi-line text or identifiers…',
      styleLabel: 'Target style',
      outputLabel: 'Output',
      outputPlaceholder: 'Converted result appears here live',
      copy: 'Copy all',
      copied: 'Copied',
      clear: 'Clear',
      truncated: 'Input exceeds 1 MiB; overflow truncated',
      copyError: 'Copy failed; please copy manually',
    },
  },
} satisfies ToolLocaleFragment
