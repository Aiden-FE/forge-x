import { ref } from 'vue'
import { defineStore } from 'pinia'

export const FAVORITES_STORAGE_KEY = 'forgex-favorites'
export const USAGE_STORAGE_KEY = 'forgex-tool-usage'

export type UsageCounts = Record<string, number>

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    // Private browsing or a blocked storage area: keep the in-memory state only.
  }
}

function parseFavorites(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const favorites: string[] = []
    for (const value of parsed) {
      if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue
      seen.add(value)
      favorites.push(value)
    }
    return favorites
  } catch {
    return []
  }
}

function parseUsageCounts(raw: string | null): UsageCounts {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const counts: UsageCounts = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (id.length === 0) continue
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) continue
      counts[id] = value
    }
    return counts
  } catch {
    return {}
  }
}

export const useToolActivityStore = defineStore('toolActivity', () => {
  const favorites = ref<string[]>(parseFavorites(readStorage(FAVORITES_STORAGE_KEY)))
  const usageCounts = ref<UsageCounts>(parseUsageCounts(readStorage(USAGE_STORAGE_KEY)))

  function isFavorite(id: string): boolean {
    return favorites.value.includes(id)
  }

  function toggleFavorite(id: string): void {
    if (!id) return
    favorites.value = isFavorite(id)
      ? favorites.value.filter(favorite => favorite !== id)
      : [...favorites.value, id]
    writeStorage(FAVORITES_STORAGE_KEY, JSON.stringify(favorites.value))
  }

  function usageCount(id: string): number {
    return usageCounts.value[id] ?? 0
  }

  function recordUse(id: string): void {
    if (!id) return
    usageCounts.value = { ...usageCounts.value, [id]: usageCount(id) + 1 }
    writeStorage(USAGE_STORAGE_KEY, JSON.stringify(usageCounts.value))
  }

  return { favorites, usageCounts, isFavorite, toggleFavorite, usageCount, recordUse }
})
