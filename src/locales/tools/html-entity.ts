import type { ToolLocaleFragment } from '@/locales/types'

export default {
  'zh-CN': {
    tools: {
      'html-entity': 'HTML 实体转义',
      'html-entityDesc': '文本与 HTML 字符引用双向转换：五个必需实体转义，解码原生全表',
    },
    htmlEntity: {
      mode: '方向',
      escape: '转义（文本 → 实体）',
      unescape: '反转义（实体 → 文本）',
      safetyNote:
        '解码在隔离的 inert 文档中进行：不执行脚本、不加载资源、结果不进活动页面；标签按字面保留（仅解码不解析）。',
      inputLabel: '输入文本',
      escapePlaceholder: '粘贴文本，转义 & < > " \' 五个必需实体…',
      unescapePlaceholder: '粘贴含字符引用的文本（&amp; &#35; &#x23; …），标签按字面保留…',
      limitWarning: '输入超过 1 MiB 上限，已在字符边界截断',
      output: '转换结果',
      copy: '复制',
      copied: '已复制',
      clear: '清空',
      unknownEntities: '以下行含未知命名实体（已按原样保留，其余行照常）：',
    },
  },
  en: {
    tools: {
      'html-entity': 'HTML Entity',
      'html-entityDesc': 'Two-way text ↔ HTML character references: five required entities on escape, full native table on decode',
    },
    htmlEntity: {
      mode: 'Direction',
      escape: 'Escape (text → entities)',
      unescape: 'Unescape (entities → text)',
      safetyNote:
        'Decoding runs in an isolated inert document: no scripts executed, no resources loaded, results never enter the live page; tags are kept literal (decode-only).',
      inputLabel: 'Input text',
      escapePlaceholder: 'Paste text to escape the five required entities & < > " \'…',
      unescapePlaceholder: 'Paste text with character references (&amp; &#35; &#x23; …), tags stay literal…',
      limitWarning: 'Input exceeds the 1 MiB limit and was truncated at a character boundary',
      output: 'Result',
      copy: 'Copy',
      copied: 'Copied',
      clear: 'Clear',
      unknownEntities: 'Unknown named entities on the following lines (kept as-is; other lines unaffected):',
    },
  },
} satisfies ToolLocaleFragment
