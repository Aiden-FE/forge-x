import type { ToolLocaleFragment } from '@/locales/types'

// 13 票扩展（图片↔Base64）：文案并入现有 base64Codec 分节下的 mode.* / image.*
// 子键，由 useI18n 深合并覆盖共享 locale。文本模式键（label/placeholder 等）
// 仍在共享 locale，原样沿用。
export default {
  'zh-CN': {
    base64Codec: {
      mode: {
        text: '文本',
        image: '图片',
      },
      image: {
        encodeLabel: '图片 → Base64',
        dropHint: '拖拽图片到此处，或点击选择文件',
        limits: '单文件 ≤ 20 MiB，批量 ≤ 20 个文件；超限文件不入批，已有结果不受影响。',
        results: '结果',
        copy: '复制',
        copied: '已复制',
        forms: {
          duri: 'Data URI',
          img: '<img> 片段',
          css: 'CSS url() 片段',
        },
        decodeLabel: 'Base64 / Data URI → 图片',
        decodePlaceholder: '粘贴 data:image/... URI 或裸 base64...',
        download: '下载',
        errors: {
          tooMany: '超出批量上限（≤ 20 个文件）',
          tooLarge: '超过单文件 20 MiB 上限',
          notImage: '不是可识别的图片文件',
          base64: 'Base64 数据无法解码',
          format: '不是有效的 data URI（缺少逗号分隔）',
          readError: '文件读取失败',
        },
      },
    },
  },
  en: {
    base64Codec: {
      mode: {
        text: 'Text',
        image: 'Image',
      },
      image: {
        encodeLabel: 'Image → Base64',
        dropHint: 'Drop images here, or click to choose files',
        limits: 'Single file ≤ 20 MiB, batch ≤ 20 files; over-limit files are excluded and existing results stay untouched.',
        results: 'Results',
        copy: 'Copy',
        copied: 'Copied',
        forms: {
          duri: 'Data URI',
          img: '<img> fragment',
          css: 'CSS url() fragment',
        },
        decodeLabel: 'Base64 / Data URI → image',
        decodePlaceholder: 'Paste a data:image/... URI or bare base64...',
        download: 'Download',
        errors: {
          tooMany: 'Batch limit exceeded (≤ 20 files)',
          tooLarge: 'Exceeds the 20 MiB per-file limit',
          notImage: 'Not a recognizable image file',
          base64: 'Base64 payload cannot be decoded',
          format: 'Not a valid data URI (missing comma separator)',
          readError: 'Failed to read the file',
        },
      },
    },
  },
} satisfies ToolLocaleFragment
