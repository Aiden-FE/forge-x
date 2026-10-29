import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'id-card-validator',
  name: '身份证号校验',
  description: '校验 18/15 位身份证号结构并解析出生日期与性别',
  category: 'text',
  icon: 'IdCard',
  component: defineAsyncComponent(() => import('./IdCardValidator.vue')),
  keywords: ['身份证', 'idcard', '校验', 'checksum', 'gb11643', 'validator'],
} satisfies ToolMeta
