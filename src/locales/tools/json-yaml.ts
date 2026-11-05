import type { ToolLocaleFragment } from '@/locales/types'

// 10 票扩展：TOML 第三格式。更名后的 tools.json-yaml(+Desc) 与新增 TOML 相关键
// 深合并覆盖共享 locale 文件的同名键（共享文件不改）。
export default {
  'zh-CN': {
    tools: {
      'json-yaml': 'JSON · YAML · TOML 互转',
      'json-yamlDesc': '在本地进行 JSON、YAML 与 TOML 双向转换',
    },
    jsonYaml: {
      inputLabel: '输入 JSON、YAML 或 TOML',
      placeholder: '粘贴 JSON、YAML 或 TOML 内容...',
      sourceLabel: '源格式',
      targetLabel: '目标格式',
      swap: '交换',
      copy: '复制',
      copied: '已复制',
      clear: '清空',
      output: '输出结果',
      outputEmpty: '输入为空',
      localNotice: '内容仅在本地处理，不会发送到网络。',
      errParse: '语法错误',
      errUnexpected: '转换出现意外错误',
      lineColumn: '位于第 {{line}} 行第 {{column}} 列',
      noticeBigint: '{{count}} 个大整数（> 2^53−1）已字符串化',
      noticeDatetime: '{{count}} 个 datetime 已降级为字符串',
      tomlNotice:
        'TOML 保真声明：注释不保留；datetime 转 JSON/YAML 时降级为字符串（逆向转换不恢复类型）；超过 2^53−1 的大整数以字符串表示；时间精度为毫秒（亚毫秒截断）。',
    },
  },
  en: {
    tools: {
      'json-yaml': 'JSON · YAML · TOML Converter',
      'json-yamlDesc': 'Convert between JSON, YAML and TOML locally',
    },
    jsonYaml: {
      inputLabel: 'Enter JSON, YAML or TOML',
      placeholder: 'Paste JSON, YAML or TOML content...',
      sourceLabel: 'Source format',
      targetLabel: 'Target format',
      swap: 'Swap',
      copy: 'Copy',
      copied: 'Copied',
      clear: 'Clear',
      output: 'Output',
      outputEmpty: 'Input is empty',
      localNotice: 'Everything is processed locally; nothing is sent over the network.',
      errParse: 'Syntax error',
      errUnexpected: 'Unexpected conversion error',
      lineColumn: 'at line {{line}}, column {{column}}',
      noticeBigint: '{{count}} big integer(s) (> 2^53−1) stringified',
      noticeDatetime: '{{count}} datetime(s) degraded to string',
      tomlNotice:
        'TOML fidelity notice: comments are not kept; datetimes degrade to strings toward JSON/YAML (types are not revived in reverse); integers beyond 2^53−1 are stringified; time precision is milliseconds (sub-millisecond digits are truncated).',
    },
  },
} satisfies ToolLocaleFragment
