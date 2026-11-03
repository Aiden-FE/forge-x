import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'html-entity',
  name: 'HTML 实体转义',
  description: '文本与 HTML 字符引用双向转换：五个必需实体转义，解码原生全表',
  category: 'encode',
  icon: 'Code2',
  component: defineAsyncComponent(() => import('./HtmlEntity.vue')),
  keywords: ['html', 'entity', '实体', '转义', 'escape', 'unescape', 'html entities'],
} satisfies ToolMeta
