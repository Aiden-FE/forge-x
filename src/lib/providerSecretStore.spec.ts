import { describe, expect, it, vi } from 'vitest'
import {
  createDesktopProviderSecretStore,
  createLocalMetadataSecretStore,
} from './providerSecretStore'

describe('provider secret storage adapters', () => {
  it('keeps Web secrets in the provider metadata store without separate calls', async () => {
    const store = createLocalMetadataSecretStore()

    await expect(store.save('provider-1', 'secret')).resolves.toBeUndefined()
    await expect(store.load('provider-1')).resolves.toBeNull()
    await expect(store.remove('provider-1')).resolves.toBeUndefined()
    expect(store.persistApiKeyInMetadata).toBe(true)
  })

  it('routes Desktop secret operations to scoped Tauri commands', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce('stored-secret')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
    const store = createDesktopProviderSecretStore(invoke)

    await expect(store.load('provider-1')).resolves.toBe('stored-secret')
    await store.save('provider-1', 'next-secret')
    await store.remove('provider-1')

    expect(invoke.mock.calls).toEqual([
      ['provider_secret_get', { providerId: 'provider-1' }],
      ['provider_secret_set', { providerId: 'provider-1', apiKey: 'next-secret' }],
      ['provider_secret_delete', { providerId: 'provider-1' }],
    ])
    expect(store.persistApiKeyInMetadata).toBe(false)
  })

  it('rejects malformed provider identifiers before reaching native storage', async () => {
    const invoke = vi.fn()
    const store = createDesktopProviderSecretStore(invoke)

    await expect(store.load('')).rejects.toThrow('Invalid provider secret identifier')
    await expect(store.save('../escape', 'secret')).rejects.toThrow(
      'Invalid provider secret identifier',
    )
    await expect(store.remove('../escape')).rejects.toThrow('Invalid provider secret identifier')
    expect(invoke).not.toHaveBeenCalled()
  })
})
