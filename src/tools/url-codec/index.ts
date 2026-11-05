import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'url-codec',
  name: 'URL 编解码',
  description: '文本与 URL 编码互相转换',
  category: 'encode',
  icon: 'Link',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./UrlCodec.vue')),
  keywords: ['url', 'encode', 'decode', 'uri', 'percent', '编码', '解码']
} satisfies ToolMeta
