export interface Provider {
  id: string
  name: string
  baseURL: string
  apiKey: string
  models: string[]
  enabled: boolean
  defaultModelId: string | null
}

export interface ProviderDraft {
  name: string
  baseURL: string
  apiKey: string
  models: string[]
  enabled: boolean
}

export type ProviderPatch = Partial<Omit<Provider, 'id'>>
