import AiTextOps from './AiTextOps.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'ai-text-ops',
  name: 'AI Text Operations',
  description: 'Translate text with your default provider',
  category: 'ai',
  icon: 'Languages',
  component: AiTextOps,
  keywords: ['ai', 'translate', 'translation', 'polish', 'summarize', 'tone', 'explain', '翻译', '润色', '摘要', '语气', '解释'],
} satisfies ToolMeta
