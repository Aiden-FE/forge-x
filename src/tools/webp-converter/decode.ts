/**
 * 浏览器解码层（DOM 依赖，行为由 e2e 缝验证）。
 *
 * - 位图优先 createImageBitmap；SVG 走 Image + drawImage（各浏览器对
 *   createImageBitmap(SVG) 支持不一）。
 * - SVG 尺寸语义见 validate.parseSvgSize / svgRasterSize。
 * - GIF / 动画 WebP 取第一帧（默认解码行为），由 firstFrame 标注。
 * - 失败统一抛 ConversionError（结构化原因由 UI 映射文案）。
 */
import { ConversionError } from './errors'
import { isAnimatedWebP, parseSvgSize, svgRasterSize } from './validate'

export interface DecodedImage {
  canvas: HTMLCanvasElement
  width: number
  height: number
  /** 输入为动画图片（GIF / 动画 WebP）时为 true，结果仅取第一帧 */
  firstFrame: boolean
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

/** 通用画布绘制：新建 canvas → 2d 上下文 → drawImage。供解码与编码复用。 */
export function toCanvas(img: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ConversionError('decode-failed')
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

async function decodeSvg(file: File): Promise<DecodedImage> {
  const text = await file.text()
  const size = parseSvgSize(text)
  if (size.kind === 'none') throw new ConversionError('svg-no-size')

  let width: number
  let height: number
  if (size.kind === 'declared') {
    width = size.width
    height = size.height
  } else {
    ;({ width, height } = svgRasterSize(size.width, size.height))
  }

  const url = URL.createObjectURL(file)
  try {
    let img: HTMLImageElement
    try {
      img = await loadImage(url)
    } catch {
      throw new ConversionError('decode-failed')
    }
    const canvas = toCanvas(img, width, height)
    return { canvas, width, height, firstFrame: false }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function decodeRaster(file: File): Promise<DecodedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ConversionError('decode-failed')
  }
  try {
    const canvas = toCanvas(bitmap, bitmap.width, bitmap.height)
    const type = file.type.toLowerCase()
    let firstFrame = false
    if (type === 'image/gif') {
      firstFrame = true
    } else if (type === 'image/webp') {
      firstFrame = isAnimatedWebP(await file.arrayBuffer())
    }
    return { canvas, width: bitmap.width, height: bitmap.height, firstFrame }
  } finally {
    bitmap.close()
  }
}

/** 解码文件为 canvas（SVG 按声明尺寸 / viewBox 宽高比栅格化）。 */
export async function decodeImage(file: File): Promise<DecodedImage> {
  const type = file.type.toLowerCase()
  if (type === 'image/svg+xml' || fileExtension(file.name) === 'svg') return decodeSvg(file)
  return decodeRaster(file)
}
