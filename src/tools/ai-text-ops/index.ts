import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'ai-text-ops',
  name: 'AI Text Operations',
  description: 'Translate text with your default provider',
  category: 'ai',
  icon: 'Languages',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./AiTextOps.vue')),
  keywords: ['ai', 'translate', 'translation', 'polish', 'summarize', 'tone', 'explain', '翻译', '润色', '摘要', '语气', '解释'],
} satisfies ToolMeta
