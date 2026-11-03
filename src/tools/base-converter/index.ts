import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'base-converter',
  name: '进制转换',
  description: '任意 2–36 进制整数互转（BigInt）',
  category: 'encode',
  icon: 'Hash',
  component: defineAsyncComponent(() => import('./BaseConverter.vue')),
  keywords: ['base', 'radix', 'binary', 'hex', 'octal', 'bigint', 'bit view', 'two complement', 'endianness', '进制', '二进制', '十六进制', '位视图', '补码', '字节序'],
} satisfies ToolMeta
