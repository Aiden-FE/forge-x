import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createProviderSecretStore, type ProviderSecretStore } from '@/lib/providerSecretStore'
import type { Provider, ProviderDraft, ProviderPatch } from '@/types/provider'
import { normalizeProviderBaseUrl } from '@/lib/providers'

const STORAGE_KEY = 'forgex-providers'

interface PersistedProvidersState {
  providers: Provider[]
  defaultProviderId: string | null
  /** Desktop-only fallback used to migrate pre-keyring localStorage entries. */
  legacySecrets: Map<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createProviderId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function uniqueModels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .filter((model): model is string => typeof model === 'string')
      .map(model => model.trim())
      .filter(Boolean),
  )]
}

function parseProvider(value: unknown, allowEmptyApiKey = false): Provider | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.apiKey !== 'string' ||
    typeof value.baseURL !== 'string'
  ) {
    return null
  }

  const baseURL = normalizeProviderBaseUrl(value.baseURL)
  if (!value.id.trim() || !value.name.trim() || (!allowEmptyApiKey && !value.apiKey.trim()) || !baseURL) {
    return null
  }

  const models = uniqueModels(value.models)
  const defaultModelId = typeof value.defaultModelId === 'string' && models.includes(value.defaultModelId)
    ? value.defaultModelId
    : null

  return {
    id: value.id,
    name: value.name.trim(),
    baseURL,
    apiKey: value.apiKey.trim(),
    models,
    enabled: value.enabled === true,
    defaultModelId,
  }
}

function readPersistedState(secretStore: ProviderSecretStore): PersistedProvidersState {
  const emptyState: PersistedProvidersState = {
    providers: [],
    defaultProviderId: null,
    legacySecrets: new Map(),
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.providers)) {
      return emptyState
    }

    const desktopMetadata = !secretStore.persistApiKeyInMetadata
    const providers = parsed.providers
      .map(provider => parseProvider(provider, desktopMetadata))
      .filter((provider): provider is Provider => provider !== null)
    const legacySecrets = new Map(
      desktopMetadata
        ? providers
          .filter(provider => provider.apiKey !== '')
          .map(provider => [provider.id, provider.apiKey] as const)
        : [],
    )
    if (desktopMetadata) {
      for (const provider of providers) provider.apiKey = ''
    }

    const defaultProviderId = typeof parsed.defaultProviderId === 'string'
      && providers.some(provider => provider.id === parsed.defaultProviderId)
      ? parsed.defaultProviderId
      : null

    return { providers, defaultProviderId, legacySecrets }
  } catch {
    return emptyState
  }
}

