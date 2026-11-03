import type { ToolLocaleFragment } from '@/locales/types'

export default {
  'zh-CN': {
    tools: {
      'math-eval': '数学表达式求值',
      'math-evalDesc': '逐行求值数学表达式，双精度浮点如实呈现',
    },
    mathEval: {
      inputLabel: '表达式',
      inputPlaceholder: '每行一个表达式或定义，如：\nx = 5\nx * 2 + 0.1',
      definitionEcho: '绑定',
      limitWarning: '输入超过 1 MiB 上限，已在字符边界截断',
      errUndefinedVar: '未定义变量 {{name}}',
      errSyntax: '语法错误：{{message}}',
      errRuntime: '求值失败：{{message}}',
      errEmptyValue: '缺少表达式',
      specialInf: '正无穷',
      specialNeginf: '负无穷',
      specialNan: '非数',
      historyTitle: '历史',
      historyEmpty: '暂无历史',
      historyRestore: '回填',
      functionsHint: '函数集为库内置：sin/cos/tan/log/log10/sqrt/pow/min/max/abs/round/floor/ceil/trunc/sign/exp/if 等；常量 pi、e。',
    },
  },
  en: {
    tools: {
      'math-eval': 'Math Evaluator',
      'math-evalDesc': 'Evaluate math expressions line by line with faithful IEEE 754 doubles',
    },
    mathEval: {
      inputLabel: 'Expressions',
      inputPlaceholder: 'One expression or definition per line, e.g.\nx = 5\nx * 2 + 0.1',
      definitionEcho: 'bound',
      limitWarning: 'Input exceeds the 1 MiB limit and was truncated at a character boundary',
      errUndefinedVar: 'Undefined variable {{name}}',
      errSyntax: 'Syntax error: {{message}}',
      errRuntime: 'Evaluation failed: {{message}}',
      errEmptyValue: 'Missing expression',
      specialInf: 'positive infinity',
      specialNeginf: 'negative infinity',
      specialNan: 'not a number',
      historyTitle: 'History',
      historyEmpty: 'No history yet',
      historyRestore: 'Restore',
      functionsHint:
        'Built-in function set: sin/cos/tan/log/log10/sqrt/pow/min/max/abs/round/floor/ceil/trunc/sign/exp/if etc.; constants pi and e.',
    },
  },
} satisfies ToolLocaleFragment
