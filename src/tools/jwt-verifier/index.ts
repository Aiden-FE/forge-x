import JwtVerifier from './JwtVerifier.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'jwt-verifier',
  name: 'JWT 解码/验签',
  description: '本地解码 JWT 并使用 HS256、RS256、ES256 验签，支持 HS256 本地生成',
  category: 'encode',
  icon: 'ShieldCheck',
  component: JwtVerifier,
  keywords: ['jwt', 'token', 'decode', 'verify', 'generate', 'hs256', 'rs256', 'es256', '验签', '生成']
} satisfies ToolMeta
