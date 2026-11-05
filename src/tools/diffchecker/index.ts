import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'diffchecker',
  name: '文本差异对比',
  description: '对比两份文本，高亮差异',
  category: 'format',
  icon: 'GitCompare',
  // 附录 §1：ToolMeta.component 一律异步组件（v0.5.0 本批顺带归位——静态导入会把
  // 单工具编译错误放大成全应用故障，见 e2e 编写期的事故记录）。
  component: defineAsyncComponent(() => import('./DiffChecker.vue')),
  keywords: ['diff', '对比', '差异', '文本差异', 'compare', 'diffchecker']
} satisfies ToolMeta
