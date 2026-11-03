import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'cron-tool',
  name: 'Cron 解析/生成',
  description: '解析与构建 cron 定时表达式，执行预览与双模式生成',
  category: 'debug',
  icon: 'Clock',
  component: defineAsyncComponent(() => import('./CronTool.vue')),
  keywords: ['cron', 'crontab', '定时', '计划任务', '调度', 'quartz', 'spring', '表达式'],
} satisfies ToolMeta
