import QrGenerator from './QrGenerator.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'qr-generator',
  name: 'QR Code 生成器',
  description: '输入文本生成二维码 SVG',
  category: 'generate',
  icon: 'QrCode',
  component: QrGenerator,
  keywords: ['qr', 'qrcode', '二维码', 'QR Code', 'generator', 'svg'],
} satisfies ToolMeta
