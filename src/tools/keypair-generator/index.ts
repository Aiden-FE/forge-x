import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'keypair-generator',
  name: '密钥对生成器',
  description: '生成 RSA / EC 密钥对（PKCS#8 与 SPKI PEM），可衔接 JWT 签发验签',
  category: 'security',
  icon: 'KeyRound',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./KeypairGenerator.vue')),
  keywords: ['rsa', 'ec', 'keypair', 'key', 'pem', '密钥对', '公钥', '私钥'],
} satisfies ToolMeta
