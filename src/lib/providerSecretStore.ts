import { isTauri } from '@/lib/desktop'

export interface ProviderSecretStore {
  /**
   * Web uses the existing provider blob as its secret storage. Desktop uses
   * this flag to strip `apiKey` from that blob before persisting metadata.
   */
  readonly persistApiKeyInMetadata: boolean
  load(providerId: string): Promise<string | null>
  save(providerId: string, apiKey: string): Promise<void>
  remove(providerId: string): Promise<void>
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

function assertProviderId(providerId: string): string {
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    throw new Error('Invalid provider secret identifier')
  }
  return providerId
}

export function createLocalMetadataSecretStore(): ProviderSecretStore {
  return {
    persistApiKeyInMetadata: true,
    async load() {
      return null
    },
    async save() {},
    async remove() {},
  }
}

async function defaultInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export function createDesktopProviderSecretStore(
  invoke: TauriInvoke = defaultInvoke,
): ProviderSecretStore {
  return {
    persistApiKeyInMetadata: false,
    async load(providerId) {
      return invoke<string | null>('provider_secret_get', {
        providerId: assertProviderId(providerId),
      })
    },
    async save(providerId, apiKey) {
      if (!apiKey) throw new Error('Provider API key cannot be empty')
      await invoke<void>('provider_secret_set', {
        apiKey,
        providerId: assertProviderId(providerId),
      })
    },
    async remove(providerId) {
      await invoke<void>('provider_secret_delete', {
        providerId: assertProviderId(providerId),
      })
    },
  }
}

export function createProviderSecretStore(isDesktop = isTauri): ProviderSecretStore {
  return isDesktop
    ? createDesktopProviderSecretStore()
    : createLocalMetadataSecretStore()
}
