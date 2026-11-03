import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'markdown-html',
  name: 'Markdown↔HTML 转换',
  description: 'GFM 全套双向转换，输出一律经 DOMPurify 净化；围栏代码预览高亮',
  category: 'text',
  icon: 'FileCode2',
  component: defineAsyncComponent(() => import('./MarkdownHtml.vue')),
  keywords: ['markdown', 'html', 'md', 'gfm', 'turndown', 'marked', 'highlight', '语法高亮', '转换'],
} satisfies ToolMeta
