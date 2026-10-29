import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'uuid-generator',
  name: 'UUID/ULID 生成器',
  description: '生成 UUID v4/v7 与 ULID，支持批量与格式开关',
  category: 'generate',
  icon: 'Fingerprint',
  component: defineAsyncComponent(() => import('./UuidGenerator.vue')),
  keywords: ['uuid', 'guid', 'ulid', 'v4', 'v7', '唯一标识', '生成器', 'generator'],
} satisfies ToolMeta
