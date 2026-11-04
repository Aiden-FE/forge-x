import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'xml-json',
  name: 'XML↔JSON 互转',
  description: '在本地进行 XML 与 JSON 双向转换',
  category: 'convert',
  icon: 'ArrowLeftRight',
  component: defineAsyncComponent(() => import('./XmlJson.vue')),
  keywords: ['xml', 'json', 'convert', 'serialize', '互转', '转换'],
} satisfies ToolMeta
