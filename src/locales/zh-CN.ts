import type { LocaleMessages } from './types'

const zhCN: LocaleMessages = {
  brand: 'ForgeX',
  tagline: '开发者快捷工具平台',
  search: '搜索工具... (按 /)',
  searchPlaceholder: '搜索工具...',
  home: '首页',
  tool: '工具',
  noMatch: '暂无匹配的工具',
  allCategories: '全部',
  categories: {
    encode: '编码转换',
    format: '格式化',
    generate: '生成器',
    convert: '转换',
  },
  theme: {
    toggleDark: '切换暗色主题',
    toggleLight: '切换亮色主题',
  },
  lang: {
    switchToCn: '切换到中文',
    switchToEn: '切换到英文',
  },
  tools: {
    timestampConverter: '时间戳转换',
    timestampConverterDesc: 'Unix 时间戳与日期互转',
    jsonFormatter: 'JSON 格式化',
    jsonFormatterDesc: '格式化、压缩和校验 JSON',
    base64Codec: 'Base64 编解码',
    base64CodecDesc: 'Base64 编码与解码',
  },
}

export default zhCN
