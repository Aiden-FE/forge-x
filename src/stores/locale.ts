import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type Locale = 'zh-CN' | 'en'

const STORAGE_KEY = 'forgex-locale'

export const useLocaleStore = defineStore('locale', () => {
  function getInitialLocale(): Locale {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh-CN' || stored === 'en') return stored
    const lang = navigator.language
    if (lang.startsWith('zh')) return 'zh-CN'
    return 'en'
  }

  const locale = ref<Locale>(getInitialLocale())

  function toggleLocale() {
    locale.value = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  }

  function setLocale(l: Locale) {
    locale.value = l
  }

  watch(locale, (l) => {
    localStorage.setItem(STORAGE_KEY, l)
    document.documentElement.setAttribute('lang', l)
  }, { immediate: true })

  return { locale, toggleLocale, setLocale }
})
