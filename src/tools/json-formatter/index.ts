import JsonFormatter from './JsonFormatter.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'json-formatter',
  name: 'JSON 格式化',
  description: '格式化或压缩 JSON 数据，支持语法验证',
  category: 'format',
  icon: 'Braces',
  component: JsonFormatter,
  keywords: ['json', 'format', 'minify', 'validate']
} satisfies ToolMeta