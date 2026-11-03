import Base64Codec from './Base64Codec.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'base64-codec',
  name: 'Base64 编解码',
  description: '文本/图片与 Base64 互相转换（data URI 三形态）',
  category: 'encode',
  icon: 'Binary',
  component: Base64Codec,
  keywords: ['base64', 'encode', 'decode', 'image', 'data uri', '编码', '解码', '图片']
} satisfies ToolMeta