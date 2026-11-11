import { describe, expect, it, vi } from 'vitest'
import { createToolUsageGate, isUsageEvent } from './toolUsage'

function clickTarget(closest: (selector: string) => unknown): EventTarget {
  return { closest } as unknown as EventTarget
}

describe('isUsageEvent', () => {
  it('输入、变更、拖放、粘贴都算实际使用', () => {
    for (const type of ['input', 'change', 'drop', 'paste']) {
      expect(isUsageEvent({ type, target: null })).toBe(true)
    }
  })

  it('点击交互控件算实际使用', () => {
    const target = clickTarget(() => ({ tagName: 'BUTTON' }))
    expect(isUsageEvent({ type: 'click', target })).toBe(true)
  })

  it('点击非交互区域不算实际使用', () => {
    const target = clickTarget(() => null)
    expect(isUsageEvent({ type: 'click', target })).toBe(false)
  })

  it('滚动、按键、无目标点击都不算实际使用', () => {
    expect(isUsageEvent({ type: 'scroll', target: null })).toBe(false)
    expect(isUsageEvent({ type: 'keydown', target: null })).toBe(false)
    expect(isUsageEvent({ type: 'click', target: null })).toBe(false)
    expect(isUsageEvent({ type: 'click', target: {} as EventTarget })).toBe(false)
  })
})

describe('createToolUsageGate', () => {
  it('一次访问只记录一次，reset 后可再次记录', () => {
    const record = vi.fn()
    const gate = createToolUsageGate(record)

    expect(record).not.toHaveBeenCalled()
    gate.hit()
    gate.hit()
    expect(record).toHaveBeenCalledTimes(1)

    gate.reset()
    gate.hit()
    expect(record).toHaveBeenCalledTimes(2)
  })
})
