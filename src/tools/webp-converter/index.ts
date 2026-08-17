import WebpConverter from './WebpConverter.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'webp-converter',
  name: 'WebP 转换器',
  description: '批量将图片转换为 WebP 格式',
  category: 'convert',
  icon: 'ImageDown',
  component: WebpConverter,
  keywords: ['webp', '转换', '压缩', '图片', 'batch', 'convert', 'image'],
} satisfies ToolMeta
