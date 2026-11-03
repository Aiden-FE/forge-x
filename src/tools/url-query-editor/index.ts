import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'url-query-editor',
  name: 'URL 查询编辑器',
  description: '以表格编辑 URL 查询参数，未编辑参数按原始字节保真输出',
  category: 'encode',
  icon: 'Link2',
  component: defineAsyncComponent(() => import('./UrlQueryEditor.vue')),
  keywords: ['url', 'query', '查询参数', '参数编辑', 'querystring', '查询字符串'],
} satisfies ToolMeta
