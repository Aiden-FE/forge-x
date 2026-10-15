import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const invoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}))

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

describe('providers store desktop secret adapter', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    vi.stubGlobal('localStorage', new MemoryStorage())
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes provider metadata without the API key and stores the key through Tauri', async () => {
    const { useProvidersStore } = await import('./providers')
    const store = useProvidersStore()
    const provider = await store.addProvider({
      name: 'Desktop',
      baseURL: 'https://desktop.example.com',
      apiKey: 'desktop-secret',
      models: [],
      enabled: true,
    })

    expect(provider).not.toBeNull()
    expect(provider?.apiKey).toBe('desktop-secret')
    expect(invoke).toHaveBeenCalledWith('provider_secret_set', {
      providerId: provider!.id,
      apiKey: 'desktop-secret',
    })

    const persisted = JSON.parse(localStorage.getItem('forgex-providers')!)
    expect(persisted.providers).toHaveLength(1)
    expect(persisted.providers[0].apiKey).toBe('')
    expect(localStorage.getItem('forgex-providers')).not.toContain('desktop-secret')
  })

  it('removes the native secret when the provider metadata is deleted', async () => {
    const { useProvidersStore } = await import('./providers')
    const store = useProvidersStore()
    const provider = await store.addProvider({
      name: 'Desktop',
      baseURL: 'https://desktop.example.com',
      apiKey: 'desktop-secret',
      models: [],
      enabled: true,
    })

    invoke.mockClear()
    invoke.mockResolvedValue(undefined)
    await expect(store.removeProvider(provider!.id)).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('provider_secret_delete', {
      providerId: provider!.id,
    })
    expect(JSON.parse(localStorage.getItem('forgex-providers')!).providers).toHaveLength(0)
  })
})
