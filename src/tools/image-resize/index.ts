import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'image-resize',
  name: '图片压缩/缩放',
  description: '批量缩放并重编码为 PNG/JPEG/WebP',
  category: 'convert',
  icon: 'Scaling',
  component: defineAsyncComponent(() => import('./ImageResize.vue')),
  keywords: ['image', 'resize', 'compress', 'scale', 'png', 'jpeg', 'webp', 'crop', 'rotate', '图片', '缩放', '压缩', '裁剪', '旋转'],
} satisfies ToolMeta
