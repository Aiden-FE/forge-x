import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'jwt-verifier',
  name: 'JWT 解码/验签',
  description: '本地解码 JWT 并使用 HS256、RS256、ES256 验签与签发（非对称走 PKCS#8 PEM）',
  category: 'security',
  icon: 'ShieldCheck',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./JwtVerifier.vue')),
  keywords: ['jwt', 'token', 'decode', 'verify', 'generate', 'hs256', 'rs256', 'es256', 'pem', '非对称', '验签', '生成']
} satisfies ToolMeta
