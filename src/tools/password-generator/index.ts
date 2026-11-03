import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'password-generator',
  name: '密码生成器',
  description: '按字符类策略生成强随机密码，显示理论熵',
  category: 'generate',
  icon: 'KeyRound',
  component: defineAsyncComponent(() => import('./PasswordGenerator.vue')),
  keywords: ['密码', 'password', '生成', '强度', 'entropy', '随机', '口令', 'passphrase', '口令短语', 'PIN', '十六进制'],
} satisfies ToolMeta
