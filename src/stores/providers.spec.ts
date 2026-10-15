import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProvidersStore } from './providers'
import { buildChatCompletionsUrl, normalizeProviderBaseUrl } from '@/lib/providers'

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

function createProviderInput(name: string) {
  return {
    name,
    baseURL: `https://${name}.example.com`,
    apiKey: `key-${name}`,
    models: [],
    enabled: true,
  }
}

function createDisabledProviderInput(name: string) {
  return { ...createProviderInput(name), enabled: false }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('providers store 默认供应商语义', () => {
  it('初始没有默认供应商，且只接受既有供应商作为默认值', async () => {
    const store = useProvidersStore()
    expect(store.defaultProviderId).toBeNull()
    expect(store.defaultProvider).toBeNull()

    const provider = await store.addProvider(createProviderInput('one'))
    expect(provider).not.toBeNull()
    expect(await store.setDefaultProvider('missing')).toBe(false)
    expect(store.defaultProviderId).toBeNull()

    expect(await store.setDefaultProvider(provider!.id)).toBe(true)
    expect(store.defaultProviderId).toBe(provider!.id)
    expect(store.defaultProvider?.name).toBe('one')
  })

  it('切换默认供应商是单选替换，删除默认供应商时清除标记', async () => {
    const store = useProvidersStore()
    const first = await store.addProvider(createProviderInput('first'))
    const second = await store.addProvider(createProviderInput('second'))

    await store.setDefaultProvider(first!.id)
    await store.setDefaultProvider(second!.id)
    expect(store.defaultProviderId).toBe(second!.id)

    await store.removeProvider(second!.id)
    expect(store.defaultProviderId).toBeNull()
    expect(store.defaultProvider).toBeNull()
  })
})

describe('providers store 默认模型语义', () => {
  it('供应商内默认模型是单选标记，切换后只有一个首选模型', async () => {
    const store = useProvidersStore()
    const provider = await store.addProvider(createProviderInput('ai'))
    await store.addProviderModel(provider!.id, 'model-a')
    await store.addProviderModel(provider!.id, 'model-b')
    const stored = store.providers[0]!

    expect(stored.defaultModelId).toBeNull()
    expect(await store.setProviderDefaultModel(provider!.id, 'model-a')).toBe(true)
    expect(await store.setProviderDefaultModel(provider!.id, 'model-b')).toBe(true)
    expect(stored.defaultModelId).toBe('model-b')
    expect(await store.setProviderDefaultModel(provider!.id, 'missing')).toBe(false)
    expect(stored.defaultModelId).toBe('model-b')
  })

  it('删除默认模型时回退到剩余首个模型，删除最后一个模型时清除标记', async () => {
    const store = useProvidersStore()
    const provider = await store.addProvider(createProviderInput('ai'))
    await store.addProviderModel(provider!.id, 'model-a')
    await store.addProviderModel(provider!.id, 'model-b')
    const stored = store.providers[0]!

    await store.setProviderDefaultModel(provider!.id, 'model-a')
    await store.removeProviderModel(provider!.id, 'model-a')
    expect(stored.models).toEqual(['model-b'])
    expect(stored.defaultModelId).toBe('model-b')

    await store.removeProviderModel(provider!.id, 'model-b')
    expect(stored.models).toEqual([])
    expect(stored.defaultModelId).toBeNull()
  })
})

describe('providers store 启用过滤', () => {
  it('禁用供应商被可用列表过滤，但默认标记保留且重新启用后恢复有效', async () => {
    const store = useProvidersStore()
    const enabled = await store.addProvider(createProviderInput('enabled'))
    const disabled = await store.addProvider(createDisabledProviderInput('disabled'))
    await store.setDefaultProvider(disabled!.id)

    expect(store.enabledProviders.map(provider => provider.id)).toEqual([enabled!.id])
    expect(store.defaultProviderId).toBe(disabled!.id)
    expect(store.defaultProvider?.id).toBe(disabled!.id)
    expect(store.effectiveDefaultProvider).toBeNull()

    await store.updateProvider(enabled!.id, { enabled: false })
    expect(store.enabledProviders).toHaveLength(0)

    await store.updateProvider(enabled!.id, { enabled: true })
    await store.updateProvider(disabled!.id, { enabled: true })
    expect(store.enabledProviders.map(provider => provider.id)).toEqual([enabled!.id, disabled!.id])
    expect(store.effectiveDefaultProvider?.id).toBe(disabled!.id)
  })
})

describe('providers store localStorage 持久化', () => {
  it('新增与默认标记立即写入 localStorage，新 store 读取后完整还原', async () => {
    const store = useProvidersStore()
    const provider = await store.addProvider(createProviderInput('persisted'))
    await store.addProviderModel(provider!.id, 'model-a')
    await store.addProviderModel(provider!.id, 'model-b')
    await store.setProviderDefaultModel(provider!.id, 'model-b')
    await store.setDefaultProvider(provider!.id)

    const persisted = JSON.parse(localStorage.getItem('forgex-providers')!)
    expect(persisted.defaultProviderId).toBe(provider!.id)
    expect(persisted.providers).toHaveLength(1)

    setActivePinia(createPinia())
    const restored = useProvidersStore()
    expect(restored.providers).toEqual(store.providers)
    expect(restored.defaultProviderId).toBe(provider!.id)
    expect(restored.providers[0]?.apiKey).toBe('key-persisted')
    expect(restored.providers[0]?.defaultModelId).toBe('model-b')

    await restored.removeProvider(provider!.id)
    const afterRemoval = JSON.parse(localStorage.getItem('forgex-providers')!)
    expect(afterRemoval.providers).toHaveLength(0)
    expect(afterRemoval.defaultProviderId).toBeNull()
  })
})

describe('provider baseURL 根地址语义', () => {
  it('接受 HTTP(S) 根地址并规范化末尾根路径', () => {
    expect(normalizeProviderBaseUrl('https://api.example.com')).toBe('https://api.example.com')
    expect(normalizeProviderBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434')
  })

  it('拒绝路径、查询、hash、登录信息和非 HTTP(S)', () => {
    expect(normalizeProviderBaseUrl('https://api.example.com/v1')).toBeNull()
    expect(normalizeProviderBaseUrl('https://api.example.com?team=x')).toBeNull()
    expect(normalizeProviderBaseUrl('https://api.example.com/#cache')).toBeNull()
    expect(normalizeProviderBaseUrl('https://user:key@api.example.com')).toBeNull()
    expect(normalizeProviderBaseUrl('ftp://api.example.com')).toBeNull()
    expect(normalizeProviderBaseUrl('not-a-url')).toBeNull()
  })

  it('请求 URL 工具固定拼接 chat completions 标准路径', () => {
    expect(buildChatCompletionsUrl('https://api.example.com')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
  })
})
