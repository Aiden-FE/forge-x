import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'csv-json',
  name: 'CSV↔JSON 转换',
  description: 'CSV/TSV 与 JSON 双向转换，RFC 4180 严格解析',
  category: 'convert',
  icon: 'FileSpreadsheet',
  component: defineAsyncComponent(() => import('./CsvJson.vue')),
  keywords: ['csv', 'json', 'tsv', '表格', '互转', '分隔符', 'header'],
} satisfies ToolMeta
