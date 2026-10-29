import { describe, expect, it } from 'vitest'
import {
  MAX_OUTPUT_DIMENSION,
  computeTargetSize,
  fitInBox,
  fitLongestEdge,
  linkPair,
  scaleByPercent,
  stretchTo,
  validatePlan,
} from './resize'

describe('fitLongestEdge 限长边', () => {
  it('规格样例：4000×3000 → 2000 得 2000×1500', () => {
    expect(fitLongestEdge(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
  })

  it('竖图：3000×4000 → 2000 得 1500×2000', () => {
    expect(fitLongestEdge(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('方形：1000×1000 → 500 得 500×500', () => {
    expect(fitLongestEdge(1000, 1000, 500)).toEqual({ width: 500, height: 500 })
  })

  it('目标大于长边 → 放大（等比）', () => {
    expect(fitLongestEdge(1000, 500, 2000)).toEqual({ width: 2000, height: 1000 })
  })

  it('非整除时四舍五入且最小 1px：3001×2 → 长边 1', () => {
    const r = fitLongestEdge(3, 2, 1)
    expect(r).toEqual({ width: 1, height: 1 })
  })

  it('非整除时四舍五入：1001×501 → 500', () => {
    const r = fitLongestEdge(1001, 501, 500)
    expect(r.width).toBe(500)
    expect(r.height).toBe(250)
  })
})

describe('scaleByPercent 百分比', () => {
  it('规格样例：50% 得半尺寸 4000×3000 → 2000×1500', () => {
    expect(scaleByPercent(4000, 3000, 50)).toEqual({ width: 2000, height: 1500 })
  })

  it('100% → 原尺寸', () => {
    expect(scaleByPercent(1920, 1080, 100)).toEqual({ width: 1920, height: 1080 })
  })

  it('200% → 倍增（允许放大）', () => {
    expect(scaleByPercent(640, 480, 200)).toEqual({ width: 1280, height: 960 })
  })

  it('四舍五入：50% of 1001×1 → 501×1（最小 1px）', () => {
    expect(scaleByPercent(1001, 1, 50)).toEqual({ width: 501, height: 1 })
  })
})

describe('fitInBox 指定宽高（比例锁开：等比适配框内）', () => {
  it('恰好匹配参考比例：4000×3000 入 2000×1500 框 → 2000×1500', () => {
    expect(fitInBox(4000, 3000, 2000, 1500)).toEqual({ width: 2000, height: 1500 })
  })

  it('按宽先到边：4000×3000 入 1000×1000 框 → 1000×750', () => {
    expect(fitInBox(4000, 3000, 1000, 1000)).toEqual({ width: 1000, height: 750 })
  })

  it('按高先到边：3000×4000 入 1000×1000 框 → 750×1000', () => {
    expect(fitInBox(3000, 4000, 1000, 1000)).toEqual({ width: 750, height: 1000 })
  })

  it('小于框 → 放大到贴合（无只缩不放限制）', () => {
    expect(fitInBox(100, 50, 1000, 1000)).toEqual({ width: 1000, height: 500 })
  })
})

describe('stretchTo 指定宽高（解锁：精确 W×H，允许非等比拉伸）', () => {
  it('解锁后精确 W×H：4000×3000 → 800×600', () => {
    expect(stretchTo(4000, 3000, 800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('非等比拉伸：4000×3000 → 1000×1000', () => {
    expect(stretchTo(4000, 3000, 1000, 1000)).toEqual({ width: 1000, height: 1000 })
  })
})

describe('linkPair 比例锁输入联动', () => {
  it('编辑宽度 2000 → 高联动 1500（4000×3000）', () => {
    expect(linkPair(4000, 3000, 'width', 2000)).toEqual({ width: 2000, height: 1500 })
  })

  it('编辑高度 1500 → 宽联动 2000（4000×3000）', () => {
    expect(linkPair(4000, 3000, 'height', 1500)).toEqual({ width: 2000, height: 1500 })
  })

  it('竖图：1000×2000 编辑宽 500 → 高 1000', () => {
    expect(linkPair(1000, 2000, 'width', 500)).toEqual({ width: 500, height: 1000 })
  })

  it('四舍五入且最小 1px', () => {
    expect(linkPair(1000, 3, 'width', 500)).toEqual({ width: 500, height: 2 })
    expect(linkPair(1000, 1, 'width', 100)).toEqual({ width: 100, height: 1 })
  })
})

describe('validatePlan 计划合法性（0/负/超 65500）', () => {
  it('MAX_OUTPUT_DIMENSION = 65500', () => {
    expect(MAX_OUTPUT_DIMENSION).toBe(65500)
  })

  it('限长边：0 / 负数 / 超上限 → invalid-target-size', () => {
    expect(validatePlan({ mode: 'longest-edge', edge: 0 })).toEqual({ ok: false, reason: 'invalid-target-size' })
    expect(validatePlan({ mode: 'longest-edge', edge: -100 })).toEqual({ ok: false, reason: 'invalid-target-size' })
    expect(validatePlan({ mode: 'longest-edge', edge: MAX_OUTPUT_DIMENSION + 1 })).toEqual({
      ok: false,
      reason: 'invalid-target-size',
    })
  })

  it('限长边：恰 65500 → 通过', () => {
    expect(validatePlan({ mode: 'longest-edge', edge: MAX_OUTPUT_DIMENSION })).toEqual({ ok: true })
  })

  it('指定宽高：0 / 负数 / 任一边超上限 → invalid-target-size', () => {
    expect(validatePlan({ mode: 'dimensions', width: 0, height: 100, lock: true })).toEqual({
      ok: false,
      reason: 'invalid-target-size',
    })
    expect(validatePlan({ mode: 'dimensions', width: 100, height: -1, lock: false })).toEqual({
      ok: false,
      reason: 'invalid-target-size',
    })
    expect(validatePlan({ mode: 'dimensions', width: MAX_OUTPUT_DIMENSION + 1, height: 10, lock: true })).toEqual({
      ok: false,
      reason: 'invalid-target-size',
    })
  })

  it('指定宽高：合法值（锁开/锁关）→ 通过', () => {
    expect(validatePlan({ mode: 'dimensions', width: 1920, height: 1080, lock: true })).toEqual({ ok: true })
    expect(validatePlan({ mode: 'dimensions', width: 1920, height: 1080, lock: false })).toEqual({ ok: true })
  })

  it('百分比：0 / 负数 → invalid-target-size；100 → 通过', () => {
    expect(validatePlan({ mode: 'percentage', percent: 0 })).toEqual({ ok: false, reason: 'invalid-target-size' })
    expect(validatePlan({ mode: 'percentage', percent: -5 })).toEqual({ ok: false, reason: 'invalid-target-size' })
    expect(validatePlan({ mode: 'percentage', percent: 100 })).toEqual({ ok: true })
  })
})

describe('computeTargetSize 模式 → 目标尺寸（含逐文件合法性）', () => {
  it('限长边：4000×3000 + 2000 → 2000×1500', () => {
    expect(computeTargetSize({ width: 4000, height: 3000 }, { mode: 'longest-edge', edge: 2000 })).toEqual({
      ok: true,
      width: 2000,
      height: 1500,
    })
  })

  it('指定宽高锁开：4000×3000 入 1000×1000 → 1000×750', () => {
    expect(
      computeTargetSize({ width: 4000, height: 3000 }, { mode: 'dimensions', width: 1000, height: 1000, lock: true }),
    ).toEqual({ ok: true, width: 1000, height: 750 })
  })

  it('指定宽高锁关：4000×3000 → 精确 1000×1000', () => {
    expect(
      computeTargetSize({ width: 4000, height: 3000 }, { mode: 'dimensions', width: 1000, height: 1000, lock: false }),
    ).toEqual({ ok: true, width: 1000, height: 1000 })
  })

  it('百分比：50% → 半尺寸', () => {
    expect(computeTargetSize({ width: 4000, height: 3000 }, { mode: 'percentage', percent: 50 })).toEqual({
      ok: true,
      width: 2000,
      height: 1500,
    })
  })

  it('百分比放大越界：超大图 ×10000% 单边 > 65500 → invalid-target-size（逐文件错误态）', () => {
    const r = computeTargetSize({ width: 8000, height: 8000 }, { mode: 'percentage', percent: 10000 })
    expect(r).toEqual({ ok: false, reason: 'invalid-target-size' })
  })

  it('计划本身非法：0 长边 → invalid-target-size', () => {
    expect(computeTargetSize({ width: 100, height: 100 }, { mode: 'longest-edge', edge: 0 })).toEqual({
      ok: false,
      reason: 'invalid-target-size',
    })
  })
})
