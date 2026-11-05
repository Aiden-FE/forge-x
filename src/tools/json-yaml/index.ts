import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'json-yaml',
  name: 'JSON · YAML · TOML 互转',
  description: '在本地进行 JSON、YAML 与 TOML 双向转换',
  category: 'convert',
  icon: 'FileJson2',
  // 附录 §1：ToolMeta.component 一律异步组件（v0.5.0 更名时顺带归位）。
  component: defineAsyncComponent(() => import('./JsonYaml.vue')),
  keywords: ['json', 'yaml', 'toml', 'convert', 'serialize', '互转', '转换']
} satisfies ToolMeta
