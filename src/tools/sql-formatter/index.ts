import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'sql-formatter',
  name: 'SQL 格式化',
  description: '15 种方言的 SQL 排版美化，实时防抖，只管排版不管对错',
  category: 'format',
  icon: 'Database',
  component: defineAsyncComponent(() => import('./SqlFormatter.vue')),
  keywords: ['sql', 'format', '格式化', '美化', 'beautify', 'mysql', 'postgresql'],
} satisfies ToolMeta
