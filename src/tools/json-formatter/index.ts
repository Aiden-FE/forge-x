import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'json-formatter',
  name: 'JSON 格式化',
  description: '格式化或压缩 JSON 数据，支持语法验证',
  category: 'format',
  icon: 'Braces',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./JsonFormatter.vue')),
  keywords: ['json', 'format', 'minify', 'validate']
} satisfies ToolMeta