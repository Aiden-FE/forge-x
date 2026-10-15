import { describe, expect, it } from 'vitest'
import { decodeUrlText, encodeUrlText } from './urlCodec'

describe('encodeUrlText', () => {
  it('编码中文、空格与保留字符', () => {
    expect(encodeUrlText('中文 & space=a:b?/')).toBe(
      '%E4%B8%AD%E6%96%87%20%26%20space%3Da%3Ab%3F%2F',
    )
    expect(encodeUrlText('hello world')).toBe('hello%20world')
  })

  it('对完整 URL 中的保留字符按 encodeURIComponent 转义', () => {
    const value = 'https://example.com/path?a=1&b=中文#frag'
    expect(encodeUrlText(value)).toBe(encodeURIComponent(value))
    expect(decodeUrlText(encodeUrlText(value))).toBe(value)
  })
})

describe('decodeUrlText', () => {
  it('解码中文、空格与百分号转义', () => {
    expect(decodeUrlText('%E4%B8%AD%20a%2Fb%3Fc%3Dd')).toBe('中 a/b?c=d')
    expect(decodeUrlText('hello%20world')).toBe('hello world')
  })

  it('非法百分号序列抛出 URIError，供界面容错提示', () => {
    expect(() => decodeUrlText('%')).toThrow(URIError)
    expect(() => decodeUrlText('%A')).toThrow(URIError)
    expect(() => decodeUrlText('%GG')).toThrow(URIError)
  })

  it('截断的多字节转义抛出 URIError，不返回部分文本', () => {
    expect(() => decodeUrlText('%E4%B8')).toThrow(URIError)
  })
})
