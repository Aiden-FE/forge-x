import qrcode from 'qrcode-generator'

export const ECC_LEVELS = ['L', 'M', 'Q', 'H'] as const
export type EccLevel = (typeof ECC_LEVELS)[number]

export const DEFAULT_ECC: EccLevel = 'M'
export const MIN_QUIET_ZONE = 0
export const MAX_QUIET_ZONE = 10
export const DEFAULT_QUIET_ZONE = 4

export interface QrMatrix {
  /** Number of modules per side (version 1 = 21). */
  moduleCount: number
  isDark: (row: number, col: number) => boolean
}

export interface QrSvg {
  svg: string
  matrix: QrMatrix
  /** SVG edge length in user units: moduleCount + 2 * quietZone. */
  size: number
  quietZone: number
}

// The library defaults to latin-1 byte conversion; use UTF-8 so that
// Chinese and other non-ASCII input round-trips correctly.
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s))

export function isEccLevel(value: unknown): value is EccLevel {
  return ECC_LEVELS.includes(value as EccLevel)
}

export function normalizeEcc(value: unknown): EccLevel {
  return isEccLevel(value) ? value : DEFAULT_ECC
}

export function normalizeQuietZone(value: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return DEFAULT_QUIET_ZONE
  return Math.min(MAX_QUIET_ZONE, Math.max(MIN_QUIET_ZONE, n))
}

export function generateQrMatrix(text: string, ecc: EccLevel): QrMatrix {
  // typeNumber 0 = auto-select the smallest QR version that fits.
  const qr = qrcode(0, ecc)
  qr.addData(text)
  qr.make()
  return {
    moduleCount: qr.getModuleCount(),
    isDark: (row, col) => qr.isDark(row, col),
  }
}

export function matrixToSvg(matrix: QrMatrix, quietZone: number): string {
  const q = normalizeQuietZone(quietZone)
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

/** Returns null for empty input (the UI shows the empty state instead). */
export function generateQr(text: string, ecc: EccLevel, quietZone: number): QrSvg | null {
  if (!text) return null
  const q = normalizeQuietZone(quietZone)
  const matrix = generateQrMatrix(text, ecc)
  return {
    svg: matrixToSvg(matrix, q),
    matrix,
    size: matrix.moduleCount + q * 2,
    quietZone: q,
  }
}
