import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'totp-generator',
  name: 'TOTP 验证器',
  description: '基于 RFC 6238 生成时序一次性验证码，多账号管理，纯本地零依赖',
  category: 'security',
  icon: 'Timer',
  component: defineAsyncComponent(() => import('./TotpGenerator.vue')),
  keywords: ['totp', '2fa', '两步验证', 'otp', '验证码', 'authenticator', 'otpauth', '动态口令'],
} satisfies ToolMeta
