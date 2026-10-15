import HashChecksum from './HashChecksum.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'hash-checksum',
  name: '哈希/校验和',
  description: '本地计算文本与文件的 SHA、MD5 和 CRC32',
  category: 'encode',
  icon: 'Hash',
  component: HashChecksum,
  keywords: ['hash', 'sha', 'sha1', 'sha256', 'sha384', 'sha512', 'md5', 'crc32', 'checksum', '哈希', '校验和'],
} satisfies ToolMeta
