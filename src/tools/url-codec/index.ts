import UrlCodec from './UrlCodec.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'url-codec',
  name: 'URL 编解码',
  description: '文本与 URL 编码互相转换',
  category: 'encode',
  icon: 'Link',
  component: UrlCodec,
  keywords: ['url', 'encode', 'decode', 'uri', 'percent', '编码', '解码']
} satisfies ToolMeta
