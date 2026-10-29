import type { ToolLocaleFragment } from '@/locales/types'

export default {
  'zh-CN': {
    tools: {
      'base-converter': '进制转换',
      'base-converterDesc': '任意 2–36 进制整数互转（BigInt）',
    },
    baseConverter: {
      binary: '二进制',
      octal: '八进制',
      decimal: '十进制',
      hex: '十六进制',
      custom: '自定义进制',
      radixLabel: '基数',
      radixHint: '2–36',
      uppercase: '字母大写',
      prefix: '前缀记法 (0b/0o/0x)',
      charRow: 'Unicode 码点',
      charNone: '—',
      errInvalidChar: '非法字符 "{{char}}"（第 {{pos}} 个字符）',
      errIncomplete: '缺少有效数字',
      errRadix: '基数需为 2–36 的整数',
    },
  },
  en: {
    tools: {
      'base-converter': 'Base Converter',
      'base-converterDesc': 'Convert integers between any radices 2–36 (BigInt)',
    },
    baseConverter: {
      binary: 'Binary',
      octal: 'Octal',
      decimal: 'Decimal',
      hex: 'Hexadecimal',
      custom: 'Custom radix',
      radixLabel: 'Base',
      radixHint: '2–36',
      uppercase: 'Uppercase',
      prefix: 'Prefix notation (0b/0o/0x)',
      charRow: 'Unicode code point',
      charNone: '—',
      errInvalidChar: 'Invalid character "{{char}}" (position {{pos}})',
      errIncomplete: 'Missing digits',
      errRadix: 'Base must be an integer from 2 to 36',
    },
  },
} satisfies ToolLocaleFragment
