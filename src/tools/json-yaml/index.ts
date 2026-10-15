import JsonYaml from './JsonYaml.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'json-yaml',
  name: 'JSON↔YAML 互转',
  description: '在本地进行 JSON 与 YAML 双向转换',
  category: 'convert',
  icon: 'FileJson2',
  component: JsonYaml,
  keywords: ['json', 'yaml', 'convert', 'serialize', '互转', '转换']
} satisfies ToolMeta
