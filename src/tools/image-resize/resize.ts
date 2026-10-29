/**
 * 纯缩放计算模块（不依赖 Vue / DOM）。
 *
 * 三种缩放模式（见 .scratch/hot-tools-v0.3.0/issues/15-image-resize-spec.md）：
 * - 限长边（longest-edge）：输出长边 = 目标值，另一边等比。4000×3000 → 2000 得 2000×1500。
 * - 指定宽高（dimensions）：比例锁开（默认）→ 每文件按自身宽高比适配目标框（contain），
 *   输入侧宽/高任一编辑另一侧自动联动（linkPair，以参考比例联动）；解锁 → 精确 W×H，
 *   允许非等比拉伸，结果由 UI 标注尺寸变化比。
 * - 百分比（percentage）：等比缩放因子，默认 100%。
 *
 * 目标尺寸非法（0、负、超 MAX_OUTPUT_DIMENSION 单边）→ invalid-target-size 错误态，
 * 不动已转换结果。放大不禁止（规格未限制只缩不放）。
 */

/** 单边输出上限（px）。 */
export const MAX_OUTPUT_DIMENSION = 65500

export type ResizeMode = 'longest-edge' | 'dimensions' | 'percentage'

export type ResizePlan =
  | { mode: 'longest-edge'; edge: number }
  | { mode: 'dimensions'; width: number; height: number; lock: boolean }
  | { mode: 'percentage'; percent: number }

export type TargetSize = { ok: true; width: number; height: number }
export type TargetSizeError = { ok: false; reason: 'invalid-target-size' }
export type TargetCheck = TargetSize | TargetSizeError

/** 计划输入合法性（不含逐文件放大越界；百分比放大越界在 computeTargetSize 逐文件判定）。 */
export type PlanCheck = { ok: true } | { ok: false; reason: 'invalid-target-size' }

/** 输出尺寸取整：四舍五入，最小 1px。 */
function normalize(w: number, h: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
  }
}

/** 限长边：长边 = target，另一边等比（允许放大）。 */
export function fitLongestEdge(origWidth: number, origHeight: number, targetEdge: number): { width: number; height: number } {
  const scale = targetEdge / Math.max(origWidth, origHeight)
  return normalize(origWidth * scale, origHeight * scale)
}

/** 百分比：等比缩放因子（percent 允许 >100 放大）。 */
export function scaleByPercent(origWidth: number, origHeight: number, percent: number): { width: number; height: number } {
  const scale = percent / 100
  return normalize(origWidth * scale, origHeight * scale)
}

/** 指定宽高 + 比例锁开：按原图宽高比适配目标框（contain，等比，可放大）。 */
export function fitInBox(origWidth: number, origHeight: number, boxWidth: number, boxHeight: number): { width: number; height: number } {
  const scale = Math.min(boxWidth / origWidth, boxHeight / origHeight)
  return normalize(origWidth * scale, origHeight * scale)
}

/** 指定宽高 + 比例锁关：精确 W×H（允许非等比拉伸；参数与 fitInBox 对称，忽略原始尺寸）。 */
export function stretchTo(_origWidth: number, _origHeight: number, boxWidth: number, boxHeight: number): { width: number; height: number } {
  return { width: boxWidth, height: boxHeight }
}

/**
 * 比例锁联动（输入侧）：以原图宽高比为参考比例，编辑宽/高任一侧，另一侧自动联动取整。
 * 例：原图 4000×3000，编辑宽 2000 → 高 1500。
 */
export function linkPair(
  origWidth: number,
  origHeight: number,
  edited: 'width' | 'height',
  value: number,
): { width: number; height: number } {
  if (edited === 'width') {
    return { width: value, height: Math.max(1, Math.round((value * origHeight) / origWidth)) }
  }
  return { width: Math.max(1, Math.round((value * origWidth) / origHeight)), height: value }
}

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

/** 计划合法性：0 / 负 / NaN / 单边超 65500 → invalid-target-size（UI 错误态，不动已转换结果）。 */
export function validatePlan(plan: ResizePlan): PlanCheck {
  if (plan.mode === 'longest-edge') {
    if (!isPositiveFinite(plan.edge) || plan.edge > MAX_OUTPUT_DIMENSION) {
      return { ok: false, reason: 'invalid-target-size' }
    }
    return { ok: true }
  }
  if (plan.mode === 'dimensions') {
    if (
      !isPositiveFinite(plan.width) ||
      !isPositiveFinite(plan.height) ||
      plan.width > MAX_OUTPUT_DIMENSION ||
      plan.height > MAX_OUTPUT_DIMENSION
    ) {
      return { ok: false, reason: 'invalid-target-size' }
    }
    return { ok: true }
  }
  // percentage：输入只要求正数；放大后是否越界依赖原图尺寸，逐文件在 computeTargetSize 判定
  if (!isPositiveFinite(plan.percent)) return { ok: false, reason: 'invalid-target-size' }
  return { ok: true }
}

/** 模式 → 该文件的目标尺寸；计划非法或逐文件结果越界（如百分比放大超限）→ invalid-target-size。 */
export function computeTargetSize(orig: { width: number; height: number }, plan: ResizePlan): TargetCheck {
  const planCheck = validatePlan(plan)
  if (!planCheck.ok) return planCheck

  let size: { width: number; height: number }
  switch (plan.mode) {
    case 'longest-edge':
      size = fitLongestEdge(orig.width, orig.height, plan.edge)
      break
    case 'dimensions':
      size = plan.lock
        ? fitInBox(orig.width, orig.height, plan.width, plan.height)
        : stretchTo(orig.width, orig.height, plan.width, plan.height)
      break
    case 'percentage':
      size = scaleByPercent(orig.width, orig.height, plan.percent)
      break
  }
  if (size.width > MAX_OUTPUT_DIMENSION || size.height > MAX_OUTPUT_DIMENSION) {
    return { ok: false, reason: 'invalid-target-size' }
  }
  return { ok: true, width: size.width, height: size.height }
}
