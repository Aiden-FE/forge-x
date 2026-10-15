import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import en from '@/locales/en'
import zhCN from '@/locales/zh-CN'
import { useProvidersStore } from '@/stores/providers'
import { runAiTextTask } from './task'
import { useAiTextTaskSelection } from './selection'

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

async function prepareProviders() {
  const store = useProvidersStore()
  const first = (await store.addProvider({
    name: 'First',
    baseURL: 'https://first.example.com',
    apiKey: 'key-first',
    models: ['first-default', 'first-other'],
    enabled: true,
  }))!
  const second = (await store.addProvider({
    name: 'Second',
    baseURL: 'https://second.example.com',
    apiKey: 'key-second',
    models: ['second-default', 'second-other'],
    enabled: true,
  }))!
  await store.addProvider({
    name: 'Disabled',
    baseURL: 'https://disabled.example.com',
    apiKey: 'key-disabled',
    models: ['disabled-model'],
    enabled: false,
  })
  await store.setDefaultProvider(first.id)
  await store.setProviderDefaultModel(first.id, 'first-default')
  await store.setProviderDefaultModel(second.id, 'second-default')

  return { store, first, second }
}

describe('AI 文本操作会话级供应商/模型选择', () => {
  it('初次进入使用默认供应商与默认模型，列出全部启用供应商', async () => {
    const { store, first, second } = await prepareProviders()
    const selection = useAiTextTaskSelection(store)

    expect(selection.activeProvider.value?.id).toBe(first.id)
    expect(selection.activeModelId.value).toBe('first-default')
    expect(store.enabledProviders.map(provider => provider.id)).toEqual([
      first.id,
      second.id,
    ])
  })

  it('临时切换供应商会级联重置模型，下一次调用可用新模型', async () => {
    const { store, second } = await prepareProviders()
    const selection = useAiTextTaskSelection(store)

    expect(selection.selectProvider(second.id)).toBe(true)
    expect(selection.activeProvider.value?.id).toBe(second.id)
    expect(selection.activeModelId.value).toBe('second-default')

    expect(selection.selectModel('second-other')).toBe(true)
    expect(selection.activeModelId.value).toBe('second-other')

    expect(store.defaultProviderId).not.toBe(second.id)
    const temporaryProvider = store.providers.find(provider => provider.id === second.id)!
    expect(temporaryProvider.defaultModelId).toBe('second-default')

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: 'session result' } }],
    }), { status: 200 }))
    const result = await runAiTextTask(
      selection.activeProvider.value,
      'translate',
      'hello',
      { modelId: selection.activeModelId.value, fetchImpl },
    )
    const request = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
    expect(result).toEqual({ kind: 'success', input: 'hello', output: 'session result' })
    expect(request.model).toBe('second-other')
  })

  it('拒绝禁用供应商和供应商外的模型，选择无效时不改变当前生效值', async () => {
    const { store, first, second } = await prepareProviders()
    const selection = useAiTextTaskSelection(store)

    const disabledId = store.providers.find(provider => provider.name === 'Disabled')!.id
    expect(selection.selectProvider(disabledId)).toBe(false)
    expect(selection.selectProvider('missing')).toBe(false)
    expect(selection.selectModel('first-other')).toBe(true)

    expect(selection.selectModel('second-other')).toBe(false)
    expect(selection.activeProvider.value?.id).toBe(first.id)
    expect(selection.activeModelId.value).toBe('first-other')

    expect(second.enabled).toBe(true)
  })

  it('移除临时模型时回退到该供应商生效默认，全局默认标记不变', async () => {
    const { store, first } = await prepareProviders()
    const selection = useAiTextTaskSelection(store)
    selection.selectModel('first-other')

    await store.removeProviderModel(first.id, 'first-other')
    expect(selection.activeModelId.value).toBe('first-default')
    expect(first.defaultModelId).toBe('first-default')
  })

  it('新会话重新进入工具时恢复全局默认，而不保留上次临时选择', async () => {
    const { store, first } = await prepareProviders()
    const previousSession = useAiTextTaskSelection(store)
    previousSession.selectProvider(store.providers[1]!.id)
    previousSession.selectModel('second-other')

    setActivePinia(createPinia())
    const restoredStore = useProvidersStore()
    const restoredSelection = useAiTextTaskSelection(restoredStore)

    expect(restoredSelection.activeProvider.value?.id).toBe(first.id)
    expect(restoredSelection.activeModelId.value).toBe('first-default')
    expect(restoredStore.defaultProviderId).toBe(first.id)
    expect(restoredStore.providers.find(provider => provider.id === first.id)?.defaultModelId).toBe('first-default')
  })
})

describe('AI 文本操作新增文案双语', () => {
  it('供应商选择器、当前选择和五任务文案在英文与中文都存在', () => {
    const taskIds = ['translate', 'polish', 'summarize', 'tone', 'explain'] as const
    for (const key of [
      'providerLabel',
      'modelLabel',
      'notSelected',
      'currentSelection',
      'resultLabel',
    ] as const) {
      expect(en.aiTextOps[key]).toBeTruthy()
      expect(zhCN.aiTextOps[key]).toBeTruthy()
    }

    for (const taskId of taskIds) {
      expect(en.aiTextOps.tasks[taskId]).toBeTruthy()
      expect(zhCN.aiTextOps.tasks[taskId]).toBeTruthy()
      expect(en.aiTextOps.running[taskId]).toBeTruthy()
      expect(zhCN.aiTextOps.running[taskId]).toBeTruthy()
    }
  })
})
