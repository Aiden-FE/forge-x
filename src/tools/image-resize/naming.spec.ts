import { describe, expect, it } from 'vitest'
import { OUTPUT_EXT } from './encode'
import { allocateOutputName, baseOutputName } from './naming'

describe('baseOutputName basename + 输出格式扩展名', () => {
  it('photo.png → photo.jpg（JPEG 输出）', () => {
    expect(baseOutputName('photo.png', OUTPUT_EXT.jpeg)).toBe('photo.jpg')
  })

  it('photo.png → photo.png（PNG 输出，重编码仍换名逻辑一致）', () => {
    expect(baseOutputName('photo.png', OUTPUT_EXT.png)).toBe('photo.png')
  })

  it('photo.png → photo.webp（WebP 输出）', () => {
    expect(baseOutputName('photo.png', OUTPUT_EXT.webp)).toBe('photo.webp')
  })

  it('只剥离最后一个扩展名：a.tar.gz → a.tar.png', () => {
    expect(baseOutputName('a.tar.gz', OUTPUT_EXT.png)).toBe('a.tar.png')
  })

  it('无扩展名 → 原名 + 扩展名', () => {
    expect(baseOutputName('screenshot', OUTPUT_EXT.webp)).toBe('screenshot.webp')
  })

  it('大写扩展名同样剥离', () => {
    expect(baseOutputName('PHOTO.JPG', OUTPUT_EXT.webp)).toBe('PHOTO.webp')
  })
})

describe('allocateOutputName 批内冲突 _1/_2', () => {
  it('无冲突 → 基础名', () => {
    expect(allocateOutputName('a.png', OUTPUT_EXT.webp, new Set())).toBe('a.webp')
  })

  it('冲突 → 依次追加 _1、_2', () => {
    const taken = new Set(['a.webp'])
    expect(allocateOutputName('a.png', OUTPUT_EXT.webp, taken)).toBe('a_1.webp')

    taken.add('a_1.webp')
    expect(allocateOutputName('a.png', OUTPUT_EXT.webp, taken)).toBe('a_2.webp')
  })

  it('序号跳过已占用名称', () => {
    const taken = new Set(['a.jpg', 'a_1.jpg'])
    expect(allocateOutputName('a.png', OUTPUT_EXT.jpeg, taken)).toBe('a_2.jpg')
  })

  it('不同输出扩展名互不冲突', () => {
    expect(allocateOutputName('a.png', OUTPUT_EXT.jpeg, new Set(['a.webp']))).toBe('a.jpg')
  })

  it('确定性：相同输入 → 相同输出（重新转换不改变名称的基础）', () => {
    const taken = new Set(['a.webp'])
    expect(allocateOutputName('a.png', OUTPUT_EXT.webp, taken)).toBe(
      allocateOutputName('a.png', OUTPUT_EXT.webp, taken),
    )
  })
})
