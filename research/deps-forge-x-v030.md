# ForgeX v0.3.0 — 五个依赖敏感工具的选型调研

Wayfinder 地图: `.scratch/hot-tools-v0.3.0/issues/02-dependency-research.md`（ticket 02）
调研日期: 2026-10-28。

## 0. 口径与硬约束

- **硬约束**: 纯客户端、无后端、离线可用；需在现代浏览器与 Tauri 2 WebView（Windows = WebView2/Chromium，macOS = WKWebView，Linux = WebKitGTK）内运行。候选中凡依赖 Node 内建模块（`fs`、`stream`、`Buffer` polyfill）或需联网的，一律降级或排除。
- **体积口径**: 以 bundlephobia 的 min+gzip 为基准（查询于 2026-10-28，已对推荐项用 unpkg/jsDelivr 原始文件 + 本地 `gzip -9` 交叉复核，两数吻合）。标注 *≈* 者为组合估算或未单独压缩验证的近似值；标注 *(raw)* 者为未压缩发行文件的实测字节。
- **哈希/JWT 两工具不在本调研范围**（已存在，无需新依赖）。

### 现状：懒加载机制（影响所有体积结论）

- `src/router/index.ts` 用 `import.meta.glob('../tools/*/index.ts', { eager: true })` 注册工具；各 `index.ts`（如 `src/tools/webp-converter/index.ts`）**静态 import** 自己的 Vue 组件。Vite 无 `manualChunks`（`vite.config.ts`）。
- **后果**: 工具组件及其**静态** import 的第三方依赖目前全部进主入口 chunk——现有 `diff`、`js-yaml`、`jszip`、`qrcode-generator` 都在主 chunk 里。只有**动态** `import()` 的依赖才单独 split（先例：`src/tools/webp-converter/encode.ts` 对 `@jsquash/webp` 的 dynamic import）。
- 因此“按路由懒加载”并非当前事实，而是需要规格明确的前置条件：**新工具的依赖必须在工具内部 dynamic import**（或把 `ToolMeta.component` 改为 `() => import(...)` 异步组件）。下文按此约定估算 web 侧影响（见 §6）。

---

## 1. CSV ↔ JSON（含 TSV）

