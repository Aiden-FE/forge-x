import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'math-eval',
  name: '数学表达式求值',
  description: '逐行求值数学表达式，双精度浮点如实呈现',
  category: 'debug',
  icon: 'Calculator',
  component: defineAsyncComponent(() => import('./MathEval.vue')),
  keywords: ['math', '计算', '表达式', '求值', 'calculator', 'evaluate', '公式'],
} satisfies ToolMeta
