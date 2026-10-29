import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'exif-tool',
  name: 'EXIF 查看/清除',
  description: '查看 JPEG/PNG/TIFF 元数据，无损清除 JPEG/PNG 元数据（保留 ICC）',
  category: 'convert',
  icon: 'ScanLine',
  component: defineAsyncComponent(() => import('./ExifTool.vue')),
  keywords: ['exif', 'metadata', 'photo', 'jpeg', 'png', 'tiff', 'gps', '元数据', '隐私'],
} satisfies ToolMeta
