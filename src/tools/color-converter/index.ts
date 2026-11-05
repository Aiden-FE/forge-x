import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'color-converter',
  name: '颜色转换器',
  description: 'HEX/RGB/HSL/OKLCH 互转、对比度检查与六规则色板',
  category: 'generate',
  icon: 'Palette',
  component: defineAsyncComponent(() => import('./ColorConverter.vue')),
  keywords: ['color', 'hex', 'rgb', 'hsl', 'oklch', 'oklab', 'wcag', 'contrast', 'palette', '色板', '颜色'],
} satisfies ToolMeta
