import { useLocaleStore } from '@/stores/locale'
import type { LocaleMessages } from '@/locales/types'
import zhCN from '@/locales/zh-CN'
import en from '@/locales/en'

type Locale = 'zh-CN' | 'en'

const messages: Record<Locale, LocaleMessages> = {
  'zh-CN': zhCN,
  'en': en,
}

/**
 * Lightweight i18n composable.
 *
 * Usage:
 * ```ts
 * const { t, locale, toggleLocale } = useI18n()
 * t('search')                  // => "搜索工具..."
 * t('categories.encode')       // => "编码转换"
 * t('tools.timestampConverter') // => "时间戳转换"
 * ```
 */
export function useI18n() {
  const store = useLocaleStore()

  /**
   * Translate a dot-separated key path.
   * Depends on store.locale (a ref) so any computed using t() will
   * reactively re-evaluate when locale changes.
   */
  function t(key: string, params?: Record<string, string>, fallback?: string): string {
    // Access store.locale to create a reactive dependency for computed
    const _locale = store.locale
    const messages_ = messages[_locale]

    const parts = key.split('.')
    let value: any = messages_
    for (const part of parts) {
      if (value == null || typeof value !== 'object') {
        return fallback ?? key
      }
      value = value[part]
    }
    if (typeof value !== 'string') {
      return fallback ?? key
    }
    if (params) {
      return value.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] ?? `{{${name}}}`)
    }
    return value
  }

  return {
    t,
    locale: store.locale,
    toggleLocale: store.toggleLocale,
    setLocale: store.setLocale,
  }
}
