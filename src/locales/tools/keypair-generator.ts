import type { ToolLocaleFragment } from '@/locales/types'

export default {
  'zh-CN': {
    tools: {
      'keypair-generator': '密钥对生成器',
      'keypair-generatorDesc': '生成 RSA / EC 密钥对（PKCS#8 与 SPKI PEM），可衔接 JWT 签发验签',
    },
    keypairGenerator: {
      algoLabel: '算法族',
      rsa: 'RSA',
      ec: 'EC',
      bitsLabel: '密钥位数',
      curveLabel: '椭圆曲线',
      jwtAlgLabel: '对应 JWT alg：',
      generate: '生成密钥对',
      pending: '生成中…（RSA 4096 可达数十秒，界面不会冻结）',
      elapsed: '耗时 {{value}}',
      error: '生成失败，请重试（已生成的密钥保持展示）',
      privateLabel: '私钥（PKCS#8 PEM）',
      publicLabel: '公钥（SPKI PEM）',
      copy: '复制',
      copied: '已复制',
      download: '下载',
      privateHint: '私钥是敏感信息：仅存在于本页内存，刷新或离开页面即消失，请妥善保管下载的文件。',
      localNotice:
        '密钥对由浏览器原生 WebCrypto 在本地生成：零网络请求、不持久化、仅内存级——不会写入任何存储。',
      help: {
        show: '使用说明',
        hide: '收起使用说明',
        title: '输出形态与档位',
        pemForms:
          '输出固定两种形态：私钥 PKCS#8（-----BEGIN PRIVATE KEY-----）与公钥 SPKI（-----BEGIN PUBLIC KEY-----）；PKCS#1（RSA PRIVATE KEY）、SEC1（EC PRIVATE KEY）、加密 PEM 与 OpenSSH 格式均不生成。',
        tiers:
          '档位与 JWT alg 对应：RSA 2048 / 3072 / 4096 → RS256（RSASSA-PKCS1-v1_5 + SHA-256）；EC P-256 / P-384 / P-521 → ES256 / ES384 / ES512（ECDSA）。',
        closure:
          '衔接 JWT 解码/验签：把私钥粘贴到签发区（支持 RS256 / ES256）、公钥粘贴到验签区，即可直接签发与验签；ES384 / ES512 档位该工具暂不支持验签。',
        relatedTitle: '相关工具：',
        relatedJwt: 'JWT 解码/验签（用生成的密钥签发 / 验签）',
      },
    },
  },
  en: {
    tools: {
      'keypair-generator': 'Key Pair Generator',
      'keypair-generatorDesc':
        'Generate RSA / EC key pairs (PKCS#8 & SPKI PEM) that plug into JWT signing and verification',
    },
    keypairGenerator: {
      algoLabel: 'Family',
      rsa: 'RSA',
      ec: 'EC',
      bitsLabel: 'Key size',
      curveLabel: 'Curve',
      jwtAlgLabel: 'JWT alg:',
      generate: 'Generate key pair',
      pending: 'Generating… (RSA 4096 can take tens of seconds; the UI stays responsive)',
      elapsed: 'Elapsed {{value}}',
      error: 'Generation failed, please retry (previous keys stay visible)',
      privateLabel: 'Private key (PKCS#8 PEM)',
      publicLabel: 'Public key (SPKI PEM)',
      copy: 'Copy',
      copied: 'Copied',
      download: 'Download',
      privateHint:
        'The private key is sensitive: it lives in this page\u2019s memory only and disappears on refresh or navigation — keep the downloaded file safe.',
      localNotice:
        'Key pairs are generated locally by the browser\u2019s native WebCrypto: zero network requests, nothing persisted, memory only.',
      help: {
        show: 'Usage notes',
        hide: 'Hide usage notes',
        title: 'Output formats & tiers',
        pemForms:
          'Exactly two output forms: PKCS#8 private key (-----BEGIN PRIVATE KEY-----) and SPKI public key (-----BEGIN PUBLIC KEY-----); PKCS#1 (RSA PRIVATE KEY), SEC1 (EC PRIVATE KEY), encrypted PEM and OpenSSH formats are never generated.',
        tiers:
          'Tier → JWT alg mapping: RSA 2048 / 3072 / 4096 → RS256 (RSASSA-PKCS1-v1_5 + SHA-256); EC P-256 / P-384 / P-521 → ES256 / ES384 / ES512 (ECDSA).',
        closure:
          'Pairing with JWT Decode/Verify: paste the private key into the sign section (RS256 / ES256 supported) and the public key into the verify section to sign and verify directly; ES384 / ES512 tiers are not yet supported by that tool.',
        relatedTitle: 'Related tool:',
        relatedJwt: 'JWT Decode/Verify (sign / verify with the generated keys)',
      },
    },
  },
} satisfies ToolLocaleFragment
