import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'ipv6-subnet',
  name: 'IPv6 子网计算',
  description: '前缀解析、参数计算、scope 判定与等分切分',
  category: 'debug',
  icon: 'Waypoints',
  component: defineAsyncComponent(() => import('./Ipv6Subnet.vue')),
  keywords: ['ipv6', 'subnet', 'cidr', '前缀', '子网'],
} satisfies ToolMeta
