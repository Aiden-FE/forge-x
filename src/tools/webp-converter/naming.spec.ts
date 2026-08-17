import { describe, expect, it } from 'vitest'
import { allocateOutputName, baseOutputName } from './naming'

describe('baseOutputName', () => {
  it('photo.png → photo.webp', () => {
    expect(baseOutputName('photo.png')).toBe('photo.webp')
  })

  it('只剥离最后一个扩展名：a.tar.gz → a.tar.webp', () => {
    expect(baseOutputName('a.tar.gz')).toBe('a.tar.webp')
  })

  it('无扩展名 → 原名 + .webp', () => {
    expect(baseOutputName('screenshot')).toBe('screenshot.webp')
  })

  it('大写扩展名同样剥离', () => {
    expect(baseOutputName('PHOTO.JPG')).toBe('PHOTO.webp')
  })
})

describe('allocateOutputName', () => {
  it('无冲突 → 基础名', () => {
    expect(allocateOutputName('a.png', new Set())).toBe('a.webp')
  })

  it('冲突 → 依次追加 _1、_2', () => {
    const taken = new Set(['a.webp'])
    expect(allocateOutputName('a.png', taken)).toBe('a_1.webp')

    taken.add('a_1.webp')
    expect(allocateOutputName('a.png', taken)).toBe('a_2.webp')
  })

  it('序号跳过已占用名称', () => {
    const taken = new Set(['a.webp', 'a_1.webp'])
    expect(allocateOutputName('a.png', taken)).toBe('a_2.webp')
  })

  it('确定性：相同输入 → 相同输出（重新转换不改变名称的基础）', () => {
    const taken = new Set(['a.webp'])
    expect(allocateOutputName('a.png', taken)).toBe(allocateOutputName('a.png', taken))
  })

  it('不同原始名不互相冲突', () => {
    expect(allocateOutputName('a.png', new Set(['b.webp']))).toBe('a.webp')
  })
})