| 候选 | 许可证 | min+gzip | 能力要点 | 浏览器/WebView 兼容 |
|---|---|---|---|---|
| **papaparse 5.7.0**（推荐） | MIT（[LICENSE](https://unpkg.com/papaparse@5.7.0/LICENSE)、[npm](https://www.npmjs.com/package/papaparse)） | 18.7 KB / 6.8 KB（[bundlephobia](https://bundlephobia.com/package/papaparse@5.7.0)，复核 unpkg 18,874 B → gz 6,858 B），0 依赖 | 引号字段/转义引号、字段内换行、CRLF、BOM（源码 [`stripBom`](https://github.com/mholt/PapaParse/blob/5.7.0/papaparse.js) 明确剥离 UTF-8 BOM）、分隔符自动猜测含 `\t`（TSV）、web Worker、流式、错误定位（行号） | 纯浏览器优先（官方定位即浏览器库），UMD/ESM 均可；Worker 走 blob，CSP `script-src 'self'` 无冲突 |
| csv-parse 7.0.3 + csv-stringify 6.9.0 | 均 MIT（[parse](https://www.npmjs.com/package/csv-parse)、[stringify](https://www.npmjs.com/package/csv-stringify)） | 31.8 KB / 8.1 KB + 12.0 KB / 3.8 KB ≈ 44 KB / 12 KB | 面向 Node 的流式 API；浏览器需走 `dist/umd`、`sync` API；无 BOM 自动剥离承诺 | 可用但非浏览器优先；API 心智负担大 |
| d3-dsv 3.0.1 | ISC（[LICENSE](https://unpkg.com/d3-dsv@3.0.1/LICENSE)、[npm](https://www.npmjs.com/package/d3-dsv)） | 3.2 KB / 1.4 KB | 引号转义、CRLF、引号内换行均可（源码 [dsv.js](https://github.com/d3/d3-dsv/blob/v3.0.1/src/dsv.js) 状态机处理 `QUOTE/RETURN/NEWLINE`）；**不处理 BOM**（需手动 strip）、无分隔符自动猜测（需分别调 `csvParse`/`tsvParse`）、无错误报告 | 纯浏览器，无依赖问题 |
| 原生手写（不推荐） | — | 0 | CSV 语法看似简单，但引号内换行、BOM、CRLF、歧义分隔符等边界多，测试成本 >6 KB 依赖 | — |

**推荐：papaparse**。6.8 KB gzip 换来最完整的边界覆盖（BOM/引号内换行/CRLF/自动分隔符/Worker）和内置 parse+unparse 对称 API；d3-dsv 只作为“极限抠体积”备选（需自补 BOM 剥离与 TSV 切换）。CSV↔JSON 工具本身逻辑极薄，依赖即核心，无法自实现掉。

---

## 2. Markdown ↔ HTML

XSS 姿态是核心：Markdown 渲染器允许原样 HTML 或链接协议时，`<img onerror>`、`javascript:` 链接可注入 DOM。

| 候选 | 许可证 | min+gzip | 能力要点 | 浏览器/WebView 兼容 |
|---|---|---|---|---|
| **marked 18.1.2**（推荐） | MIT（[LICENSE](https://unpkg.com/marked@18.1.2/LICENSE)、[npm](https://www.npmjs.com/package/marked)） | 47.2 KB / 14.2 KB（[bundlephobia](https://bundlephobia.com/package/marked@18.1.2)，复核 unpkg 49,207 B → gz 14,865 B），0 依赖 | GFM 默认开启：表格、删除线、任务列表（源码含 `listIsTask`/`listTaskCheckbox` 规则，无需插件）、自动链接。**官方明确不做 sanitize**，README 警告要求配 DOMPurify | 纯 JS，UMD/ESM；无 DOM 也可 parse（输出字符串） |
| markdown-it 15.0.3 | MIT（[npm](https://www.npmjs.com/package/markdown-it)） | 98.2 KB / 40.8 KB（含 6 依赖） | 默认 preset 内置 GFM 表格（源码 `rules_block/table`）、删除线；**任务列表需插件**；默认 `html:false` 转义原始 HTML，内置 `validateLink` 阻断 `javascript:`/`vbscript:`/`file:`/大多数 `data:`（源码 `BAD_PROTO_RE`）→ XSS 姿态较好 | 纯 JS，浏览器友好 |
| micromark 4.0.3 + micromark-extension-gfm 3.0.0 | 均 MIT（[npm](https://www.npmjs.com/package/micromark)、[gfm 扩展](https://www.npmjs.com/package/micromark-extension-gfm)） | 53.4 KB / 15.2 KB + 23.1 KB / 7.1 KB ≈ 76 KB / ≈22 KB（组合近似，依赖有重叠未去重） | CommonMark 严格 + GFM 扩展（tables、tasklists、strikethrough、autolink）；最规范但模块化 API 上手成本高；自带输出 HTML 不 sanitize | 纯 JS，ESM-only（Vite 无障碍） |
| **turndown 7.2.4**（HTML→MD，推荐） | MIT（[LICENSE](https://unpkg.com/turndown@7.2.4/LICENSE)、[npm](https://www.npmjs.com/package/turndown)） | 10.8 KB / 4.1 KB（npm 依赖 1 项 `@mixmark-io/domino` 仅 Node 用，浏览器构建走 DOMParser；[unpkg 浏览器 UMD](https://unpkg.com/turndown@7.2.4/lib/turndown.browser.umd.js) 26,946 B raw → 7,445 B gz） | 表格/任务列表需官方 [turndown-plugin-gfm 1.0.2](https://www.npmjs.com/package/turndown-plugin-gfm)（MIT，2.1 KB / 0.95 KB）；输入是 DOM，可先用 DOMPurify 净化 | 需 DOM（浏览器/WebView 原生支持） |
| **DOMPurify 3.4.17**（sanitize，推荐） | **MPL-2.0 OR Apache-2.0 双许可**（[npm 字段](https://www.npmjs.com/package/dompurify)；[LICENSE(Apache-2.0)](https://unpkg.com/dompurify@3.4.17/LICENSE)） | 29.2 KB / 11.5 KB（[bundlephobia](https://bundlephobia.com/package/dompurify@3.4.17)，复核 unpkg 29,828 B → 11,757 B gz；npm 侧 1 个依赖但 bundlephobia 计 0，以 bundlephobia 为准） | 白名单 DOM 净化，业界标准；对 `innerHTML` 输出兜底 | 需 DOM，WebView 无障碍；`USE_PROFILES` 可收紧 |
| sanitize-html 2.18.1（不推荐） | MIT（[npm](https://www.npmjs.com/package/sanitize-html)） | 135.7 KB / 50.3 KB（含 6 依赖） | 功能强但体积是 DOMPurify 4 倍 | Node 血统（依赖 postcss 等），浏览器可用但重 |
| insane 2.6.2（不推荐） | MIT（[npm](https://www.npmjs.com/package/insane)） | 4.5 KB / 2.0 KB | 正则式净化，久未维护，审计深度远逊 DOMPurify | — |

**推荐：marked（14.2 KB gzip）+ DOMPurify（11.5 KB gzip）+ turndown(+gfm 插件)（5.0 KB gzip）**，合计 ≈ **30.7 KB gzip**。
渲染管线：`marked.parse()` → `DOMPurify.sanitize()` → 插入 DOM（marked 官方 README 即为唯一安全用法示范）。反向 `HTML→MD` 用 turndown，输入先 DOMPurify（防 `javascript:` href 泄漏进 MD 链接）。markdown-it 路线（40.8 KB + 任务列表插件）与 micromark 路线均无体积优势，排除。

---

## 3. EXIF 查看 / 清除

“查看”要求跨 JPEG/PNG/TIFF 解析；“清除”要求**写回能力**。纯查看库（exifr、exifreader、blueimp）都不能写回——清除要么用可写库，要么重编码（canvas，有损）或自剥字节段。

| 候选 | 许可证 | min+gzip | 能力要点 | 浏览器/WebView 兼容 |
|---|---|---|---|---|
| **exifr 7.1.3 `lite` 构建**（推荐·读） | MIT（[LICENSE](https://unpkg.com/exifr@7.1.3/LICENSE)、[npm](https://www.npmjs.com/package/exifr)） | lite 45.8 KB / **15.0 KB**（unpkg 实测 45,779 B → 14,950 B gz）；full 74.9 KB / 26.1 KB；mini 29.3 KB / 9.2 KB（无 tag 词典） | **只读**。lite: JPEG+HEIC 的 EXIF/TIFF/XMP；full: 再加 PNG/TIFF/IIQ、IPTC/ICC/JFIF/IHDR + 全词典；GPS DMS→DD 便捷转换。PNG/TIFF 读取需 full（26.1 KB） | ArrayBuffer/DataView 解析，无 DOM/Node 依赖 |
| exifreader 4.52.0（候选·读） | **MPL-2.0**（[LICENSE](https://unpkg.com/exifreader@4.52.0/LICENSE)、[README License 节](https://unpkg.com/exifreader@4.52.0/README.md)） | 135.9 KB / 43.3 KB（[bundlephobia](https://bundlephobia.com/package/exifreader@4.52.0)，复核 151,727 B raw → 45,804 B gz） | 只读。覆盖面最广：JPEG/JPEG XL/TIFF/PNG/HEIC/AVIF/WebP/GIF 的 Exif+IPTC+XMP+ICC+MPF+缩略图+MakerNotes（README 支持表） | ESM/UMD/Worker 均官方支持 |
| **piexifjs 1.0.6**（推荐·清除） | MIT（[源码头 LICENSE](https://unpkg.com/piexifjs@1.0.6/piexif.js)）；[npm](https://www.npmjs.com/package/piexifjs)（1.0.6，发布于 2017，仓库最后更新 2022-06-23——**停更但 API 面小、JPEG 段操作简单**，风险可控） | 30.0 KB / 8.8 KB（[bundlephobia](https://bundlephobia.com/package/piexifjs@1.0.6)，未压缩发行文件 78,998 B → 12,343 B gz） | **可读可写**：`load/dump/insert/remove`。`remove()` 按段过滤 JPEG 的 `FF E1 "Exif\0\0"` APP1 段——**无损剥离 EXIF，不重编码**（源码实测）。仅 JPEG（TIFF 结构可解析/生成，PNG 不支持——源码无 PNG 逻辑） | 纯字符串/DataView 操作；UMD |
| blueimp-load-image 5.16.0 | MIT（[npm](https://www.npmjs.com/package/blueimp-load-image)） | 25.9 KB / 9.1 KB | 加载/缩放/EXIF **方向**读取（非完整元数据），走 canvas → 清除元数据属“重编码”副作用而非显式 API | 浏览器原生 |
| png-chunks-extract 1.0.0 + png-chunk-text 1.0.0（候选·PNG） | MIT（[npm](https://www.npmjs.com/package/png-chunks-extract)） | 3.2 KB / 1.1 KB + 1.3 KB / 0.7 KB | 仅 PNG chunk 级读改（可剥 tEXt/iTXt/zTXt），JPEG/TIFF 无能为力 | 纯 ArrayBuffer |
| 原生 canvas 重编码（兜底） | — | 0 | 任何格式 → `drawImage` + `toBlob`：**顺带剥离全部元数据**（PNG 的 tEXt、TIFF、GPS 都没了），但**有损**（JPEG 重压缩、PNG 重新 filter），尺寸也可能变；适合“清除=快速匿名化”而非法务级保真 | 全 WebView |

**推荐：exifr（读）+ piexifjs（JPEG 无损清除）**。
- 查看：若工具范围限 JPEG/HEIC → `exifr/dist/lite`（15.0 KB gzip）；若要求 PNG/TIFF 完整词典 → `full`（26.1 KB gzip）。
- 清除：JPEG 用 `piexifjs.remove()`（8.8 KB gzip，无损）；PNG 清除元数据可 native 重写 chunk（或引 `png-chunks-extract` 1.1 KB）；TIFF 清除走原生重编码或暂不支持（v0.3.0 规格可限定 JPEG/PNG）。
- 不选 exifreader：MPL-2.0 在闭源分发下义务清晰（文件级 copyleft，可接受但多一道法务检查）且 43 KB gzip 贵一倍以上，覆盖面优势只在 MakerNote/缩略图这类高级需求。
- 合计（lite 方案）≈ **23.8 KB gzip**；full 读取方案 ≈ **34.9 KB gzip**。

---

## 4. 图片缩放 / 压缩

| 候选 | 许可证 | 体积 | 能力要点 | 浏览器/WebView 兼容 |
|---|---|---|---|---|
| **原生 Canvas（推荐，0 新依赖）** | — | 0 KB | `createImageBitmap`/`Image` 解码 → `drawImage` 缩放（`imageSmoothingQuality:'high'`）→ `toBlob('image/jpeg'|'image/webp'|'image/png', q)` 编码。项目已有成熟先例：`src/tools/webp-converter/encode.ts` 的 Canvas 优先 + 1×1 探测缓存 + 结构化回退 | WebView2/Firefox: `toBlob('image/webp')` 原生可用；**Safari/WKWebView 不能从 canvas 编码 WebP**（项目 [ADR 0001](../docs/adr/0001-hybrid-webp-encoding.md) 已记录），故 WebP 输出复用现有 `@jsquash/webp`（已装，`webp_enc.wasm` 实测 281 KB raw / 114 KB gz，dynamic import 单独 chunk） |
| image-size 2.0.4（不需要） | MIT（[npm](https://www.npmjs.com/package/image-size)） | 11.6 KB / 4.6 KB | 免解码读宽高——但本工具反正要解码重编码，`naturalWidth/Height` 即可 | — |
| jimp 1.6.1（排除） | MIT（[npm](https://www.npmjs.com/package/jimp)） | 纯 JS 全家桶，27 个依赖，unpacked 3.3 MB（bundlephobia 入口 164 B 不代表浏览器包体，**未单独验证，按 MB 级处理**） | 慢、重，Canvas 原生远优于它 | — |
| wasm-image-optimization 2.0.13（排除） | MIT（[npm](https://www.npmjs.com/package/wasm-image-optimization)） | WASM 资产 9.2 MB raw / **2.5 MB gz** | mozjpeg/oxipng WASM 极致压缩——离线 WebView 可用但体积不可接受 | — |
| sharp（排除） | — | — | Node 原生插件，**浏览器/WebView 不可用**，违反硬约束 | ✗ |

**推荐：原生 Canvas，无新依赖**。JPEG/PNG 缩放压缩走 Canvas `toBlob`；WebP 输出沿用 §0 的 ADR-0001 混合路径（Canvas 优先、`@jsquash/webp` WASM 回退，已在包内）；可选扩展（如批量）在 Worker 里用 `OffscreenCanvas`，与懒加载 chunk 兼容。

---

## 5. 密码生成器·强度分析

| 候选 | 许可证 | min+gzip | 能力要点 | 浏览器/WebView 兼容 |
|---|---|---|---|---|
| zxcvbn 4.4.2（排除） | MIT（[LICENSE.txt](https://unpkg.com/zxcvbn@4.4.2/LICENSE.txt)、[npm](https://www.npmjs.com/package/zxcvbn)） | 818.5 KB / **391.7 KB**（[bundlephobia](https://bundlephobia.com/package/zxcvbn@4.4.2)；官方 README 自述“约 400kB gzipped”，吻合）。9 年未实质更新（4.4.2，2017） | 业界标杆：4 万常见口令 + 词典/模式/邻接图打分 | UMD，可用但体积致命 |
| @zxcvbn-ts/core 4.2.0 + language-common 4.1.3（可选·后期增强） | 均 MIT（[core](https://www.npmjs.com/package/@zxcvbn-ts/core)、[common](https://www.npmjs.com/package/@zxcvbn-ts/language-common)） | core 33.3 KB / **11.1 KB**；common 词典 428.2 KB / **221.5 KB**；language-en 词典再 +605.4 KB gzip | zxcvbn 的 TS 移植，算法同源、语言包解耦；**词典仍是大头**，common-only 合计 ≈233 KB gzip | 纯 JS |
| check-password-strength 3.0.0（备选） | MIT（[npm](https://www.npmjs.com/package/check-password-strength)） | 1.2 KB / 0.65 KB | 纯正则分级（字符种类计数），无词典、无模式识别——只值“复杂度规则”级别 | 纯 JS |
| owasp-password-strength-test 1.3.0（备选） | MIT（[npm](https://www.npmjs.com/package/owasp-password-strength-test)） | 2.1 KB / 1.1 KB | OWASP 规则检查，非熵估计，10+ 年未更新 | 纯 JS |
| password-rules 0.0.3（备选） | BSD（[npm](https://www.npmjs.com/package/password-rules)，仓库 mapbox，2015 后停更） | 1.7 KB / 0.6 KB | 可配规则打分，无词典 | 纯 JS |
| **原生 Shannon 熵 + 模式启发（推荐）** | — | 0 KB（实现 ~1–2 KB 自有代码） | 字符集熵估计 `len × log2(alphabet)` + 常见惩罚（重复/序列/键盘邻接）；对**生成器**场景（口令是机器随机生成）足够：熵即正确答案 | 纯 JS |

**推荐：原生实现，无新依赖**。理由：ForgeX 的口令是**自己生成**的（强随机），强度指示用熵估计即可完整表达；词典型 zxcvbn 的价值在识别人类选择的弱口令，对生成器是错配，且 zxcvbn 392 KB / zxcvbn-ts core+common ≈ 233 KB gzip 均与“轻量工具”定位冲突。若未来强度面板要评估**用户输入**口令，再 dynamic-import `@zxcvbn-ts/core + language-common`（≈233 KB gzip，单独 chunk，按需付费）作为可选项写进规格。

---

## 6. 推荐集合与总体积

| # | 工具 | 推荐依赖（新） | min | gzip |
|---|---|---|---|---|
| 1 | CSV↔JSON | papaparse | 18.7 KB | 6.8 KB |
| 2 | Markdown↔HTML | marked + dompurify + turndown + turndown-plugin-gfm | 47.2 + 29.2 + 10.8 + 2.1 = 89.3 KB | 14.2 + 11.5 + 4.1 + 0.95 ≈ 30.7 KB |
| 3 | EXIF 查看/清除 | exifr(`lite`) + piexifjs | 45.8 + 30.0 = 75.8 KB | 15.0 + 8.8 = 23.8 KB |
| 4 | 图片缩放/压缩 | 无（原生 Canvas + 既有 jsquash） | 0 | 0 |
| 5 | 密码强度 | 无（原生熵估计） | 0 | 0 |
| — | **合计（7 个新包）** | — | **≈184 KB** | **≈61 KB** |

- 备选变动：EXIF 读取用 `full` → +11 KB gzip（总 ≈72 KB）；用 exifreader 替 exifr → +28 KB gzip（总 ≈89 KB）。
- **懒加载判定**: 以当前 eager-glob 注册（§0），若静态 import，这 ≈61 KB gzip 会**全额进入主入口 chunk**。规格必须要求：每个工具组件内对第三方依赖使用 dynamic `import()`（webp-converter 已有先例），或把 `ToolMeta.component` 改为异步组件实现真路由 split。满足其一后：
  - **Web 首屏增量 = 0**（依赖 chunk 按需拉取）；
  - 首访单工具成本 6.8–30.7 KB gzip（Markdown 工具最大），离线 Tauri 本地资产加载，完全可接受；
  - 与现有 CSP（`script-src 'self'`）无冲突——split chunk 为同源产物。

## 7. 主要来源索引

- 版本/许可证字段：`https://registry.npmjs.org/<pkg>/latest`（papaparse、csv-parse、csv-stringify、d3-dsv、marked、markdown-it、micromark、turndown、dompurify、exifr、piexifjs、blueimp-load-image、image-size、jimp、zxcvbn、@zxcvbn-ts/*、check-password-strength、password-rules、png-chunks-*）
- min+gzip：`https://bundlephobia.com/api/size?package=<pkg>@<version>`（查询 2026-10-28）；推荐项另经 unpkg/jsDelivr 原始文件 + 本地 gzip -9 复核
- 源码能力证据：PapaParse `stripBom`/`guessDelimiter`（github.com/mholt/PapaParse）、d3-dsv `src/dsv.js`（github.com/d3/d3-dsv）、marked `listIsTask`（unpkg `lib/marked.esm.js`）、markdown-it `validateLink`/`BAD_PROTO_RE` + `rules_block/table`（unpkg `dist/markdown-it.mjs`）、exifr README 三构建支持矩阵（unpkg `exifr@7.1.3/README.md`）、piexifjs `remove()` APP1 段过滤（unpkg `piexifjs/piexif.js` 源码）、zxcvbn README “~400kB gzipped”（github.com/dropbox/zxcvbn）
- 项目内先例：`src/tools/webp-converter/encode.ts`（Canvas 优先 + jsquash dynamic import）、`docs/adr/0001-hybrid-webp-encoding.md`（WebView 编码能力差异）、`src/router/index.ts`（eager glob 注册现状）

*未验证/近似项：micromark 组合体积为两查相加（依赖重叠，实际可能略低）；jimp 浏览器包体未单独测（仅按 unpacked 3.3 MB 量级排除）；exifr “lite/mini” 体积来自 unpkg 实测（其构建未 minify 与否按发行形态，已注明）。其余数字均为 2026-10-28 的 registry/bundlephobia/unpkg 实测。*
