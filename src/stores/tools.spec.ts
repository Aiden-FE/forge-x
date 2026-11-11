import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ToolMeta } from '@/types/tool'
import { useToolsStore } from './tools'
import { useToolActivityStore } from './toolActivity'

function tool(id: string, category: string): ToolMeta {
  return {
    id,
    name: id,
    description: 'match',
    category,
    icon: 'Box',
    component: {} as ToolMeta['component'],
    keywords: [id],
  }
}

function setup() {
  setActivePinia(createPinia())
  const activity = useToolActivityStore()
  const store = useToolsStore()
  store.registerTool(tool('a', 'text'))
  store.registerTool(tool('b', 'text'))
  store.registerTool(tool('c', 'format'))
  store.registerTool(tool('d', 'format'))
  return { store, activity }
}

function ids(store: ReturnType<typeof useToolsStore>): string[] {
  return store.filteredTools.map(tool => tool.id)
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('tools store 使用次数排序', () => {
  it('默认按静态注册顺序', () => {
    const { store } = setup()
    expect(ids(store)).toEqual(['a', 'b', 'c', 'd'])
    expect(store.categories[0].id).toBe('favorites')
    expect(store.categories[1].id).toBe('all')
  })

  it('全部按使用次数降序，同次数按注册顺序', () => {
    const { store, activity } = setup()
    activity.recordUse('b')
    activity.recordUse('b')
    activity.recordUse('c')

    expect(ids(store)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('0 次使用的工具排在使用过的工具之后，同次数仍按注册顺序', () => {
    const { store, activity } = setup()
    activity.recordUse('a')
    activity.recordUse('d')
    activity.recordUse('d')

    expect(ids(store)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('分类视图保持静态注册顺序，不受使用次数影响', () => {
    const { store, activity } = setup()
    activity.recordUse('d')
    activity.recordUse('d')
    store.setActiveCategory('format')

    expect(ids(store)).toEqual(['c', 'd'])
  })
})

describe('tools store 收藏视图', () => {
  it('只显示收藏，并按使用次数排序', () => {
    const { store, activity } = setup()
    activity.toggleFavorite('a')
    activity.toggleFavorite('c')
    store.setActiveCategory('favorites')

    expect(ids(store)).toEqual(['a', 'c'])

    activity.recordUse('c')
    expect(ids(store)).toEqual(['c', 'a'])
  })

  it('收藏视图与搜索叠加时仍按使用次数排序', () => {
    const { store, activity } = setup()
    activity.toggleFavorite('a')
    activity.toggleFavorite('c')
    activity.recordUse('c')
    store.setActiveCategory('favorites')
    store.setSearchQuery('match')

    expect(ids(store)).toEqual(['c', 'a'])
  })
})

describe('tools store 搜索与排序', () => {
  it('全部视图中搜索只过滤，不改变使用次数排序', () => {
    const { store, activity } = setup()
    activity.recordUse('c')
    store.setSearchQuery('match')

    expect(ids(store)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('分类视图中搜索保持静态顺序', () => {
    const { store, activity } = setup()
    activity.recordUse('d')
    store.setActiveCategory('format')
    store.setSearchQuery('match')

    expect(ids(store)).toEqual(['c', 'd'])
  })
})
