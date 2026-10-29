import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'text-case',
  name: '文本大小写转换',
  description: '七种大小写样式互转，CJK 透传',
  category: 'text',
  icon: 'CaseSensitive',
  component: defineAsyncComponent(() => import('./TextCase.vue')),
  keywords: ['case', 'camelcase', 'pascalcase', 'snake', 'kebab', 'title', '大小写', '命名'],
} satisfies ToolMeta
