# WebP 编码：Canvas 优先 + WASM 回退

WebP 转换器需在浏览器端编码 WebP，但 `canvas.toBlob('image/webp')` 仅 Chrome/Edge（含 quality 参数）与 Firefox 96+ 支持，Safari 全系只能解码、不能编码。决定采用混合编码路径：优先原生 Canvas 编码（零依赖、快）；对无编码能力的浏览器回退到 `@jsquash/webp`（Squoosh 的 libwebp WASM 移植），按需动态加载。

## Considered Options

- **纯 Canvas**：最简、零依赖，但 Safari 用户只能看到报错，牺牲覆盖面。
- **纯 WASM**：全浏览器支持、各端输出质量一致，但所有用户付出 ~200KB wasm 成本，且慢于原生。
- **混合（采纳）**：覆盖面与性能兼得；代价是维护两条编码路径，不同浏览器输出字节可能不完全一致（可接受：用户关心质量语义而非字节级一致）。

## Consequences

- WASM 模块仅在回退场景下载（dynamic import code-split），主流浏览器无体积成本。
- 质量参数需统一映射：Canvas 用 0~1（quality/100），WASM 用 0~100。
- 回退路径只在无原生编码能力的浏览器上运行，验证成本更高，需要专门的测试策略覆盖。
