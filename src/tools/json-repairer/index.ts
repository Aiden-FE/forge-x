import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'json-repairer',
  name: 'JSON 修复器',
  description: '修复不完整、截断、非规范的 JSON（典型如 LLM 输出）',
  category: 'ai',
  icon: 'Wrench',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./JsonRepairer.vue')),
  keywords: ['json', 'repair', 'fix', 'llm', 'ai', '修复', '截断']
} satisfies ToolMeta
