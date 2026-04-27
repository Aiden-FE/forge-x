import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'forgex-theme'

export const useThemeStore = defineStore('theme', () => {
  // Initialize from localStorage or system preference
  function getInitialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
    return 'dark'
  }

  const theme = ref<Theme>(getInitialTheme())

  function applyTheme(t: Theme) {
    document.documentElement.setAttribute('data-theme', t)
    // Update the meta theme-color for mobile browser chrome
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', t === 'dark' ? '#08090a' : '#ffffff')
    }
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function setTheme(t: Theme) {
    theme.value = t
  }

  // Persist and apply when theme changes
  watch(theme, (t) => {
    localStorage.setItem(STORAGE_KEY, t)
    applyTheme(t)
  }, { immediate: true })

  return { theme, toggleTheme, setTheme }
})
