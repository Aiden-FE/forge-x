/**
 * WebP 编码核心（混合路径，见 docs/adr/0001-hybrid-webp-encoding.md）。
 *
 * - Canvas 优先：canvas.toBlob('image/webp', quality/100)（零依赖、快）。
 * - WASM 回退：@jsquash/webp（libwebp WASM），dynamic import 懒加载，quality 0~100。
 * - 逐文件静默回退：Canvas 返回 null / 抛错时回退 WASM，仍失败则抛结构化错误。
 * - UI 不暴露实际走了哪条路径。
 *
 * 质量映射：UI 0~100 → canvas quality/100 → wasm quality(0~100)。
 */
import wasmUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url'
import { toCanvas } from './decode'
import { ConversionError } from './errors'

export type Backend = 'canvas' | 'wasm'

/** 编码决策（纯函数）：原生受支持 → canvas；不受支持 → wasm；canvas 已失败 → wasm。 */
export function pickBackend(nativeSupported: boolean, canvasFailed: boolean): Backend {
  if (!nativeSupported) return 'wasm'
  return canvasFailed ? 'wasm' : 'canvas'
}

let supportCache: boolean | null = null

/** 探测原生 WebP 编码能力（1×1 canvas toBlob 检查 blob.type），缓存于页面生命周期。 */
export async function detectWebPSupport(): Promise<boolean> {
  if (supportCache !== null) return supportCache
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.8)
  })
  supportCache = blob !== null && blob.type === 'image/webp'
  return supportCache
}

function toBlobPromise(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })
}

/** 原生 Canvas 编码：绘制到 canvas → toBlob('image/webp', quality/100)。失败返回 null。 */
export async function encodeCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  const canvas = toCanvas(source, width, height)
  return toBlobPromise(canvas, 'image/webp', quality / 100)
}

/* ---------------- WASM 回退路径 ---------------- */

type WebpEncFactory = typeof import('@jsquash/webp/codec/enc/webp_enc.js').default
type WebpEncodeModule = Awaited<ReturnType<WebpEncFactory>>

let wasmModulePromise: Promise<WebpEncodeModule> | null = null

const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string'

/**
 * 加载 wasm 二进制。
 * 浏览器：Vite `?url` 导入 → http(s)/相对/blob/data URL，fetch 即可。
 * Node（vitest）：`?url` 解析为文件系统路径，直接读取。
 * 显式提供 wasmBinary 后，emscripten 不再自行解析 `new URL('webp_enc.wasm', import.meta.url)`
 * （该路径在 Vite dev 依赖优化目录下不可用），统一由本模块控制资产来源。
 */
async function loadWasmBinary(url: string): Promise<ArrayBuffer> {
  if (isNode) {
    const { readFile, access } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const { resolve } = await import('node:path')
    const candidates = [url.startsWith('file://') ? fileURLToPath(url) : url]
    // vitest SSR 的 ?url 返回以项目根为基准的路径（如 /node_modules/...），需要拼回绝对路径
    candidates.push(resolve(process.cwd(), url.replace(/^\/+/, '')))
    let p = candidates[0]
    for (const candidate of candidates) {
      try {
        await access(candidate)
        p = candidate
        break
      } catch {
        continue
      }
    }
    return new Uint8Array(await readFile(p)).buffer
  }
  const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')
  const candidates = [
    url,
    url.startsWith('/') && !url.startsWith(base) ? base + url.slice(1) : url,
  ]
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    const res = await fetch(candidate)
    if (res.ok) return res.arrayBuffer()
  }
  throw new Error(`wasm fetch failed: ${url}`)
}

/** 懒加载并缓存 WASM 编码模块：dynamic import 仅回退场景触发下载（ADR-0001）。 */
function loadWasmModule(): Promise<WebpEncodeModule> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      const [encModule, { initEmscriptenModule }] = await Promise.all([
        import('@jsquash/webp/codec/enc/webp_enc.js'),
        import('@jsquash/webp/utils.js'),
      ])
      const binary = await loadWasmBinary(wasmUrl)
      return initEmscriptenModule(encModule.default, undefined, { wasmBinary: binary })
    })()
  }
  return wasmModulePromise
}

/** WASM 编码（回退路径）：懒加载 @jsquash/webp，quality 0~100。 */
export async function encodeWasm(imageData: ImageData, quality: number): Promise<Blob> {
  const [module, { defaultOptions }] = await Promise.all([
    loadWasmModule(),
    import('@jsquash/webp/meta.js'),
  ])
  const result = module.encode(imageData.data, imageData.width, imageData.height, {
    ...defaultOptions,
    quality,
  })
  if (!result) throw new ConversionError('encode-failed')
  // result 是 emscripten 堆上的视图：复制后释放，避免把整块 wasm 堆打进 Blob
  const copy = new Uint8Array(result.length)
  copy.set(result)
  return new Blob([copy], { type: 'image/webp' })
}

/**
 * 混合路径编排：解码产物 → Canvas 路径 → null/抛错逐文件静默回退 WASM
 * → 仍失败抛结构化错误。
 */
export async function encodeToWebp(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const native = await detectWebPSupport()
  if (pickBackend(native, false) === 'canvas') {
    try {
      const blob = await encodeCanvas(source, width, height, quality)
      if (blob && blob.type === 'image/webp') return blob
    } catch {
      // 静默回退
    }
  }

  // WASM 回退：绘制到 canvas 取 ImageData → 编码
  try {
    const canvas = toCanvas(source, width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ConversionError('encode-failed')
    const imageData = ctx.getImageData(0, 0, width, height)
    return await encodeWasm(imageData, quality)
  } catch (e) {
    if (e instanceof ConversionError) throw e
    throw new ConversionError('encode-failed')
  }
}
