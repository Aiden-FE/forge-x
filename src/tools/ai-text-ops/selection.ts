import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { Provider } from '@/types/provider'
import { resolveDefaultModel } from '@/lib/aiClient'
import type { useProvidersStore } from '@/stores/providers'

type ProvidersStore = ReturnType<typeof useProvidersStore>

export interface AiTextTaskSelection {
  readonly selectedProviderId: Ref<string | null>
  readonly selectedModelId: Ref<string | null>
  readonly activeProvider: ComputedRef<Provider | null>
  readonly activeModelId: ComputedRef<string | null>
  selectProvider: (providerId: string | null) => boolean
  selectModel: (modelId: string) => boolean
}

/**
 * Provider and model choices are intentionally component-local. The providers
 * store keeps its default markers unchanged so a remounted tool starts again
 * with the global defaults.
 */
export function useAiTextTaskSelection(store: ProvidersStore): AiTextTaskSelection {
  const selectedProviderId = ref<string | null>(store.effectiveDefaultProvider?.id ?? null)
  const selectedModelId = ref<string | null>(null)

  const activeProvider = computed(() => {
    const temporaryProvider = store.enabledProviders.find(
      provider => provider.id === selectedProviderId.value,
    )
    return temporaryProvider ?? store.effectiveDefaultProvider
  })

  const activeModelId = computed(() => {
    const provider = activeProvider.value
    if (!provider) return null

    const temporaryModel = selectedModelId.value
    if (temporaryModel && provider.models.includes(temporaryModel)) {
      return temporaryModel
    }
    return resolveDefaultModel(provider)
  })

  function selectProvider(providerId: string | null): boolean {
    if (providerId === null) return false
    const provider = store.enabledProviders.find(item => item.id === providerId)
    if (!provider) return false

    selectedProviderId.value = providerId
    selectedModelId.value = resolveDefaultModel(provider)
    return true
  }

  function selectModel(modelId: string): boolean {
    const provider = activeProvider.value
    if (!provider || !provider.models.includes(modelId)) return false

    selectedModelId.value = modelId
    return true
  }

  return {
    selectedProviderId,
    selectedModelId,
    activeProvider,
    activeModelId,
    selectProvider,
    selectModel,
  }
}
