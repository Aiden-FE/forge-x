import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'test-data-generator',
  name: '测试数据生成器',
  description: '批量生成结构真实的软件测试假数据，纯本地，仅供测试',
  category: 'generate',
  icon: 'FlaskConical',
  component: defineAsyncComponent(() => import('./TestDataGenerator.vue')),
  keywords: ['测试数据', '假数据', 'mock', 'faker', '占位数据', 'test data', 'mock data', 'lorem'],
} satisfies ToolMeta
