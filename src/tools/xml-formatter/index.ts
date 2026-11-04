import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'xml-formatter',
  name: 'XML 格式化',
  description: '格式化或压缩 XML 数据，支持语法验证',
  category: 'format',
  icon: 'CodeXml',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./XmlFormatter.vue')),
  keywords: ['xml', 'format', 'minify', 'validate', '格式化', '压缩']
} satisfies ToolMeta
