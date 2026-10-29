import { describe, expect, it } from 'vitest'
import { allocateCleanedName, cleanedOutputName } from './naming'

describe('cleanedOutputName：basename_cleaned.ext（沿用「输出命名」术语）', () => {
  it('photo.jpg → photo_cleaned.jpg', () => {
    expect(cleanedOutputName('photo.jpg')).toBe('photo_cleaned.jpg')
  })

  it('只剥离最后一个扩展名：a.tar.jpg → a.tar_cleaned.jpg', () => {
    expect(cleanedOutputName('a.tar.jpg')).toBe('a.tar_cleaned.jpg')
  })

  it('无扩展名 → 原名 + _cleaned', () => {
    expect(cleanedOutputName('screenshot')).toBe('screenshot_cleaned')
  })

  it('保留原扩展名大小写：PHOTO.PNG → PHOTO_cleaned.PNG', () => {
    expect(cleanedOutputName('PHOTO.PNG')).toBe('PHOTO_cleaned.PNG')
  })

  it('格式不变：输出与输入同扩展名（不换格式）', () => {
    expect(cleanedOutputName('a.jpeg').endsWith('.jpeg')).toBe(true)
  })
})

describe('allocateCleanedName：批内冲突追加 _1、_2', () => {
  it('无冲突 → 基础名', () => {
    expect(allocateCleanedName('a.jpg', new Set())).toBe('a_cleaned.jpg')
  })

  it('冲突 → 依次追加 _1、_2', () => {
    const taken = new Set(['a_cleaned.jpg'])
    expect(allocateCleanedName('a.jpg', taken)).toBe('a_cleaned_1.jpg')

    taken.add('a_cleaned_1.jpg')
    expect(allocateCleanedName('a.jpg', taken)).toBe('a_cleaned_2.jpg')
  })

  it('序号跳过已占用名称', () => {
    const taken = new Set(['a_cleaned.jpg', 'a_cleaned_1.jpg'])
    expect(allocateCleanedName('a.jpg', taken)).toBe('a_cleaned_2.jpg')
  })

  it('不同原始名不互相冲突', () => {
    expect(allocateCleanedName('a.jpg', new Set(['b_cleaned.jpg']))).toBe('a_cleaned.jpg')
  })

  it('确定性：相同输入 → 相同输出', () => {
    const taken = new Set(['a_cleaned.jpg'])
    expect(allocateCleanedName('a.jpg', taken)).toBe(allocateCleanedName('a.jpg', taken))
  })
})
