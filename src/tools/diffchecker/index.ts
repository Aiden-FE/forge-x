import DiffChecker from './DiffChecker.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'diffchecker',
  name: '文本差异对比',
  description: '对比两份文本，高亮差异',
  category: 'format',
  icon: 'GitCompare',
  component: DiffChecker,
  keywords: ['diff', '对比', '差异', '文本差异', 'compare', 'diffchecker']
} satisfies ToolMeta
