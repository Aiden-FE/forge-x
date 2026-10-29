import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'text-stats',
  name: '文本统计',
  description: '字符、字素、字节、词、行、段落与阅读时长统计',
  category: 'text',
  icon: 'ChartNoAxesColumn',
  component: defineAsyncComponent(() => import('./TextStats.vue')),
  keywords: ['text', 'stats', 'word count', 'character', 'reading time', '字数', '统计'],
} satisfies ToolMeta
