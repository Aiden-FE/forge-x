import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  FAVORITES_STORAGE_KEY,
  USAGE_STORAGE_KEY,
  useToolActivityStore,
} from './toolActivity'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toolActivity store 收藏', () => {
  it('默认空收藏，切换收藏并持久化', () => {
    const store = useToolActivityStore()
    expect(store.favorites).toEqual([])
    expect(store.isFavorite('json-formatter')).toBe(false)

    store.toggleFavorite('json-formatter')
    expect(store.isFavorite('json-formatter')).toBe(true)
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)).toEqual(['json-formatter'])

    setActivePinia(createPinia())
    const reloaded = useToolActivityStore()
    expect(reloaded.isFavorite('json-formatter')).toBe(true)

    reloaded.toggleFavorite('json-formatter')
    expect(reloaded.favorites).toEqual([])
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)).toEqual([])
  })

  it('空 id 不写入收藏', () => {
    const store = useToolActivityStore()
    store.toggleFavorite('')
    expect(store.favorites).toEqual([])
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBeNull()
  })
})

describe('toolActivity store 使用次数', () => {
  it('按工具累计并持久化', () => {
    const store = useToolActivityStore()
    expect(store.usageCount('json-formatter')).toBe(0)

    store.recordUse('json-formatter')
    store.recordUse('json-formatter')
    store.recordUse('base64-codec')

    expect(store.usageCount('json-formatter')).toBe(2)
    expect(store.usageCount('base64-codec')).toBe(1)
    expect(JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY)!)).toEqual({
      'json-formatter': 2,
      'base64-codec': 1,
    })

    setActivePinia(createPinia())
    const reloaded = useToolActivityStore()
    expect(reloaded.usageCount('json-formatter')).toBe(2)
    expect(reloaded.usageCount('base64-codec')).toBe(1)
  })

  it('空 id 不计数', () => {
    const store = useToolActivityStore()
    store.recordUse('')
    expect(store.usageCounts).toEqual({})
    expect(localStorage.getItem(USAGE_STORAGE_KEY)).toBeNull()
  })
})

describe('toolActivity store 坏数据', () => {
  it('收藏坏 JSON 只清空收藏，不影响使用次数', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, '{not json')
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify({ a: 3 }))
    setActivePinia(createPinia())

    const store = useToolActivityStore()
    expect(store.favorites).toEqual([])
    expect(store.usageCount('a')).toBe(3)
  })

  it('使用次数坏 JSON 只清空计数，不影响收藏', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(['a']))
    localStorage.setItem(USAGE_STORAGE_KEY, 'null')
    setActivePinia(createPinia())

    const store = useToolActivityStore()
    expect(store.isFavorite('a')).toBe(true)
    expect(store.usageCounts).toEqual({})
  })

  it('忽略非法收藏项与非法计数', () => {
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(['a', 1, 'a', '', null, 'b']),
    )
    localStorage.setItem(
      USAGE_STORAGE_KEY,
      JSON.stringify({ a: 2, b: -1, c: 1.5, d: '3', e: 0, '': 4 }),
    )
    setActivePinia(createPinia())

    const store = useToolActivityStore()
    expect(store.favorites).toEqual(['a', 'b'])
    expect(store.usageCount('a')).toBe(2)
    expect(store.usageCount('b')).toBe(0)
    expect(store.usageCount('c')).toBe(0)
    expect(store.usageCount('d')).toBe(0)
    expect(store.usageCount('e')).toBe(0)
  })

  it('localStorage 抛错时 store 仍可用（仅内存状态）', () => {
    vi.stubGlobal('localStorage', {
      get length(): number {
        throw new Error('blocked')
      },
      clear: () => {
        throw new Error('blocked')
      },
      getItem: () => {
        throw new Error('blocked')
      },
      key: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage)
    setActivePinia(createPinia())

    const store = useToolActivityStore()
    expect(store.favorites).toEqual([])
    expect(() => {
      store.toggleFavorite('a')
      store.recordUse('a')
    }).not.toThrow()
    expect(store.isFavorite('a')).toBe(true)
    expect(store.usageCount('a')).toBe(1)
  })
})
