import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { LocaleMessages } from '@/locales/types'
import zhCN from '@/locales/zh-CN'
import en from '@/locales/en'

export type Locale = 'zh-CN' | 'en'

const STORAGE_KEY = 'forgex-locale'

const messages: Record<Locale, LocaleMessages> = {
  'zh-CN': zhCN,
  'en': en,
}

export const useLocaleStore = defineStore('locale', () => {
  function getInitialLocale(): Locale {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh-CN' || stored === 'en') return stored
    // Default to browser language if available
    const lang = navigator.language
    if (lang.startsWith('zh')) return 'zh-CN'
    return 'en'
  }

  const locale = ref<Locale>(getInitialLocale())
  const t = ref<LocaleMessages>(messages[locale.value])

  function updateMessages(l: Locale) {
    t.value = messages[l]
  }

  function toggleLocale() {
    locale.value = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  }

  function setLocale(l: Locale) {
    locale.value = l
  }

  watch(locale, (l) => {
    localStorage.setItem(STORAGE_KEY, l)
    updateMessages(l)
    // Update html lang attribute
    document.documentElement.setAttribute('lang', l)
  }, { immediate: true })

  return { locale, t, toggleLocale, setLocale }
})
