import { describe, expect, it } from 'vitest'
import { allocateConflictName, fgxOutputName } from './naming'

describe('FGX1 v2 输出命名（沿 WebP 先例）', () => {
  it('basename + .fgx（仅剥离最后一个扩展名）', () => {
    expect(fgxOutputName('photo.png')).toBe('photo.fgx')
    expect(fgxOutputName('archive.tar.gz')).toBe('archive.tar.fgx')
    expect(fgxOutputName('noext')).toBe('noext.fgx')
    expect(fgxOutputName('.dotfile')).toBe('.dotfile.fgx') // 前导点非扩展名分隔
  })

  it('批内冲突追加 _1/_2 序号', () => {
    expect(allocateConflictName('a.fgx', new Set())).toBe('a.fgx')
    expect(allocateConflictName('a.fgx', new Set(['a.fgx']))).toBe('a_1.fgx')
    expect(allocateConflictName('a.fgx', new Set(['a.fgx', 'a_1.fgx']))).toBe('a_2.fgx')
    expect(allocateConflictName('a.fgx', new Set(['a.fgx', 'a_1.fgx', 'a_2.fgx']))).toBe('a_3.fgx')
  })

  it('无扩展名的解密原名同样避冲突', () => {
    expect(allocateConflictName('data', new Set(['data']))).toBe('data_1')
    expect(allocateConflictName('data', new Set(['data', 'data_1']))).toBe('data_2')
  })

  it('纯分配不修改 taken（登记由调用方负责）', () => {
    const taken = new Set(['a.fgx'])
    allocateConflictName('a.fgx', taken)
    expect(taken.size).toBe(1)
  })
})
