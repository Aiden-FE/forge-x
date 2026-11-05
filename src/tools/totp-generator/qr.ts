/**
 * otpauth:// URI 的 QR 供给（票据 09：otpauth QR 展示）。
 *
 * 口径：
 * - **点击「显示二维码」才渲染**：本模块只在被调用时 dynamic import npm 库
 *   `qrcode-generator`（已在依赖树——与 qr-generator 工具共享异步块，首屏第三方增量 0）；
 * - npm 库直连，**不 import qr-generator 工具代码**（工具间不交叉依赖）；
 * - 只生成不识别（QR 相机扫码/解析出界）。
 */

export interface QrMatrix {
  /** 每边模块数（version 1 = 21）。 */
  moduleCount: number
  isDark: (row: number, col: number) => boolean
}

/** 工厂类型 = 包的 export = 形态（qr-generator 工具的静态默认导入同型）。 */
type QrFactory = typeof import('qrcode-generator')

/** UTF-8 字节转换（库默认 latin-1；issuer/账户名可含非 ASCII，必须替换）。 */
function applyUtf8Patch(qrcode: QrFactory): void {
  qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s))
}

async function loadQr(): Promise<QrFactory> {
  // Vite 的 CJS 互操作把 export = 工厂挂到 `.default`；与 qr-generator 工具的
  // 静态默认导入解析到同一绑定。类型侧包声明为工厂本体，default 经互操作形状取用。
  const mod = (await import('qrcode-generator')) as unknown as QrFactory & { default?: QrFactory }
  const qrcode = (mod.default ?? mod) as QrFactory
  applyUtf8Patch(qrcode)
  return qrcode
}

/** 生成 QR 矩阵（ECC M、typeNumber 自动）。空输入返回 null（UI 空态）。 */
export async function generateOtpauthQr(text: string): Promise<QrMatrix | null> {
  if (!text) return null
  const qrcode = await loadQr()
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return {
    moduleCount: qr.getModuleCount(),
    isDark: (row, col) => qr.isDark(row, col),
  }
}

const QUIET_ZONE = 4

/** 矩阵 → 内联 SVG（小图/放大共用一份渲染，crispEdges 保锐利）。空输入返回 null。 */
export async function otpauthQrSvg(text: string): Promise<string | null> {
  const matrix = await generateOtpauthQr(text)
  if (!matrix) return null
  const q = QUIET_ZONE
  const size = matrix.moduleCount + q * 2

  let path = ''
  for (let row = 0; row < matrix.moduleCount; row++) {
    for (let col = 0; col < matrix.moduleCount; col++) {
      if (matrix.isDark(row, col)) {
        path += `M${col + q},${row + q}h1v1h-1z`
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"` +
    ` viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    `</svg>`
  )
}
