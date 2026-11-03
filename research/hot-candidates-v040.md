# ForgeX v0.4.0 — 候选池流行度调研

Wayfinder 地图: `.scratch/hot-tools-v0.4.0/issues/01-candidate-research.md`（ticket 01）
调研日期: 2026-11-03（npm 周下载窗口 2026-10-26 → 2026-11-01；star/收录/体积均为当日抓取或当日实测）。

## 0. 口径与基线

- **硬约束**（延续 map Notes Standing）：纯本地计算；单工具按需 ≤50 KB gzip（懒加载约定）；需自建后端/外部在线数据的工具出局；大词库类中文工具排除。
- **现有工具基线（23 个）**：ai-text-ops, base-converter, base64-codec, color-converter, csv-json, diffchecker, exif-tool, hash-checksum, id-card-validator, image-resize, json-formatter, json-yaml, jwt-verifier, markdown-html, password-generator, qr-generator, regex-tester, text-case, text-stats, timestamp-converter, url-codec, uuid-generator, webp-converter。与候选重叠者在各节标注「扩展对象」；扩展 vs 新建归属由清单票据逐个判定。
- **一线工具箱参照系**（按 star 降序，GitHub API 2026-11-03）：[it-tools](https://github.com/CorentinTh/it-tools) 41,102 ★、[DevToys](https://github.com/veler/DevToys) 32,181 ★、[CyberChef](https://github.com/gchq/CyberChef) 36,299 ★、[Omni Tools](https://github.com/iib0011/omni-tools) 10,594 ★。收录判定依据：it-tools `src/tools/` 目录清单（88 个工具目录）、Omni Tools `src/pages/tools/` 目录清单、DevToys 官网 [devtoys.app](https://devtoys.app/) 工具列表、CyberChef `src/core/operations/` 目录清单（每操作一文件）。
- **体积口径**：bundlephobia API 的 min/gzip（2026-11-03 查询）；标注 *实测* 者为 npm registry tarball 解包 + gzip -9 本地实测；标注 *粗估* 者为组合估算或未单独验证。
- **证据强度**：A = 多家一线同时收录 + 生态硬数据强；B = 一线部分收录或生态热；C = 仅相邻工具或空白（差异化机会，需求证据弱）。

---

## 1. SQL 格式化

- **流行度证据**：**A**。it-tools 有 [`sql-prettify`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/sql-prettify)，DevToys 有 SQL Formatter，CyberChef 有 [`SQLBeautify`/`SQLMinify`](https://github.com/gchq/CyberChef/tree/master/src/core/operations)；Omni Tools 未收录。代表库 [sql-formatter](https://www.npmjs.com/package/sql-formatter)（[sql-formatter-org/sql-formatter](https://github.com/sql-formatter-org/sql-formatter)，2,900 ★）：**700.8 万次/周**。
- **纯本地可行性**：✅ 纯文本处理，无任何在线依赖。
- **依赖粗估**：sql-formatter 15.9 = 262 KB min / **74.3 KB gzip**（bundlephobia，2 个依赖，nearley 语法表，tree-shaking 空间有限）。it-tools 同款依赖（`^13.0.0`）。**超出单工具 50 KB gzip 预算约 1.5 倍**；替代路线（prettier-plugin-sql 系）体积更大（粗估 MB 级），自实现 SQL 方言格式化质量风险高。
- **结论**：热点证据强（三家一线收录），但依赖体积是本轮唯一超预算的大件——值得进排序，规格票据需在「接受 74 KB 懒加载」与「缩小方言/语句子集」间做取舍。

## 2. Cron 表达式解析/生成

- **流行度证据**：**A**。it-tools 有 [`crontab-generator`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/crontab-generator)（内部用 [cronstrue](https://www.npmjs.com/package/cronstrue)），Omni Tools 有 `crontab-guru`，DevToys 有 Cron Parser；[crontab.guru](https://crontab.guru) 为该领域事实标准参考站（社区心智极强，定性）。代表库：[cron-parser](https://github.com/harrisiirak/cron-parser)（1,500 ★）**3,134.8 万次/周**（多作为调度器依赖，间接热度）；cronstrue（2.3K ★）**550.0 万次/周**。
- **纯本地可行性**：✅ 纯计算；「下一次执行时间」计算涉 DST/时区边界，用库稳妥。
- **依赖粗估**：cronstrue（人类可读描述）23.5 KB min / **6.6 KB gzip**；cron-parser 5.x（含 luxon）97.8 KB min / **29.6 KB gzip**。两者合计 ≈36 KB，卡预算内。
- **结论**：三家全收录 + 双库大数据 + 体积友好，热点证据最强的一档。

## 3. URL 查询参数编辑器

- **流行度证据**：**A**。it-tools 有 [`url-parser`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/url-parser) + `url-encoder`，Omni Tools 有 `url-editor` + `url-decode`/`url-encode`，DevToys 有 URL。现有 `url-codec` 为编解码，参数表格化编辑是增量。
- **纯本地可行性**：✅ `URL`/`URLSearchParams` 原生 API，0 依赖。
- **依赖粗估**：0。
- **结论**：收录普遍、零依赖零风险；归属（扩展 url-codec vs 新工具）由清单票据定。

## 4. 图片↔Base64 互转

- **流行度证据**：**A**。it-tools 有 [`base64-file-converter`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/base64-file-converter)，DevToys 有 Base64 Image + Base64 Text 两个工具，CyberChef 有 From/To Base64，Omni Tools `string/base64`。现有 `base64-codec` 经查为纯文本实现（无 FileReader/文件输入）。
- **纯本地可行性**：✅ FileReader/DataURL 原生，0 依赖；大图内存占用是唯一注意点（粘贴 ≤1 MiB / 导入 20 MiB 约定沿用）。
- **依赖粗估**：0。
- **结论**：收录普遍、零依赖；扩展现有 base64-codec 还是新建由清单票定。

## 5. bcrypt 哈希/校验

- **流行度证据**：**A**。it-tools 有 [`bcrypt`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/bcrypt)（哈希+校验，依赖 [bcryptjs](https://www.npmjs.com/package/bcryptjs)），Omni Tools `string/bcrypt`，CyberChef 有 `Bcrypt`/`BcryptCompare`/`BcryptParse` 三操作；DevToys 的 Hash/Checksum 未列 bcrypt。bcryptjs **1,955.8 万次/周**（Node/浏览器双用事实标准）。hash-wasm（含 bcrypt 快速路径）264.4 万次/周。
- **纯本地可行性**：✅ 纯计算。bcryptjs 纯 JS 在 cost 10+ 时单次约秒级（离线工具可接受，UI 需异步提示）；hash-wasm WASM 快一个量级。
- **依赖粗估**：bcryptjs 3.x = 20.1 KB min / **9.2 KB gzip**（0 依赖）；hash-wasm 全家桶 215 KB min / 77.7 KB gzip（超预算，仅作性能备选）。现有 `hash-checksum` 可作挂载点（扩展）或独立新工具。
- **结论**：收录广 + 周下载近 2000 万 + 依赖仅 9 KB，热点证据最强的一档。

## 6. TOTP 验证器（两步验证码生成）

- **流行度证据**：**A**。it-tools 有 [`otp-code-generator-and-validator`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/otp-code-generator-and-validator)，CyberChef 有 `GenerateTOTP`/`GenerateHOTP`；Omni Tools、DevToys 未收录。代表库 [otpauth](https://github.com/hectorm/otpauth)（1,488 ★）**410.0 万次/周**、[otplib](https://github.com/yeojz/otplib)（2,304 ★）**503.9 万次/周**。
- **纯本地可行性**：✅ HMAC-SHA1/256/512 走 WebCrypto + base32 解码 + 本地时钟，可 0 依赖自实现（~150 行）；无需联网。
- **依赖粗估**：otpauth = 27.3 KB min / **10.3 KB gzip**（含 HOTP/TOTP/URI 全套）；自实现 0 依赖。
- **结论**：一线收录 + 双库 400-500 万/周 + 体积小甚至可零依赖；安全簇解禁后证据充分。

## 7. AES 加解密

- **流行度证据**：**A**。it-tools 的 [`encryption`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/encryption) 即 crypto-js 的 AES/TripleDES/Rabbit/RC4（源码 `import { AES, RC4, Rabbit, TripleDES } from 'crypto-js'`），CyberChef 有 `AESEncrypt`/`AESDecrypt`/`AESKeyWrap` 系操作；Omni Tools、DevToys 未收录。代表库 [crypto-js](https://github.com/brix/crypto-js)（16,396 ★）**2,604.9 万次/周**。
- **纯本地可行性**：✅ 现代 AES-GCM/CBC 用 WebCrypto 原生（0 依赖）；兼容「他人给的 passphrase 密文」（如 OpenSSL/老工具约定）需 crypto-js 的 EVP_BytesToKey 兼容路径。
- **依赖粗估**：WebCrypto 路线 0；crypto-js 按需 AES+模式子集 *粗估 ≈15 KB gzip*（全量 40+ KB）。
- **结论**：头部收录 + 周下载 2600 万级 + 0 依赖路线清晰；热点证据最强的一档。

## 8. JWT 非对称签名（RS256/ES256，导入 PEM 私钥）

- **流行度证据**：**A**。it-tools 有 `jwt-parser`（仅解码）+ `rsa-key-pair-generator`，DevToys 有 JWT，CyberChef 有 `JWTDecode`/`JWTSign`/`JWTVerify` 三操作；Omni Tools 未收录。生态：[jose](https://github.com/panva/jose)（7,863 ★，浏览器可用）**2.18 亿次/周**（生态依赖放大）、jsonwebtoken 8,087.4 万次/周（**Node-only，不可用**）。jwt.io 调试器为事实标准参考站（定性）。现有 `jwt-verifier` 已实现 HS256/RS256/ES256 **验证**——本候选 = 为其补「PEM 私钥导入 + 签名」能力。
- **纯本地可行性**：✅ WebCrypto 支持 RSASSA-PKCS1-v1_5/ECDSA 签名；PEM→Key 导入需 ASN.1（PKCS#8/SPKI）解析，jose 全覆盖。
- **依赖粗估**：jose = 59.3 KB min / **18.7 KB gzip**（0 依赖）；或 WebCrypto + 小型 ASN.1 解析器 *粗估 ≈5 KB*。
- **结论**：生态下载量最大的一类工具需求；以 jwt-verifier 扩展形态实现证据充分、体积友好。

## 9. 完整色板生成（邻近/三角/分裂互补等）

- **流行度证据**：**B+空白**。三家一线均**无**色板生成：it-tools `color-converter` 仅格式转换、DevToys Color Blind Simulator 是色觉模拟、Omni Tools `change-colors` 是改色。外部生态现象级产品 [coolors.co](https://coolors.co)（非开源，定性）。代表库：[chroma-js](https://github.com/gka/chroma.js)（10,607 ★）**432.6 万次/周**、[culori](https://github.com/Evercoder/culori)（1,247 ★）**569.0 万次/周**。现有 `color-converter` 为挂载点。
- **纯本地可行性**：✅ 调和色板 = 基色 + HSL/OKLCH 色相旋转 + 明度阶梯，数学简单，可 0 依赖自实现；导入导出可复用 color-converter 的格式层。
- **依赖粗估**：0（自实现）或 chroma-js 41.7 KB min / 16.5 KB gzip。
- **结论**：在线产品热度高但一线工具箱收录空白 = 明确的差异化机会，技术门槛与体积成本都最低。

## 10. 位调试展示（补码、位填充、字节序）

- **流行度证据**：**C（空白差异化）**。四家均无「补码/位填充/字节序」一体的位级可视化，但**相邻工具普遍存在**：it-tools `integer-base-converter` + `text-to-binary`、DevToys Number Base、Omni Tools `byte-converter`、CyberChef `BitShiftLeft/Right`/`ParityBit`/`ViewBitPlane`。直接竞品空白可能意味着需求偏小众。
- **纯本地可行性**：✅ BigInt + TypedArray/DataView 原生，0 依赖。现有 `base-converter` 为天然扩展位。
- **依赖粗估**：0。
- **结论**：无直接收录证据（热度证据最弱的种子候选），但零成本、差异化清晰；排序上宜靠后、与 base-converter 扩展合并评估。

## 11. 词频统计（Top-N）

- **流行度证据**：**B**。it-tools [`text-statistics`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/text-statistics) 仅计数统计（源码 0 处 frequency，无 Top-N 词频表）；Omni Tools 有 `string/statistic` 与 `list/find-most-popular`（相邻）；CyberChef `FrequencyDistribution` 是字符/字节分布（相邻）；DevToys 无。wordcounter 类站点属大众高频需求（定性）。现有 `text-stats` 为扩展位。
- **纯本地可行性**：✅ 英文按空白/标点切分 0 依赖；中文用 `Intl.Segmenter`（WebView2/Chromium 内建，word 粒度），0 依赖。
- **依赖粗估**：0。
- **结论**：相邻功能多家收录、纯正词频 Top-N 存在收录空白；零依赖，作为 text-stats 扩展成本低。

## 12. 测试数据生成器（假身份/姓名/地址/银行卡等成体系样本）

- **流行度证据**：**A 生态 + 工具箱空白**。[@faker-js/faker](https://github.com/faker-js/faker)（15,539 ★）**2,451.6 万次/周**——生态极热；但 it-tools（最接近仅 lorem-ipsum-generator）、Omni Tools、DevToys（Randomizer/Lorem Ipsum 相邻）、CyberChef 均**无**成体系假数据工具。Mockaroo 为在线 SaaS（定性）。
- **纯本地可行性**：✅ 全离线。按 locale 动态 import 数据块 *实测*：faker 最新发行包 `dist/zh_CN-*.js` = 68.1 KB raw / **25.2 KB gzip**，`dist/en-*.js` = 288.1 KB raw / 114.4 KB gzip（超预算）。银行卡/身份证等仅生成**测试样本**（非真实数据），文案需防误用声明。现有 `id-card-validator` 相邻可联动。
- **依赖粗估**：faker 按 locale 块懒加载（zh-CN 场景 25 KB，卡预算内）；或自实现 curated zh-CN 词表（姓名/地址/手机/卡号 Luhn）*粗估 ≤20 KB*，可控性最好。
- **结论**：生态热度顶级 + 一线工具箱收录空白 = 强差异化候选；体积方案清晰，是本轮「空白×热点」交叉最强的新工具候选。

## 13. 围栏代码语法高亮（Markdown 工具扩展，highlight.js/Shiki 路线）

- **流行度证据**：**A 生态**。生态下载顶级：[highlight.js](https://github.com/highlightjs/highlight.js)（25,011 ★）**5,057.1 万次/周**、[prismjs](https://www.npmjs.com/package/prismjs) **4,665.2 万次/周**、[shiki](https://github.com/shikijs/shiki)（13,904 ★）**3,611.8 万次/周**（VitePress/Docusaurus 标配）。it-tools 全局依赖 highlight.js（package.json `^11.7.0`）；DevToys Markdown Preview 带高亮（相邻）。本候选是现有 `markdown-html` 工具的扩展位。
- **纯本地可行性**：✅ 纯前端渲染；注意输出仍需经既有 DOMPurify 管线（高亮产物含 span/class，需确认 sanitize 白名单）。
- **依赖粗估**：highlight.js **common 构建 *实测* 129.3 KB raw / 43.5 KB gzip**（40 常用语言，卡进 50 KB 预算）；全量构建 87.7 KB gzip（超）；prism 核心仅 7.1 KB gzip + 按语言小文件；shiki 含 TextMate/Oniguruma 体系 *粗估 ≥300 KB gzip*（超预算，排除路线）。
- **结论**：生态热度为全部候选之最；hljs common 方案恰好卡线进预算；作为 markdown-html 扩展候选证据强。

## 14. 图片编辑族（裁剪、旋转、标注、AVIF 编码、预设尺寸组）

- **流行度证据**：**A**。Omni Tools `image/generic` 全家桶收录：`crop`/`rotate`/`resize`/`compress`/`editor`/`watermark`/`remove-background`/`split`——一线工具箱中收录最密集的一族；DevToys 有 Image Converter + PNG Compressor；[squoosh.app](https://squoosh.app)（Google，@jsquash 即其 wasm 重打包）为浏览器端标杆。代表库：[cropperjs](https://github.com/fengyuanchen/cropperjs)（13,912 ★）**278.7 万次/周**、[pica](https://www.npmjs.com/package/pica) **160.1 万次/周**、[@jsquash/avif](https://github.com/jamsinclair/jSquash) **22.1 万次/周**。现有 `image-resize` + `webp-converter`（ADR-0001 混合编码）为扩展基座。
- **纯本地可行性**：✅ 裁剪/旋转/翻转 = Canvas 原生 0 依赖；标注 = Canvas 2D 绘制层 0 依赖；预设尺寸组 = 现有 resize 能力组合；**AVIF 编码是唯一重件**（纯 WASM）。
- **依赖粗估**：裁剪 UI 若用 cropperjs = 49.8 KB min / **14.8 KB gzip**；pica 16.6 KB gzip（现有 Canvas 高质量缩放可复用，或不需要）；@jsquash/avif JS 7.9 KB gzip + **enc wasm 1.13 MB gzip / dec wasm 342 KB gzip**（*bundlephobia 实测资产*，懒加载独立 chunk，远超 JS 预算但有 webp wasm 114 KB 先例）。
- **结论**：一线收录最密集的一族，裁剪/旋转/标注/预设组证据强；建议族内切分——轻件（裁剪/旋转/标注/预设）成本低，AVIF 编码单独评估体积代价。

## 15. 口令族档位（passphrase 词表、PIN/十六进制预设、zxcvbn-ts 强度评估）

- **流行度证据**：**A**。三家全收录：it-tools `password-strength-analyser`（官方即基于 zxcvbn-ts）+ `token-generator`、Omni Tools `password-generator`、DevToys Password Generator。生态：[@zxcvbn-ts/core](https://github.com/zxcvbn-ts/zxcvbn)（1,241 ★）**239.7 万次/周**、zxcvbn 原版 **170.3 万次/周**（已停更）。EFF diceware passphrase 为通行实践（定性）。现有 `password-generator` 已含 word 模式与熵显示，为扩展基座。
- **纯本地可行性**：✅ 全离线。zxcvbn-ts 词包大是唯一张力点；强度评估可沿用上轮结论（Shannon 熵 + 模式启发，0 依赖）。
- **依赖粗估**：@zxcvbn-ts/core = 33.3 KB min / **11.1 KB gzip**，但 `@zxcvbn-ts/language-common` = **221.5 KB gzip**（超预算 4 倍+，en 语言包更大）；passphrase 词表（EFF 大列表 7,776 词）*粗估 ≈20 KB gzip*；PIN/hex 预设 0。
- **结论**：三家全收录、扩展基座现成；唯一取舍在强度评估（zxcvbn-ts 词包超预算 vs 自实现熵估计）。

---

## 16. 调研中新发现的热门候选（一线收录 × ForgeX 现无）

- **HTML 实体转义/反转义**：it-tools [`html-entities`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/html-entities)、DevToys Escape/Unescape 收录。0 依赖。常青小工具，热度 B。
- **Lorem ipsum 生成器**：it-tools `lorem-ipsum-generator`、DevToys Lorem Ipsum Generator 收录。0 依赖（内置词表）。热度 B-。
- **数学表达式求值**：it-tools [`math-evaluator`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/math-evaluator) 收录。可用受限自解析（0 dep）或 expr-eval *粗估 ≈6 KB gzip*（math.js 系 MB 级排除）。热度 B。
- **IPv4 子网/地址计算**：it-tools 一口气收录三个（`ipv4-subnet-calculator`/`ipv4-range-expander`/`ipv4-address-converter`）——收录密度即需求信号。0 依赖。受众偏网络运维，热度 B。
- **BIP39 助记词生成**：it-tools [`bip39-generator`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/bip39-generator) 收录。词表 2,048 词 *粗估 ≈13 KB gzip* + WebCrypto。受众偏钱包/加密，热度 B-。
- **TOML 转换**：it-tools 收录 `json-to-toml`/`toml-to-json`/`yaml-to-toml` 三个。现有 json-yaml 缺 TOML；@iarna/toml *粗估 ≈25 KB gzip*。热度 C+（配置场景）。
- 以上均建议作为「新发现池」随清单票据一并排序，不改变种子候选地位。

## 17. AI 类热点轻扫（参考结论，不进本轮清单）

生态热度硬数据（npm，2026-11-01 周窗口）：[openai](https://www.npmjs.com/package/openai) 5,544.1 万次/周、[js-tiktoken](https://www.npmjs.com/package/js-tiktoken) 1,227.8 万次/周、[jsonrepair](https://github.com/josdejong/jsonrepair)（2,414 ★）**559.6 万次/周**——后者正是「LLM 输出修复」场景带火的。

受「仅走用户自定义 OpenAI 兼容供应商机制、无内置账号」约束，值得后续轮次评估的形态：

1. **LLM 输出修复器（JSON/Markdown/CSV 修复）**：完全本地、无需 key，jsonrepair 一类依赖小（*粗估 ≈10 KB gzip*）——最契合「纯本地 + 热点」交叉的 AI 形态。
2. **Chat Playground / 请求调试台**：可配置 baseURL/key/model，流式 SSE 渲染 + 参数面板 + 系统提示词槽位；纯 fetch 本地直连，0 三方依赖（UI 成本为主）；与现有 ai-text-ops 互补。
3. **Prompt 模板管理/变量填充器**：纯本地存储 0 依赖，轻量但热度一般。
4. **Token 计数/成本估算器**：精确 tokenize 词表 1-2 MB 量级（*粗估*）且部分实现需在线取词表，离线打包贵；降级为 chars/4 启发式则 0 依赖。谨慎。
5. **批量翻译/润色工作台**：依赖用户供应商，本地任务队列管理；与 2 有组件重叠。

约束红线：内置模型、内置账号、平台代理/中转一律排除；所有网络调用经用户自定义供应商机制，key 仅本地存储。参考结论：后续轮次优先评估形态 1 与 2。

---

## 18. 汇总榜单（按热点证据强度；最终排序权在用户拍板）

| # | 候选 | 强度 | 一线收录 | 关键生态数据 | 依赖（gzip） | 与现状关系 |
|---|---|---|---|---|---|---|
| 1 | bcrypt 哈希/校验 | A | it-tools·Omni·CyberChef | bcryptjs 1,955.8 万/周 | bcryptjs 9.2 KB | 新工具或挂 hash-checksum |
| 2 | Cron 解析/生成 | A | it-tools·Omni·DevToys | cron-parser 3,134.8 万/周 | cronstrue 6.6 + cron-parser 29.6 KB | 新工具 |
| 3 | AES 加解密 | A | it-tools·CyberChef | crypto-js 2,604.9 万/周 | WebCrypto 0（兼容路径 ≈15 KB 粗估） | 新工具 |
| 4 | TOTP 验证器 | A | it-tools·CyberChef | otpauth 410.0 万 + otplib 503.9 万/周 | 10.3 KB 或 0 | 新工具 |
| 5 | 图片编辑族 | A | Omni 全家桶·DevToys | cropperjs 13,912 ★ | 轻件 0-14.8 KB；AVIF wasm 1.13 MB gz | 扩展 image-resize/webp-converter |
| 6 | URL 查询参数编辑器 | A | it-tools·Omni·DevToys | —（原生 API） | 0 | 扩展 url-codec 或新工具 |
| 7 | 图片↔Base64 | A | it-tools·DevToys·CyberChef·Omni | —（原生 API） | 0 | 扩展 base64-codec 或新工具 |
| 8 | JWT 非对称签名 | A | CyberChef·DevToys·it-tools(解码) | jose 2.18 亿/周 | jose 18.7 KB 或 ≈5 KB 粗估 | 扩展 jwt-verifier |
| 9 | SQL 格式化 | A | it-tools·DevToys·CyberChef | sql-formatter 700.8 万/周 | **74.3 KB（超预算）** | 新工具，规格需取舍 |
| 10 | 口令族档位 | A | it-tools·Omni·DevToys | zxcvbn-ts core 239.7 万/周 | core 11.1 KB 但词包 221.5 KB 超预算 | 扩展 password-generator |
| 11 | 围栏语法高亮 | A 生态 | it-tools(全局依赖)·DevToys 相邻 | hljs 5,057.1 万/周 | hljs common 43.5 KB（卡线） | 扩展 markdown-html |
| 12 | 测试数据生成器 | A 生态×空白 | 四家均无 | faker 2,451.6 万/周 | zh_CN 块 25.2 KB / 自实现 ≤20 KB 粗估 | 新工具 |
| 13 | 色板生成 | B×空白 | 四家均无 | chroma-js 432.6 万/周 | 0（自实现）或 16.5 KB | 扩展 color-converter |
| 14 | 词频 Top-N | B | 相邻收录（it-tools/Omni/CyberChef） | —（原生 API） | 0 | 扩展 text-stats |
| 15 | 位调试展示 | C×空白 | 相邻收录（四家） | —（原生 API） | 0 | 扩展 base-converter |

新发现池（按热度）：HTML 实体转义 > 数学求值 > IPv4 子网 > Lorem ipsum > BIP39 > TOML。

## 附录 A. 数据源

- npm 周下载（窗口 2026-10-26 → 2026-11-01，查询于 2026-11-03）：`https://api.npmjs.org/downloads/point/last-week/<pkg>`
- GitHub star（2026-11-03）：`https://api.github.com/repos/<owner>/<repo>`（DevToys 经 `gh api` 认证查询）
- bundlephobia 体积（2026-11-03）：`https://bundlephobia.com/api/size?package=<pkg>`
- 收录清单：it-tools `src/tools/` 目录与 `package.json`、Omni Tools `src/pages/tools/` 目录、DevToys https://devtoys.app/ 首页列表、CyberChef `src/core/operations/` 目录（均 2026-11-03 抓取）
- 本地实测（2026-11-03）：npm registry tarball 解包 + gzip -9——faker `dist/zh_CN-*.js` 68,055 B → 25,236 B gz、`dist/en-*.js` 288,142 B → 114,400 B gz；@highlightjs/cdn-assets `highlight.min.js`（common）129,254 B → 43,465 B gz、全量 `highlight.js` 348,904 B → 87,658 B gz
- 交叉佐证：it-tools 自身依赖选择（package.json：bcryptjs ^2.4.3、cronstrue ^2.26.0、crypto-js ^4.1.1、highlight.js ^11.7.0、sql-formatter ^13.0.0）；it-tools `encryption.vue` 源码（crypto-js AES/RC4/Rabbit/TripleDES）
