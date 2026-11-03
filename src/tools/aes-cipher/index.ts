import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'aes-cipher',
  name: 'AES 加解密',
  description: '文本 AES-GCM/CBC 加解密，信封格式自描述封装，纯本地零依赖',
  category: 'security',
  icon: 'Lock',
  component: defineAsyncComponent(() => import('./AesCipher.vue')),
  keywords: ['aes', '加密', '解密', 'encrypt', 'decrypt', 'gcm', 'cbc', '密码学', 'cipher'],
} satisfies ToolMeta