export const useProvidersStore = defineStore('providers', () => {
  const secretStore = createProviderSecretStore()
  const initialState = readPersistedState(secretStore)
  const providers = ref<Provider[]>(initialState.providers)
  const defaultProviderId = ref<string | null>(initialState.defaultProviderId)

  const enabledProviders = computed(() => providers.value.filter(provider => provider.enabled))
  const defaultProvider = computed(() =>
    providers.value.find(provider => provider.id === defaultProviderId.value) ?? null,
  )
  const effectiveDefaultProvider = computed(() => {
    const provider = defaultProvider.value
    return provider?.enabled ? provider : null
  })

  async function hydrateSecrets(): Promise<void> {
    if (secretStore.persistApiKeyInMetadata) return

    await Promise.all(providers.value.map(async (provider) => {
      const storedSecret = await secretStore.load(provider.id)
      if (storedSecret) {
        provider.apiKey = storedSecret
        return
      }

      const legacySecret = initialState.legacySecrets.get(provider.id)
      if (legacySecret) {
        await secretStore.save(provider.id, legacySecret)
        provider.apiKey = legacySecret
      }
    }))
    persist()
  }

  const secretsReady = hydrateSecrets()
  // Avoid an unhandled rejection when startup fails before the first mutation.
  secretsReady.catch(() => {})

  async function ensureSecretsReady(): Promise<void> {
    await secretsReady
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        providers: secretStore.persistApiKeyInMetadata
          ? providers.value
          : providers.value.map(provider => ({ ...provider, apiKey: '' })),
        defaultProviderId: defaultProviderId.value,
      }))
    } catch {
      // localStorage can be unavailable in private browsing; settings stay in memory.
    }
  }

  async function addProvider(draft: ProviderDraft): Promise<Provider | null> {
    await ensureSecretsReady()
    const baseURL = normalizeProviderBaseUrl(draft.baseURL)
    const name = draft.name.trim()
    const apiKey = draft.apiKey.trim()
    if (!name || !apiKey || !baseURL) return null

    const models = uniqueModels(draft.models)
    const provider: Provider = {
      id: createProviderId(),
      name,
      baseURL,
      apiKey,
      models,
      enabled: draft.enabled,
      defaultModelId: null,
    }
    await secretStore.save(provider.id, provider.apiKey)
    providers.value.push(provider)
    persist()
    return provider
  }

  async function updateProvider(id: string, patch: ProviderPatch): Promise<boolean> {
    await ensureSecretsReady()
    const provider = providers.value.find(item => item.id === id)
    if (!provider) return false

    const baseURL = patch.baseURL === undefined
      ? provider.baseURL
      : normalizeProviderBaseUrl(patch.baseURL)
    if (!baseURL) return false

    const name = patch.name === undefined ? provider.name : patch.name.trim()
    const apiKey = patch.apiKey === undefined ? provider.apiKey : patch.apiKey.trim()
    if (!name || !apiKey) return false

    const models = patch.models === undefined ? [...provider.models] : uniqueModels(patch.models)
    const requestedDefaultModelId = patch.defaultModelId === undefined
      ? provider.defaultModelId
      : patch.defaultModelId
    const defaultModelId = requestedDefaultModelId && models.includes(requestedDefaultModelId)
      ? requestedDefaultModelId
      : null

    if (apiKey !== provider.apiKey) {
      await secretStore.save(id, apiKey)
    }
    provider.name = name
    provider.baseURL = baseURL
    provider.apiKey = apiKey
    provider.models = models
    provider.enabled = patch.enabled ?? provider.enabled
    provider.defaultModelId = defaultModelId
    persist()
    return true
  }

  async function removeProvider(id: string): Promise<boolean> {
    await ensureSecretsReady()
    const index = providers.value.findIndex(provider => provider.id === id)
    if (index === -1) return false

    await secretStore.remove(id)
    providers.value.splice(index, 1)
    if (defaultProviderId.value === id) {
      defaultProviderId.value = null
    }
    persist()
    return true
  }

  async function setDefaultProvider(id: string | null): Promise<boolean> {
    await ensureSecretsReady()
    if (id === null) {
      defaultProviderId.value = null
      persist()
      return true
    }
    if (!providers.value.some(provider => provider.id === id)) return false

    defaultProviderId.value = id
    persist()
    return true
  }

  async function addProviderModel(id: string, modelId: string): Promise<boolean> {
    await ensureSecretsReady()
    const provider = providers.value.find(item => item.id === id)
    const normalizedModelId = modelId.trim()
    if (!provider || !normalizedModelId || provider.models.includes(normalizedModelId)) {
      return false
    }

    provider.models.push(normalizedModelId)
    persist()
    return true
  }

  async function removeProviderModel(id: string, modelId: string): Promise<boolean> {
    await ensureSecretsReady()
    const provider = providers.value.find(item => item.id === id)
    const index = provider?.models.indexOf(modelId) ?? -1
    if (!provider || index === -1) return false

    provider.models.splice(index, 1)
    if (provider.defaultModelId === modelId) {
      provider.defaultModelId = provider.models[0] ?? null
    }
    persist()
    return true
  }

  async function setProviderDefaultModel(id: string, modelId: string | null): Promise<boolean> {
    await ensureSecretsReady()
    const provider = providers.value.find(item => item.id === id)
    if (!provider) return false
    if (modelId === null) {
      provider.defaultModelId = null
      persist()
      return true
    }
    if (!provider.models.includes(modelId)) return false

    provider.defaultModelId = modelId
    persist()
    return true
  }

  if (secretStore.persistApiKeyInMetadata) persist()

  return {
    providers,
    defaultProviderId,
    enabledProviders,
    defaultProvider,
    effectiveDefaultProvider,
    addProvider,
    updateProvider,
    removeProvider,
    setDefaultProvider,
    addProviderModel,
    removeProviderModel,
    setProviderDefaultModel,
    providersReady: secretsReady,
  }
})
