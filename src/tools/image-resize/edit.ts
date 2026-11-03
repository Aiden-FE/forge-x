/**
 * 图像管线前段（裁剪 → 旋转）的几何与画布实现。
 *
 * 术语见 CONTEXT.md「图像管线 (Image Pipeline)」：固定处理顺序
 * 裁剪 → 旋转 → 缩放/质量。裁剪与旋转是文件级参数，缩放与质量是批量级参数；
 * 裁剪框像素即缩放阶段的输入边界。
 *
 * - 纯几何（editedDims / resolveCropRect）不依赖 DOM，node 单测覆盖；
 * - editCanvasImage 依赖 canvas，行为由浏览器承担（与 decode.ts 同层）；
 * - 旋转 90° 步进（0/90/180/270）；任意角度出界（画布扩展与空白角填充是另一族问题）；
 * - 旋转交换宽高发生在缩放计算之前（管线单向：裁剪 → 旋转 → 缩放）。
 */

/** 裁剪框：解码后原图像素坐标（左上原点）。 */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** 旋转 90° 步进（顺时针）。 */
export type Rotation = 0 | 90 | 180 | 270

export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

export interface ImageEdit {
  crop?: CropRect
  rotation?: Rotation
}

/** 是否携带实际生效的编辑（无裁剪且旋转为 0 = 原图直通）。 */
export function hasEdit(edit: ImageEdit | undefined): edit is ImageEdit {
  if (!edit) return false
  return edit.crop !== undefined || (edit.rotation ?? 0) !== 0
}

/**
 * 裁剪框合法性收敛：与图像矩形取交集（越界部分裁掉），负坐标收到 0；
 * 交集宽或高 ≤ 0 → null（调用方按非法输入报错）。
 */
export function resolveCropRect(srcWidth: number, srcHeight: number, crop: CropRect): CropRect | null {
  const x1 = Math.max(0, Math.min(Math.round(crop.x), srcWidth))
  const x2 = Math.max(0, Math.min(Math.round(crop.x + crop.width), srcWidth))
  const y1 = Math.max(0, Math.min(Math.round(crop.y), srcHeight))
  const y2 = Math.max(0, Math.min(Math.round(crop.y + crop.height), srcHeight))
  if (x2 - x1 <= 0 || y2 - y1 <= 0) return null
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/**
 * 管线几何：裁剪先行（输入边界变为裁剪框像素），旋转后宽高互换
 * （90°/270° 互换，180° 不变）——交换发生在缩放计算之前。
 */
export function editedDims(
  srcWidth: number,
  srcHeight: number,
  edit: ImageEdit | undefined,
): { width: number; height: number } {
  let width = srcWidth
  let height = srcHeight
  if (edit?.crop) {
    const rect = resolveCropRect(srcWidth, srcHeight, edit.crop)
    if (rect) {
      width = rect.width
      height = rect.height
    }
  }
  const rotation = edit?.rotation ?? 0
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width }
  }
  return { width, height }
}

/* ---------- DOM 画布实现（浏览器层，行为由 e2e 缝验证） ---------- */

/** 通用画布绘制：新建 canvas → 2d 上下文 → drawImage。 */
function drawCanvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  draw(ctx)
  return canvas
}

/**
 * 按管线顺序应用裁剪与旋转，返回缩放阶段的输入画布与尺寸。
 * 旋转方向为顺时针（90°：右边缘转到下边缘）。
 */
export function editCanvasImage(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  edit: ImageEdit,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  let canvas: HTMLCanvasElement
  let width: number
  let height: number

  if (edit.crop) {
    const rect = resolveCropRect(srcWidth, srcHeight, edit.crop)
    if (!rect) throw new Error('invalid crop rect')
    canvas = drawCanvas(rect.width, rect.height, (ctx) => {
      ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
    })
    width = rect.width
    height = rect.height
  } else {
    canvas = drawCanvas(srcWidth, srcHeight, (ctx) => {
      ctx.drawImage(source, 0, 0, srcWidth, srcHeight)
    })
    width = srcWidth
    height = srcHeight
  }

  const rotation = edit.rotation ?? 0
  if (rotation === 0) return { canvas, width, height }

  const swap = rotation === 90 || rotation === 270
  const outWidth = swap ? height : width
  const outHeight = swap ? width : height
  const rotated = drawCanvas(outWidth, outHeight, (ctx) => {
    ctx.translate(outWidth / 2, outHeight / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(canvas, -width / 2, -height / 2)
  })
  return { canvas: rotated, width: outWidth, height: outHeight }
}
