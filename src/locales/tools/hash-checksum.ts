import type { ToolLocaleFragment } from '@/locales/types'

// E1 扩展（HMAC）：文案并入现有 hashChecksum 分节下的 hmac.* 子键，
// 由 useI18n 深合并覆盖共享 locale，密钥为空即普通哈希、填入即 HMAC。
export default {
  'zh-CN': {
    hashChecksum: {
      hmac: {
        keyLabel: 'HMAC 密钥',
        keyPlaceholder: '输入 HMAC 密钥（留空 = 普通哈希）',
        keyHint: '密钥按 UTF-8 文本处理：留空即普通哈希，填入即 HMAC。仅 SHA 系列算法参与 HMAC，MD5 / CRC32 不支持密钥。',
        errors: {
          noCapableAlgorithm: 'HMAC 需要 SHA 系列算法：MD5 与 CRC32 不支持密钥，请选择 SHA-1 / SHA-256 / SHA-384 / SHA-512 或清空密钥',
        },
      },
    },
  },
  en: {
    hashChecksum: {
      hmac: {
        keyLabel: 'HMAC key',
        keyPlaceholder: 'Enter an HMAC key (empty = plain hash)',
        keyHint: 'The key is treated as UTF-8 text: empty means plain hashes, a key means HMAC. Only the SHA family computes HMAC — MD5 / CRC32 do not support keys.',
        errors: {
          noCapableAlgorithm: 'HMAC requires a SHA algorithm: MD5 and CRC32 do not support keys. Pick SHA-1 / SHA-256 / SHA-384 / SHA-512 or clear the key.',
        },
      },
    },
  },
} satisfies ToolLocaleFragment
