import type { ToolLocaleFragment } from '@/locales/types'

// E2 扩展（JWT 生成）：文案并入现有 jwtVerifier 分节下的 generate.* 子键，
// 由 useI18n 深合并覆盖共享 locale。仅 HS256 本地签名；secret 仅页面内存级，
// 提示文案按规格强调「仅用于本地测试，勿粘贴生产密钥」。
export default {
  'zh-CN': {
    jwtVerifier: {
      generate: {
        tabs: {
          verify: '验签',
          generate: '生成',
        },
        headerLabel: 'Header JSON',
        headerHint: '已预置 {"alg":"HS256","typ":"JWT"}，可按需修改；签名始终使用 HS256。',
        payloadLabel: 'Payload JSON（Claims）',
        payloadPlaceholder: '输入 payload JSON，如 {"sub":"user-1"}...',
        timeLabel: '时间快捷（Unix 秒）',
        now: '现在',
        plus1h: '+1 小时',
        plus24h: '+24 小时',
        secretLabel: 'Secret',
        secretPlaceholder: '输入 HS256 secret...',
        secretWarning: 'secret 仅保存在页面内存中，刷新即清除。仅用于本地测试，勿粘贴生产密钥。',
        run: '生成 Token',
        clear: '清空',
        tokenLabel: '生成的 Token',
        copy: '复制',
        copied: '已复制',
        sendToVerify: '送入验签',
        hint: '仅支持 HS256（HMAC-SHA256）本地签名；RS256 / ES256 等非对称算法暂不支持。',
        errors: {
          headerJson: 'Header 不是合法 JSON',
          headerObject: 'Header 必须是 JSON 对象',
          payloadJson: 'Payload 不是合法 JSON',
          payloadObject: 'Payload 必须是 JSON 对象',
          secret: '请输入 secret',
        },
      },
    },
  },
  en: {
    jwtVerifier: {
      generate: {
        tabs: {
          verify: 'Verify',
          generate: 'Generate',
        },
        headerLabel: 'Header JSON',
        headerHint: 'Prefilled with {"alg":"HS256","typ":"JWT"} — edit freely; signing always uses HS256.',
        payloadLabel: 'Payload JSON (claims)',
        payloadPlaceholder: 'Enter payload JSON, e.g. {"sub":"user-1"}...',
        timeLabel: 'Time helpers (Unix seconds)',
        now: 'Now',
        plus1h: '+1 hour',
        plus24h: '+24 hours',
        secretLabel: 'Secret',
        secretPlaceholder: 'Enter the HS256 secret...',
        secretWarning: 'The secret stays in page memory only and is cleared on refresh. For local testing only — never paste production secrets.',
        run: 'Generate token',
        clear: 'Clear',
        tokenLabel: 'Generated token',
        copy: 'Copy',
        copied: 'Copied',
        sendToVerify: 'Send to verify',
        hint: 'HS256 (HMAC-SHA256) local signing only; asymmetric algorithms such as RS256 / ES256 are not supported here.',
        errors: {
          headerJson: 'Header is not valid JSON',
          headerObject: 'Header must be a JSON object',
          payloadJson: 'Payload is not valid JSON',
          payloadObject: 'Payload must be a JSON object',
          secret: 'Enter a secret',
        },
      },
    },
  },
} satisfies ToolLocaleFragment
