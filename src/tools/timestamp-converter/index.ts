import TimestampConverter from './TimestampConverter.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'timestamp-converter',
  name: '时间戳转换',
  description: '时间戳与日期时间互相转换',
  category: 'convert',
  icon: 'CalendarClock',
  component: TimestampConverter,
  keywords: ['timestamp', 'date', 'time', '时间戳', '日期']
} satisfies ToolMeta