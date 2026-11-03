import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'ipv4-subnet',
  name: 'IPv4 子网计算',
  description: 'CIDR 与点分掩码解析、九项参数与等分切分',
  category: 'debug',
  icon: 'Network',
  component: defineAsyncComponent(() => import('./Ipv4Subnet.vue')),
  keywords: ['ipv4', '子网', 'subnet', 'cidr', 'netmask', '掩码', '通配符', 'ip 计算', 'wildcard'],
} satisfies ToolMeta
