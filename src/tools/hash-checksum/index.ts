import HashChecksum from './HashChecksum.vue'
import type { ToolMeta } from '@/types/tool'

export default {
  id: 'hash-checksum',
  name: '哈希/校验和',
  description: '本地计算文本与文件的 SHA、MD5 和 CRC32，文本模式支持 HMAC',
  category: 'encode',
  icon: 'Hash',
  component: HashChecksum,
  keywords: ['hash', 'sha', 'sha1', 'sha256', 'sha384', 'sha512', 'md5', 'crc32', 'checksum', 'hmac', 'hmac-sha1', 'hmac-sha256', 'hmac-sha384', 'hmac-sha512', '哈希', '校验和', '密钥'],
} satisfies ToolMeta
