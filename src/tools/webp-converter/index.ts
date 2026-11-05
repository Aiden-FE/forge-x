import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'webp-converter',
  name: 'WebP 转换器',
  description: '批量将图片转换为 WebP 格式',
  category: 'convert',
  icon: 'ImageDown',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./WebpConverter.vue')),
  keywords: ['webp', '转换', '压缩', '图片', 'batch', 'convert', 'image'],
} satisfies ToolMeta
