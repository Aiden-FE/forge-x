/**
 * GPS 坐标格式化（纯函数，不依赖 Vue / DOM）。
 *
 * 展示口径（规格 §3）：十进制度 + DMS；「不在地图上定位」的说明由 UI 承担（离线承诺）。
 * 真值锚点：[39,54,15] → 39.904166…° → 39°54′15″ N。
 */

/** 度分秒数组（[度, 分, 秒]）→ 十进制度。缺失位按 0 处理。 */
export function dmsArrayToDecimal(dms: number[]): number {
  const d = dms[0] ?? 0
  const m = dms[1] ?? 0
  const s = dms[2] ?? 0
  return d + m / 60 + s / 3600
}

/** 十进制度展示：固定 6 位小数；半球参考（N/S/E/W）存在时附加其后。 */
export function formatGpsDecimal(deg: number, ref?: string): string {
  const base = `${deg.toFixed(6)}°`
  return ref ? `${base} ${ref}` : base
}

/**
 * DMS 展示：秒四舍五入取整，满 60 向分进位、分满 60 向度进位。
 * 半球参考存在时附加其后（坐标正负号不参与换算，由参考决定半球）。
 */
export function formatGpsDms(dms: number[], ref?: string): string {
  let d = Math.floor(dms[0] ?? 0)
  let m = Math.floor(dms[1] ?? 0)
  let s = Math.round(dms[2] ?? 0)
  if (s >= 60) {
    s -= 60
    m += 1
  }
  if (m >= 60) {
    m -= 60
    d += 1
  }
  const base = `${d}°${m}′${s}″`
  return ref ? `${base} ${ref}` : base
}
