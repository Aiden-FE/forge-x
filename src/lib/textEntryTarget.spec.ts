// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { isTextEntryTarget } from './textEntryTarget'

describe('isTextEntryTarget', () => {
  it('input / textarea / select 视为文本输入目标', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      const el = document.createElement(tag)
      document.body.appendChild(el)
      expect(isTextEntryTarget(el), tag).toBe(true)
      el.remove()
    }
  })

  it('contenteditable 区域及其子节点视为文本输入目标', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    editor.appendChild(child)
    document.body.appendChild(editor)

    expect(isTextEntryTarget(editor)).toBe(true)
    expect(isTextEntryTarget(child)).toBe(true)

    editor.remove()
  })

  it('普通元素与按钮不算文本输入目标', () => {
    for (const tag of ['div', 'button', 'span']) {
      const el = document.createElement(tag)
      document.body.appendChild(el)
      expect(isTextEntryTarget(el), tag).toBe(false)
      el.remove()
    }
  })

  it('null 与非元素 EventTarget 不算文本输入目标', () => {
    expect(isTextEntryTarget(null)).toBe(false)
    expect(isTextEntryTarget(new EventTarget())).toBe(false)
  })
})
