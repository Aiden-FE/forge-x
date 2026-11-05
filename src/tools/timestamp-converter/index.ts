import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'timestamp-converter',
  name: '时间戳转换',
  description: '时间戳与日期时间互相转换',
  category: 'convert',
  icon: 'CalendarClock',
  // 附录 §1：ToolMeta.component 一律异步组件（首屏第三方增量 0 的前提）。
  component: defineAsyncComponent(() => import('./TimestampConverter.vue')),
  keywords: ['timestamp', 'date', 'time', '时间戳', '日期']
} satisfies ToolMeta