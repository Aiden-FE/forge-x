import { defineAsyncComponent } from 'vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'bip39-generator',
  name: 'BIP39 助记词',
  description: '生成与校验 BIP39 助记词（英文词表），可派生 seed',
  category: 'security',
  icon: 'KeyRound',
  component: defineAsyncComponent(() => import('./Bip39Generator.vue')),
  keywords: ['bip39', 'mnemonic', '助记词', '词库', 'seed'],
} satisfies ToolMeta
