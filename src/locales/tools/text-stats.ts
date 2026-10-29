import type { ToolLocaleFragment } from '@/locales/types'

export default {
  'zh-CN': {
    tools: {
      'text-stats': '文本统计',
      'text-statsDesc': '字符、字素、字节、词、行、段落与阅读时长统计',
    },
    textStats: {
      inputLabel: '输入文本',
      inputPlaceholder: '粘贴或键入文本，实时统计…',
      limitWarning: '输入超过 1 MiB 上限，已在字符边界截断',
      chars: '字符（含空白）',
      charsNoSpace: '字符（不含空白）',
      graphemes: '字素',
      bytes: '字节（UTF-8）',
      words: '词',
      lines: '行',
      paragraphs: '段落',
      reading: '阅读时长',
      readingMinutes: '约 {{minutes}} 分钟',
      readingUnderOne: '< 1 分钟',
      wordsHint: '词口径：连续字母/数字段计 1，词内 \' 与 - 不拆词；每个汉字计 1 词。',
      copySummary: '复制统计摘要',
      copied: '已复制',
      clear: '清空',
    },
  },
  en: {
    tools: {
      'text-stats': 'Text Stats',
      'text-statsDesc': 'Characters, graphemes, bytes, words, lines, paragraphs and reading time',
    },
    textStats: {
      inputLabel: 'Input text',
      inputPlaceholder: 'Paste or type text for live stats…',
      limitWarning: 'Input exceeds the 1 MiB limit and was truncated at a character boundary',
      chars: 'Characters (with whitespace)',
      charsNoSpace: 'Characters (no whitespace)',
      graphemes: 'Graphemes',
      bytes: 'Bytes (UTF-8)',
      words: 'Words',
      lines: 'Lines',
      paragraphs: 'Paragraphs',
      reading: 'Reading time',
      readingMinutes: '~{{minutes}} min',
      readingUnderOne: '< 1 min',
      wordsHint:
        "Word rule: each run of letters/digits counts as 1 (' and - inside a word do not split it); each Han character counts as 1 word.",
      copySummary: 'Copy summary',
      copied: 'Copied',
      clear: 'Clear',
    },
  },
} satisfies ToolLocaleFragment
