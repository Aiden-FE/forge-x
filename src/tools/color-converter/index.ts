import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'color-converter',
  name: '颜色转换器',
  description: 'HEX/RGB/HSL 互转、对比度检查与互补色',
  category: 'generate',
  icon: 'Palette',
  component: defineAsyncComponent(() => import('./ColorConverter.vue')),
  keywords: ['color', 'hex', 'rgb', 'hsl', 'wcag', 'contrast', '颜色'],
} satisfies ToolMeta
