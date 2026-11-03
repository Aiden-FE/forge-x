import { describe, expect, it } from 'vitest'
import { ROTATIONS, editedDims, hasEdit, resolveCropRect } from './edit'
import type { CropRect, ImageEdit, Rotation } from './edit'

/* ---------- hasEdit：是否有实际生效的编辑 ---------- */

describe('hasEdit（原图直通判定）', () => {
  it('undefined / 空对象 / 仅 rotation: 0 → false', () => {
    expect(hasEdit(undefined)).toBe(false)
    expect(hasEdit({})).toBe(false)
    expect(hasEdit({ rotation: 0 })).toBe(false)
  })

  it('有 crop 或非零 rotation → true', () => {
    expect(hasEdit({ crop: { x: 0, y: 0, width: 10, height: 10 } })).toBe(true)
    expect(hasEdit({ rotation: 90 })).toBe(true)
    expect(hasEdit({ crop: { x: 0, y: 0, width: 10, height: 10 }, rotation: 180 })).toBe(true)
  })
})

/* ---------- resolveCropRect：越界收敛与退化 ---------- */

describe('resolveCropRect（clamp 收敛）', () => {
  it('界内裁剪框原样通过（取整）', () => {
    expect(resolveCropRect(1000, 1000, { x: 100, y: 200, width: 200, height: 300 })).toEqual({
      x: 100,
      y: 200,
      width: 200,
      height: 300,
    })
    expect(resolveCropRect(100, 100, { x: 10.4, y: 0, width: 50.6, height: 50 })).toEqual({
      x: 10,
      y: 0,
      width: 51,
      height: 50,
    })
  })

  it('越界部分被 clamp 到图像内', () => {
    expect(resolveCropRect(100, 100, { x: 50, y: 50, width: 200, height: 200 })).toEqual({
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    })
    expect(resolveCropRect(100, 100, { x: -20, y: -30, width: 100, height: 100 })).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 70,
    })
  })

  it('收敛后宽/高 ≤ 0 → null（非法，调用方报错）', () => {
    expect(resolveCropRect(100, 100, { x: 100, y: 0, width: 50, height: 50 })).toBeNull()
    expect(resolveCropRect(100, 100, { x: 0, y: 100, width: 50, height: 50 })).toBeNull()
    expect(resolveCropRect(100, 100, { x: 0, y: 0, width: 0, height: 50 })).toBeNull()
    expect(resolveCropRect(100, 100, { x: 0, y: 0, width: 50, height: -1 })).toBeNull()
    expect(resolveCropRect(0, 0, { x: 0, y: 0, width: 10, height: 10 })).toBeNull()
  })
})

/* ---------- editedDims：管线几何（裁剪 → 旋转） ---------- */

describe('editedDims（裁剪框像素 = 缩放阶段输入边界）', () => {
  it('无编辑 → 原图尺寸直通', () => {
    expect(editedDims(1000, 1000, undefined)).toEqual({ width: 1000, height: 1000 })
    expect(editedDims(1000, 1000, {})).toEqual({ width: 1000, height: 1000 })
    expect(editedDims(1000, 1000, { rotation: 0 })).toEqual({ width: 1000, height: 1000 })
  })

  it('裁剪：输入边界变为裁剪框', () => {
    expect(editedDims(1000, 1000, { crop: { x: 10, y: 20, width: 200, height: 300 } })).toEqual({
      width: 200,
      height: 300,
    })
  })

  it('旋转 90°/270° 交换宽高（发生在缩放计算之前）；180° 不交换', () => {
    expect(editedDims(400, 300, { rotation: 90 })).toEqual({ width: 300, height: 400 })
    expect(editedDims(400, 300, { rotation: 270 })).toEqual({ width: 300, height: 400 })
    expect(editedDims(400, 300, { rotation: 180 })).toEqual({ width: 400, height: 300 })
  })

  it('裁剪 + 旋转：先裁剪后交换（单向管线）', () => {
    expect(editedDims(1000, 1000, { crop: { x: 0, y: 0, width: 200, height: 300 }, rotation: 90 })).toEqual({
      width: 300,
      height: 200,
    })
    expect(editedDims(1000, 1000, { crop: { x: 0, y: 0, width: 200, height: 300 }, rotation: 180 })).toEqual({
      width: 200,
      height: 300,
    })
  })

  it('非法裁剪框（越界退化）不改变边界（回退原图，与整段报错在编排层决策解耦）', () => {
    expect(editedDims(100, 100, { crop: { x: 100, y: 0, width: 50, height: 50 } })).toEqual({
      width: 100,
      height: 100,
    })
  })
})

/* ---------- 常量 ---------- */

describe('旋转档位（90° 步进）', () => {
  it('固定 0/90/180/270；任意角度出界', () => {
    expect(ROTATIONS).toEqual([0, 90, 180, 270])
    const all: Rotation[] = [0, 90, 180, 270]
    for (const r of all) {
      const edit: ImageEdit = { rotation: r }
      expect(hasEdit(edit)).toBe(r !== 0)
    }
  })

  it('CropRect 结构固定为 x/y/width/height', () => {
    const rect: CropRect = { x: 1, y: 2, width: 3, height: 4 }
    expect(Object.keys(rect).sort()).toEqual(['height', 'width', 'x', 'y'])
  })
})
