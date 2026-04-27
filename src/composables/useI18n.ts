import { useLocaleStore } from '@/stores/locale'

/**
 * Lightweight i18n composable.
 *
 * Usage:
 * ```ts
 * const { t, locale, toggleLocale } = useI18n()
 * t('search')           // => "搜索工具..."
 * t('categories.encode') // => "编码转换"
 * t('tools.timestampConverter') // => "时间戳转换"
 * ```
 */
export function useI18n() {
  const store = useLocaleStore()

  /**
   * Translate a dot-separated key path.
   * Supports nested access and template interpolation:
   * t('welcome', { name: 'ForgeX' })
   */
  function t(key: string, params?: Record<string, string>, fallback?: string): string {
    const parts = key.split('.')
    let value: any = store.t
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
