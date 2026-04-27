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

  /* 工具内部 UI 文本 */
  timestamp: {
    label: '时间戳',
    placeholder: '输入时间戳 (秒或毫秒)',
    toDate: '转换为日期',
    dateTime: '日期时间',
    placeholderDate: '输入日期 (YYYY-MM-DD HH:mm:ss)',
    toTimestamp: '转换为时间戳',
    currentTs: '当前时间戳',
    currentTime: '当前时间',
    result: '转换结果',
    errInput: '请输入时间戳',
    errInvalid: '无效的时间戳',
    errDatetime: '请输入日期时间',
    errInvalidDate: '无效的日期格式',
    seconds: '秒',
    milliseconds: '毫秒',
  },
  jsonFormatter: {
    label: '输入 JSON',
    placeholder: '粘贴 JSON 内容...',
    format: '格式化',
    minify: '压缩',
    copy: '复制',
    clear: '清空',
    output: '输出结果',
    errParse: '解析错误',
  },
  base64Codec: {
    label: '输入内容',
    placeholder: '输入要编码或解码的内容...',
    encode: '编码 → Base64',
    decode: '解码 ← Base64',
    copy: '复制',
    clear: '清空',
    output: '输出结果',
    errEncode: '编码错误',
    errDecode: '解码错误: 请输入有效的 Base64 字符串',
  },
}

export default zhCN
