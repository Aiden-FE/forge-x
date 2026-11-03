import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'bcrypt-hash',
  name: 'bcrypt 哈希/校验',
  description: '生成与校验 bcrypt 密码哈希并拆解哈希结构，纯本地',
  category: 'security',
  icon: 'KeyRound',
  component: defineAsyncComponent(() => import('./BcryptHash.vue')),
  keywords: ['bcrypt', '哈希', 'hash', '密码', 'password', 'salt', '加密', 'crypt', '校验'],
} satisfies ToolMeta
