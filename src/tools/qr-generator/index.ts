import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'qr-generator',
  name: 'QR Code 生成器',
  description: '输入文本生成二维码 SVG',
  category: 'generate',
  icon: 'QrCode',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./QrGenerator.vue')),
  keywords: ['qr', 'qrcode', '二维码', 'QR Code', 'generator', 'svg'],
} satisfies ToolMeta
