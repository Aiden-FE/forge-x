# ForgeX v0.5.0 — 候选池流行度调研

Wayfinder 地图: `.scratch/hot-tools-v0.5.0/issues/01-candidate-research.md`（ticket 01）
调研日期: 2026-11-04（npm 周下载为 2026-11-04 查询的 last-week 窗口 ≈2026-10-28→11-03；star/收录/体积均为 2026-11-04 抓取或当日实测。标注**〔基线〕**者为 v0.4.0 调研（2026-11-03）数据直接复用，隔一天无需重取）。

## 0. 口径与基线

- **硬约束**（map Notes Standing）：纯本地计算；需自建后端/外部在线数据的工具出局；大词库类中文工具排除；AI 类仅走现有自定义供应商机制；**本轮单工具体积不设门槛**（如实记录，供清单票与按需载入改造参考）。
- **现有工具基线（33 个）**：aes-cipher, ai-text-ops, base-converter, base64-codec, bcrypt-hash, color-converter, cron-tool, csv-json, diffchecker, exif-tool, hash-checksum, html-entity, id-card-validator, image-resize, ipv4-subnet, json-formatter, json-yaml, jwt-verifier, markdown-html, math-eval, password-generator, qr-generator, regex-tester, sql-formatter, test-data-generator, text-case, text-stats, timestamp-converter, totp-generator, url-codec, url-query-editor, uuid-generator, webp-converter。种子中的扩展候选均已做**本地源码核查**确认「现无该能力」（见各节）；另核查出 uuid-generator **已含 ULID**、hash-checksum **已含 HMAC（文本模式）**——这两个从新发现扫描中排除。
- **一线工具箱参照系**（star 于 2026-11-04 经 GitHub API 复取；收录判定：it-tools `src/tools/` 目录 86 个工具目录与 Omni `src/pages/tools/` 111 个工具页均为当日 API 枚举，DevToys 沿用**〔基线〕**2026-11-03 官网列表，CyberChef `src/core/operations/` 当日枚举关键操作）：[it-tools](https://github.com/CorentinTh/it-tools) 41,112 ★、[DevToys](https://github.com/veler/DevToys) 32,184 ★、[CyberChef](https://github.com/gchq/CyberChef) 36,312 ★、[Omni Tools](https://github.com/iib0011/omni-tools) 10,602 ★。
- **体积口径**：bundlephobia API 本轮失效（返回异常），改用 **npm tarball 解包 + .NET GZipStream(Optimal) 本地实测**（口径≈gzip -9，2026-11-04）；**〔基线〕**体积沿用 v0.4.0 的 bundlephobia/本地实测。**粗估** = 组合估算未单独验证。
- **证据强度**：A = 多家一线同时收录/同款能力 + 生态硬数据强；B = 一线部分收录或专用站/生态热；C = 相邻或空白（差异化机会，需求证据弱）。
- **本地依赖在位事实**（扩展候选边际成本的依据，`package.json` 2026-11-04）：`qrcode-generator@^2.0.4`（qr-generator 引擎）、`highlight.js@^11.12.0`（markdown-html 预览，触达加载）、`marked@^18.1.2` + `turndown@^7.2.4`、`dompurify@^3.4.17`。

---

## 1. IPv6 子网计算（新工具；v0.4.0 明示「单独轮次」）

- **流行度证据**：**B+**。四家一线均无 IPv6 子网计算器——it-tools 仅 [`ipv6-ula-generator`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/ipv6-ula-generator)（ULA 地址生成，非子网计算；2026-11-04 目录枚举）；CyberChef 有 [`ParseIPv6Address`](https://github.com/gchq/CyberChef/tree/master/src/core/operations)/`ChangeIPFormat`/`IPv6TransitionAddresses` 相邻操作（当日枚举），无子网切分；专用站已产品化：[subnetcalculator.org](https://subnetcalculator.org/) 提供 IPv6 Subnet Calculator（128 位前缀、压缩/展开、/64 计数）。生态：[ip-address](https://www.npmjs.com/package/ip-address) **13,206.3 万次/周**（多作间接依赖，IPv4+IPv6 解析）、netmask 3,342.8 万/周（IPv4-only）。
- **纯本地可行性**：✅ 128 位整数运算走 BigInt 原生，无任何在线依赖。
- **依赖体积**：自实现 **0**（≈ipv4-subnet 的 BigInt 放大版）；库路线 ip-address dist 全量 *实测* 93,221 B raw / ≈25.2 KB gz（五文件分别压缩求和，2026-11-04）。
- **结论**：值得进排序——专用站需求实、一线空白=差异化，v0.4.0 既定议程。

## 2. VLSM 不等分规划（ipv4-subnet 扩展位）

- **流行度证据**：**B**。四家一线均无 VLSM：it-tools `ipv4-subnet-calculator` 为等分口径**〔基线〕**；ForgeX ipv4-subnet 源码明示「等分切分……VLSM 不做」（`subnet.ts` 等分注释）。专用站佐证：[subnetcalculator.org 的 VLSM Subnet Planner](https://subnetcalculator.org/vlsm-calculator)（站内标注 "CCNA Tool"），并以其对标遗留桌面标准 SolarWinds IP Subnet Calculator 的叙述侧证品类存续；CCNA/CompTIA Network+ 教学刚需（定性）。
- **纯本地可行性**：✅ 纯整数规划（按主机数降序贪心对齐前缀）。
- **依赖体积**：**0**。
- **结论**：值得——需求有专用站与教学场景佐证、成本零；一线无收录既是空白也提示受众窄于等分，排序中等。

## 3. IP 区间反推 CIDR（ipv4-subnet 扩展位）

- **流行度证据**：**A-**。it-tools 专设 [`ipv4-range-expander`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/ipv4-range-expander)（给定起止 IP → 最小 CIDR 集合；2026-11-04 目录枚举），且其 service 为 0 三方依赖自实现（`ipv4ToInt` + `convertBase`，源码当日核验）；CyberChef 有 `ParseIPRange` 操作；专用站 [subnetcalculator.org 的 IP Range to CIDR](https://subnetcalculator.org/ip-range-calculator)。〔基线〕it-tools 连收三个 IPv4 工具的密度判断仍成立。
- **纯本地可行性**：✅ 32 位整数与最长前缀匹配。
- **依赖体积**：**0**（it-tools 同款自实现口径）。
- **结论**：值得——专工具+专用操作+专用站三重收录佐证，种子中证据最强之一。

## 4. HOTP 计数器模式（totp-generator 扩展位）

- **流行度证据**：**B+**。CyberChef 有 `GenerateHOTP`**〔基线〕**；it-tools OTP 工具 service 层自带 `generateHOTP`/`verifyHOTP`（用于校验窗口，未暴露计数器 UI；源码 2026-11-04 核验）；[otpauth](https://www.npmjs.com/package/otpauth) HOTP/TOTP/URI 全套 **408.3 万次/周**（2026-11-04）。
- **纯本地可行性**：✅。ForgeX `totp.ts` 已有 RFC 4226 `hotp()` 内核与测试向量，增量=计数器条目形态/UI，纯本地。
- **依赖体积**：**0**。
- **结论**：值得——边际成本极低的完整性补齐；一线 UI 级 HOTP 模式少见，热度中等、排序中游。

## 5. otpauth QR 码展示/导流 qr-generator（跨工具联动）

- **流行度证据**：**B+**。it-tools OTP 工具**内嵌 QR 展示**：`import { useQRCode } from '../qr-code-generator/useQRCode'` + `<n-image :src="qrcode" />`（源码 2026-11-04 核验）——即「复用 QR 工具引擎内嵌展示」的跨工具先例；CyberChef 有 `GenerateQRCode`/`ParseQRCode` 操作；认证器生态（Google Authenticator/Aegis 导入导出）以 otpauth QR 为事实标准（定性）。
- **纯本地可行性**：✅。ForgeX totp-generator 已有 `buildOtpauthUri` 导出（复制迁移用，源码注释明示「去 QR 工具生成二维码；本工具不内嵌 QR」= 显式预留位）；qr-generator 引擎 `qrcode-generator@^2.0.4` 已在依赖树。
- **依赖体积**：**0**（复用既有 qrcode-generator）。
- **结论**：值得——it-tools 同款模式可原样移植，跨工具导流有产品级先例。

## 6. OKLCH 色彩空间（color-converter 族级决策）

- **流行度证据**：**B+**。[oklch.com](https://oklch.com/) 为现象级 OKLCH 拾色器/转换器（Evil Martians 出品，[evilmartians/oklch-picker](https://github.com/evilmartians/oklch-picker) 2,018 ★，2026-11-04）；OKLCH 属 CSS Color 4、现代浏览器全支持（oklch.com 站内 Browsers 链接）；生态：culori 569.0 万/周**〔基线〕**（全量 bundled *实测* 63,630 B raw / 23.7 KB gz，2026-11-04）、chroma-js 432.6 万/周**〔基线〕**。四家一线色彩工具均无 OKLCH（it-tools color-converter 为 hex/rgb/hsl 等格式族、Omni `change-colors` 为改色）= 空白。
- **纯本地可行性**：✅ OKLCH↔sRGB 是固定矩阵/非线性步骤（CSS Color 4 公式），可 0 依赖自实现。
- **依赖体积**：自实现 **0**；或 culori 全量 *实测* 23.7 KB gz。
- **结论**：值得——第二色彩空间的族级决策有产品与生态热度支撑；palette（HSL 规则）已入 color-converter，OKLCH 是自然延伸。

## 7. 导出带高亮 HTML（markdown-html 扩展位）

- **流行度证据**：**B**。ForgeX markdown-html 已有 hljs 预览（`highlight.ts` 触达加载管线，源码核验），「输出即语义」（复制/下载输出保持裸 `<pre><code>`）是既有取舍——本候选=为导出提供「带 hljs span/自带样式」的形态。生态：marked **12,194.9 万次/周**（2026-11-04）+ highlight.js 5,057.1 万/周**〔基线〕**是 markdown 渲染标配组合；DevToys Markdown Preview 带高亮渲染**〔基线〕**（相邻）；文档站/博客导出常需自带高亮样式（定性）。
- **纯本地可行性**：✅ hljs 与明暗两套主题样式已在包内（触达加载，懒加载约定满足）。
- **依赖体积**：边际 **≈0**（复用已装 hljs common chunk 43.5 KB gz**〔基线实测〕**；可选内联样式 *粗估 ≤2 KB*）。
- **结论**：值得——全池边际成本最低候选之一；规格只需定「语义输出 vs 高亮输出」的口径与开关。

## 8. 非 ASCII 数字转义开关（html-entity 扩展位）

- **流行度证据**：**B-**。[he](https://www.npmjs.com/package/he) **5,559.0 万次/周**（2026-11-04），其 `encode` 原生支持非 ASCII 字符数字转义选项（he README API，定性）；it-tools html-entities 用 he**〔基线〕**。ForgeX escape 仅五个必需实体、非 ASCII 原样保留（`htmlEntity.ts` 转义表 + spec「a1中😀」用例，源码核验）；v0.4.0 票已出界「全表命名转义/属性值上下文」，本候选仅数字转义开关，不回升出界项。
- **纯本地可行性**：✅ 码点→`&#xHHHH;` 纯查表；unescape 方向的全表/数字解析已在库内。
- **依赖体积**：**0**。
- **结论**：可进排序但靠后——需求真实但低频，成本近零。

## 9. 种子复现（test-data-generator 扩展位）

- **流行度证据**：**B+**。`faker.seed()` 为生态头牌的一等 API（[官方 API 文档](https://fakerjs.dev/api/faker#seed)「Reproducible Results」，2026-11-04 抓取；@faker-js/faker 2,434.8 万/周）；Mockaroo 等在线假数据产品提供 seed 复现（定性）；一线工具箱无成体系假数据工具**〔基线〕**= ForgeX 已占空白，能力对标对象即 faker 本身——**能力级**：假数据工具带种子是生态标配，一线无竞品不构成反证。
- **纯本地可行性**：✅。ForgeX generator 全链按 Rng 注入设计（生产 Math.random、测试 mulberry32），`cnId.ts` 明示「不做种子复现」为显式预留位；扩展=确定性 PRNG + seed 展示/回填。
- **依赖体积**：**0**。
- **结论**：值得——测试确定性刚需 + 架构预留位现成，低成本高感知。

## 10. 文件/批量加密（aes-cipher 扩展位）

- **流行度证据**：**B+**。[age](https://github.com/FiloSottile/age) **24,191 ★**（2026-11-04）为现代文件加密生态锚点；[hat.sh](https://hat.sh/) 为浏览器端流式文件加密产品（定性）；CyberChef 全操作支持文件拖拽输入（含 AES 系）**〔基线〕**；Omni Tools pdf/image 全家桶证明一线对重文件本地处理的先例**〔基线〕**。it-tools/DevToys 均无文件加密=空白。
- **纯本地可行性**：✅ WebCrypto AES-GCM 分块加密 0 依赖；工程点在流式内存管理（大文件不全量入内存）与批量 zip 输出（沿 WebP 先例）；文件输入尺寸上限需新约定（现有粘贴 1 MiB/图片 20 MiB 不直接适用）。
- **依赖体积**：**0**（WebCrypto 分块 + 自定 magic header/salt/nonce 封装）。
- **结论**：值得——aes-cipher 的自然族扩展；规格需定分块口径、尺寸上限与密文文件命名。

## 11. OpenSSL/第三方密文兼容（aes-cipher 扩展位）

- **流行度证据**：**A-**。it-tools [`encryption`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/encryption) 即 crypto-js（源码 `import { AES, RC4, Rabbit, TripleDES, enc } from 'crypto-js'` + 口令式 `encrypt(input, secret)`，2026-11-04 核验）——crypto-js 口令模式默认产出 **OpenSSL `Salted__`/EVP_BytesToKey 格式**，与 `openssl enc` 互通（crypto-js 官方 README 口径，定性；**〔基线〕**crypto-js 2,604.9 万/周）；`openssl enc` 为命令行互操作事实标准，「解别人发来的 openssl 密文」是高频真实场景（定性）。ForgeX aes-cipher 明示「不承诺解密 OpenSSL（Salted__）等第三方工具的密文」（`aes.ts`，源码核验）= 显式出界点，本轮为重开该决策。
- **纯本地可行性**：✅ EVP_BytesToKey（MD5 KDF）+ CBC 解析自实现可行，纯本地。
- **依赖体积**：自实现 *粗估 ≈2 KB*；或 crypto-js AES 子集 *粗估 ≈15 KB***〔基线〕**。
- **结论**：值得——互操作是加密工具最真实痛点，补齐即对齐 it-tools 同款能力；属种子中证据最强一档。

## 12. 任意角度旋转（image-resize 编辑管线扩展）

- **流行度证据**：**B-**。一线批量旋转均为 90° 步进（Omni `image/generic/rotate`；ForgeX 现状同为 0/90/180/270，`edit.ts` 明示「任意角度出界（画布扩展与空白角填充是另一族问题）」，源码核验）；任意角度存在于**编辑器形态**：Omni `image/generic/editor`（全家桶编辑器，2026-11-04 目录枚举）与裁剪库 cropperjs 278.7 万/周**〔基线〕**（带任意角度）；squoosh 旋转为 90° 步进（定性）。
- **纯本地可行性**：✅ Canvas `ctx.rotate` 任意角度 0 依赖；难点=外接矩形尺寸计算与空白角填充策略（透明 vs 底色），种子描述已点出。
- **依赖体积**：**0**。
- **结论**：中性偏可做——批量场景证据弱于 90° 旋转，若进排序需先定画布扩展/填充决策（规格层）。

## 13. AVIF 编码（落选重入）

- **流行度证据**：**B**。squoosh 标配 AVIF**〔基线定性〕**；@jsquash/avif **21.5 万次/周**（2026-11-04；〔基线〕22.1 万/周基本持平）；[jSquash](https://github.com/jamsinclair/jSquash) 741 ★（2026-11-04）。
- **纯本地可行性**：✅ wasm 独立 chunk 懒加载（webp wasm 114 KB 先例**〔基线〕**）。
- **依赖体积**：**enc wasm 1.13 MB gzip〔基线实测〕——全池最大单件、头号体积红旗**（本轮无门槛，如实记录；收益 vs webp 需规格/清单票论证）。
- **结论**：值得进排序但单独权衡体积代价与编码收益。

## 14. LLM 输出修复器（AI 类普通候选；仅自定义供应商约束下天然合规）

- **流行度证据**：**A-**。[jsonrepair](https://www.npmjs.com/package/jsonrepair) **566.6 万次/周**（2026-11-04；〔基线〕559.6 万/周仍上行）；作者提供官方在线工具（定性）；四家一线均无 JSON 修复工具 = **热点×空白**交叉；完全本地、无需 key、不涉网络，是「仅自定义供应商」约束下零冲突的 AI 形态。
- **纯本地可行性**：✅ 纯文本修复（截断补全/引号/尾逗号/注释剥离/单引号等）。
- **依赖体积**：jsonrepair UMD min *实测* 7,436 B raw / **3.0 KB gz**（2026-11-04；ESM 核心文件 25.7 KB raw 未压缩口径同量级）——几乎免费。
- **结论**：值得，**榜首集团**——生态热度、体积、本地性三优；Markdown/CSV 修复扩展可留后续。

## 15. BIP39 助记词（落选重入）

- **流行度证据**：**B**。it-tools [`bip39-generator`](https://github.com/CorentinTh/it-tools/tree/main/src/tools/bip39-generator)（2026-11-04 目录仍在）**〔基线〕**；[@scure/bip39](https://www.npmjs.com/package/@scure/bip39) **1,341.8 万次/周**（audited 系，2026-11-04）、bip39 原版 116.0 万/周。
- **纯本地可行性**：✅ WebCrypto 随机 + 词表查表 + BIP39 校验和。
- **依赖体积**：@scure/bip39 *实测* index 12,139 B raw / 3.3 KB gz + english 词表 13,217 B raw / 6.6 KB gz ≈ **10 KB gz 全套**（2026-11-04）；自实现同量级。
- **结论**：值得——上轮出局主因（50 KB 门槛时代词表 ≈13 KB 粗估偏贵）本轮门槛已撤；受众偏钱包/加密但证据与体积皆健康。

## 16. TOML 转换（落选重入；可议 json-yaml 扩展同议）

- **流行度证据**：**B+**。it-tools 收 **4 个** TOML 工具（`json-to-toml`/`toml-to-json`/`toml-to-yaml`/`yaml-to-toml`，2026-11-04 目录枚举；〔基线〕记 3 个，现仍 4 目录）；生态已换代：[smol-toml](https://www.npmjs.com/package/smol-toml) **6,244.4 万次/周**、@iarna/toml 1,178.1 万/周（均 2026-11-04）。
- **纯本地可行性**：✅ 纯文本解析/序列化。
- **依赖体积**：smol-toml dist *实测* 1,949 B raw / **999 B gz**（2026-11-04）——几乎免费；@iarna/toml ≈25 KB gz〔基线粗估〕不再推荐。
- **结论**：值得——it-tools 收录密度 + 1 KB 级依赖；扩展 json-yaml vs 新工具由清单票定。

## 17. zxcvbn-ts 强度评估（落选重入）

- **流行度证据**：**B**。it-tools `password-strength-analyser` 官方即 zxcvbn-ts**〔基线〕**；@zxcvbn-ts/core **240.9 万次/周**（2026-11-04；〔基线〕239.7 万持平）。
- **纯本地可行性**：✅ 全离线。
- **依赖体积**：core 11.1 KB gz + `language-common` 词包 **221.5 KB gz〔基线实测〕——红旗不变**；core 无词包则模式匹配能力降级（熵估计替代路线 v0.4.0 已备）。
- **结论**：可进排序但先决问题不变——接受词包懒加载 vs 自实现熵估计，留规格票取舍。

---

## 18. 新发现的热门候选（一线工具箱收录 × ForgeX 现无）

> 扫描口径：it-tools 86 工具目录 + Omni 111 工具页（均 2026-11-04 API 枚举）+ DevToys〔基线〕列表 + CyberChef 操作目录，逐一对照 ForgeX 33 工具与 17 种子的扩展位。

1. **XML 格式化/校验/互转族**：it-tools `xml-formatter` + `xml-to-json`、Omni `xml/xml-beautifier` + `xml/xml-validator`——两家一线四件，密度最高；[xml-formatter](https://www.npmjs.com/package/xml-formatter) 177.5 万/周。ForgeX 无任何 XML 工具。*实测* 7,533 B raw / 2.0 KB gz（2026-11-04）。**新发现榜首**。
2. **JSON 结构化 diff**：it-tools `json-diff` + Omni `json/json-comparison` 两家；[deep-diff](https://www.npmjs.com/package/deep-diff) 470.0 万/周 + json-diff 159.3 万/周（2026-11-04）。ForgeX diffchecker 为行级文本 diff，结构化语义 diff 是增量。0 依赖（树遍历+路径标记）或库 *粗估 ≈5 KB*。
3. **WiFi QR 码**：it-tools `wifi-qr-code-generator`；QR 生态 qrcode 3,934.3 万/周。qr-generator 引擎已在依赖树，`WIFI:T:WPA;S:...` 纯模板拼接，边际 **0**。扩展 qr-generator。
4. **RSA/EC 密钥对生成**：it-tools `rsa-key-pair-generator`；WebCrypto 原生生成 0 依赖，PEM 导出需 ASN.1 编码（SPKI/PKCS#8）*粗估 ≈5 KB*；与 jwt-verifier 既有 PEM 解析对称。
5. **docker run → compose 转换**：it-tools `docker-run-to-docker-compose-converter`；纯本地 shell 词法解析+YAML 模板可 0 依赖（it-tools 自实现口径）。受众 DevOps。
6. **chmod 权限计算器**：it-tools `chmod-calculator`；0 依赖，小而常青的 Linux 运维工具。
7. **Lorem ipsum 生成器**：it-tools + DevToys 两家〔基线〕；0 依赖；v0.4.0 新发现池遗留未收；test-data-generator `LOREM_WORDS` 词表可复用（扩展或独立由清单票定）。
8. **小众观察**（收录单家、需求窄，不占榜）：MAC 地址生成器、keycode-info、basic-auth-generator（均 it-tools、均 0 依赖）。
9. **扫描后出局**（一线有收录但判不进池）：mac-address-lookup（OUI 库=外部数据/大词库）、user-agent-parser（UA 规则库重且需持续更新）、phone-parser-and-formatter（libphonenumber 数据库大）、camera-recorder/chronometer/device-information（非纯计算/设备依赖）、pdf/video/audio 族（Omni 全有，但 ffmpeg/ghostscript wasm 重件，本轮不议）、temperature/roman-numeral/NATO/emoji-picker/ascii-text-drawer/numeronym/percentage/eta-calculator（通用或玩具类）、git-memo/regex-memo/http-status-codes/mime-types（静态参考资料弱交互）、html-wysiwyg-editor（重编辑器）、safelink-decoder/email-normalizer/slugify-string/string-obfuscator/svg-placeholder-generator（小众或相邻已覆盖）、json-minify/json-viewer/yaml-viewer/text-to-binary/text-to-unicode（ForgeX json-formatter/json-yaml/base-converter 主体已覆盖）、**barcode**（jsbarcode 268.8 万/周生态热但四家一线**均无**收录，不符「一线×空白」标准，留观察）。

---

## 19. 汇总榜单（按热点证据强度；最终排序权在用户拍板）

| # | 候选 | 强度 | 一线收录 | 关键生态数据 | 依赖（gzip） | 与现状关系 |
|---|---|---|---|---|---|---|
| 1 | LLM 输出修复器 | A- | 一线空白×热点 | jsonrepair 566.6 万/周 | 3.0 KB 实测 | 新工具 |
| 2 | OpenSSL/第三方密文兼容 | A- | it-tools 同款能力 | crypto-js 2,604.9 万/周〔基线〕 | 自实现 ≈2 KB 粗估 | 扩展 aes-cipher |
| 3 | IP 区间反推 CIDR | A- | it-tools 专工具·CyberChef·专用站 | — | 0 | 扩展 ipv4-subnet |
| 4 | XML 格式化/校验族（新发现） | A- | it-tools×2·Omni×2 | xml-formatter 177.5 万/周 | 2.0 KB 实测 | 新工具族 |
| 5 | IPv6 子网计算 | B+ | CyberChef 相邻·专用站 | ip-address 13,206.3 万/周（间接） | 0 或 25.2 KB | 新工具 |
| 6 | OKLCH 色彩空间 | B+ | oklch.com 现象级·一线空白 | culori 569.0 万/周〔基线〕 | 0 或 23.7 KB | color-converter 族级 |
| 7 | HOTP 计数器模式 | B+ | CyberChef·it-tools(service) | otpauth 408.3 万/周 | 0（内核已有） | 扩展 totp-generator |
| 8 | otpauth QR 展示/导流 | B+ | it-tools 内嵌 QR·CyberChef | qrcode 3,934.3 万/周 | 0（复用引擎） | totp×qr 联动 |
| 9 | 种子复现 | B+ | faker.seed 一等 API | @faker-js/faker 2,434.8 万/周 | 0 | 扩展 test-data-generator |
| 10 | 文件/批量加密 | B+ | age 生态·CyberChef 文件输入 | age 24,191 ★ | 0（WebCrypto 分块） | 扩展 aes-cipher |
| 11 | TOML 转换 | B+ | it-tools×4 | smol-toml 6,244.4 万/周 | 1.0 KB 实测 | json-yaml 扩展或新 |
| 12 | JSON 结构化 diff（新发现） | B+ | it-tools·Omni | deep-diff 470.0 万/周 | 0 或 ≈5 KB 粗估 | 扩展 diffchecker 或新 |
| 13 | VLSM 不等分规划 | B | 专用站（CCNA）·一线空白 | — | 0 | 扩展 ipv4-subnet |
| 14 | BIP39 助记词 | B | it-tools | @scure/bip39 1,341.8 万/周 | ≈10 KB 实测 | 新工具 |
| 15 | zxcvbn-ts 强度评估 | B | it-tools 官方同款 | @zxcvbn-ts/core 240.9 万/周 | core 11.1 KB + 词包 221.5 KB 红旗 | 扩展 password-generator |
| 16 | AVIF 编码 | B | squoosh 标配〔基线〕 | @jsquash/avif 21.5 万/周 | wasm 1.13 MB 红旗 | 扩展 webp-converter |
| 17 | 导出带高亮 HTML | B | DevToys 相邻〔基线〕 | marked 12,194.9 万/周 | 边际 ≈0（hljs 已装） | 扩展 markdown-html |
| 18 | WiFi QR 码（新发现） | B | it-tools | qrcode 3,934.3 万/周 | 0 | 扩展 qr-generator |
| 19 | RSA/EC 密钥对生成（新发现） | B | it-tools | — | 0 或 ≈5 KB 粗估 | 新工具 |
| 20 | docker run→compose（新发现） | B- | it-tools | — | 0 | 新工具 |
| 21 | chmod 计算器（新发现） | B- | it-tools | — | 0 | 新工具 |
| 22 | 非 ASCII 数字转义开关 | B- | he 生态 | he 5,559.0 万/周 | 0 | 扩展 html-entity |
| 23 | Lorem ipsum 生成器（新发现） | B- | it-tools·DevToys | — | 0 | test-data 扩展或新 |
| 24 | 任意角度旋转 | B- | Omni editor 相邻 | cropperjs 278.7 万/周〔基线〕 | 0 | 扩展 image-resize |
| 25 | （观察）MAC 生成/keycode/basic-auth/barcode | C+ | it-tools 各一（barcode 一线无） | jsbarcode 268.8 万/周 | 0 / barcode ≈2.2 KB 入口实测 | — |

**体积红旗仅两件**：AVIF enc wasm 1.13 MB gz、zxcvbn-ts language-common 词包 221.5 KB gz（均〔基线实测〕，本轮不设门槛、按需载入改造前仅作参考）。

**跨工具共享重依赖评估：无。** hljs（markdown-html 已装，导出扩展复用边际 0）、qrcode-generator（qr-generator 已装，QR 联动复用边际 0）、IP 数学全 0 依赖自实现（netmask 0.9 KB/ip-address 25.2 KB 实测均轻量）、AVIF wasm 与 zxcvbn 词包均为单工具单点——不构成「多个候选依赖同一重库」，**无需开汇总依赖决策票**。

---

## 附录 A. 数据源

- npm 周下载（2026-11-04 查询，last-week 窗口 ≈2026-10-28→11-03）：`https://api.npmjs.org/downloads/point/last-week/<pkg>`；〔基线〕窗口 2026-10-26→11-01 于 2026-11-03 查询。
- GitHub star/收录（2026-11-04，GitHub contents/trees/repos API + 源码核验）：it-tools `src/tools/`（86 目录）、Omni Tools `src/pages/tools/`（111 页）、CyberChef `src/core/operations/`（关键操作：ParseIPv6Address/ChangeIPFormat/IPv6TransitionAddresses/ParseIPRange/GenerateQRCode/ParseQRCode 等）、age/oklch-picker/jSquash stars。
- 源码核验（2026-11-04）：it-tools `otp-code-generator-and-validator`（service 层 generateHOTP/verifyHOTP；主组件 `useQRCode` 复用 qr-code-generator 内嵌 QR）、it-tools `encryption.vue`（crypto-js 口令式 AES）、it-tools `ipv4-range-expander`（0 依赖自实现）；ForgeX 本地源码（totp/ipv4-subnet/html-entity/test-data-generator/aes-cipher/image-resize/markdown-html/color-converter/uuid-generator/hash-checksum 的「现无/已有」结论均注明文件）。
- 本地实测体积（2026-11-04，npm tarball 解包 + .NET GZipStream Optimal）：smol-toml 1,949→999 B；@scure/bip39 12,139→3,340 B + english 词表 13,217→6,566 B；xml-formatter 7,533→1,956 B；jsonrepair UMD min 7,436→3,044 B；culori bundled 63,630→23,652 B；ip-address dist 五文件 93,221 B raw（分别 gzip 求和 ≈25.2 KB）；netmask 2,542→870 B；jsbarcode 入口 6,998→2,176 B（入口疑为壳，全量粗估 ≈15-20 KB）。
- 〔基线〕实测/粗估（2026-11-03，v0.4.0 调研复用）：hljs common 43.5 KB gz；@zxcvbn-ts/language-common 221.5 KB gz；@jsquash/avif enc wasm 1.13 MB gz；faker zh_CN 25.2 KB gz / en 114.4 KB gz；cropperjs 14.8 KB gz；crypto-js AES 子集 ≈15 KB 粗估；@iarna/toml ≈25 KB 粗估。
- 站点佐证（2026-11-04 抓取）：[subnetcalculator.org](https://subnetcalculator.org/)（IPv4/IPv6/VLSM Planner/Subnet Splitter/IP Range to CIDR/Supernet 全家 + SolarWinds 对标叙述）、[oklch.com](https://oklch.com/)（Evil Martians OKLCH Picker & Converter）、[fakerjs.dev/api/faker#seed](https://fakerjs.dev/api/faker#seed)（seed 一等 API）、[hat.sh](https://hat.sh/)（浏览器文件加密产品）。
