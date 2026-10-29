import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'regex-tester',
  name: '正则测试器',
  description: '匹配高亮、分组列示与替换预览，Worker 隔离防 ReDoS',
  category: 'debug',
  icon: 'Regex',
  component: defineAsyncComponent(() => import('./RegexTester.vue')),
  keywords: ['regex', 'regexp', '正则', '匹配', '替换', 'debug'],
} satisfies ToolMeta
