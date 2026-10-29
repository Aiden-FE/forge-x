import { useLocaleStore } from '@/stores/locale'
import { storeToRefs } from 'pinia'
import type { LocaleMessages, MessageNode, ToolLocaleFragment } from '@/locales/types'
import zhCN from '@/locales/zh-CN'
import en from '@/locales/en'

type Locale = 'zh-CN' | 'en'

const messages: Record<Locale, LocaleMessages> = {
  'zh-CN': zhCN,
  'en': en,
}

// Per-tool fragments (src/locales/tools/<id>.ts) are deep-merged over the base
// messages so each tool owns its strings without touching shared locale files.
const toolFragments = import.meta.glob<{ default: ToolLocaleFragment }>(
  '../locales/tools/*.ts',
  { eager: true },
)

function isMessageNode(value: unknown): value is Record<string, MessageNode> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeFragment(base: Record<string, MessageNode>, fragment: Record<string, MessageNode>): void {
  for (const key of Object.keys(fragment)) {
    const incoming = fragment[key]
    const existing = base[key]
    if (isMessageNode(incoming) && isMessageNode(existing)) {
      mergeFragment(existing, incoming)
    } else {
      base[key] = incoming
    }
  }
}

for (const path in toolFragments) {
  const fragment = toolFragments[path].default
  for (const locale of ['zh-CN', 'en'] as const) {
    const part = fragment[locale]
    if (part) mergeFragment(messages[locale] as Record<string, MessageNode>, part)
  }
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
  const { locale } = storeToRefs(store)

  /**
   * Translate a dot-separated key path.
   * Depends on the locale ref (via storeToRefs) so any computed using t()
   * will reactively re-evaluate when locale changes.
   */
  function t(key: string, params?: Record<string, string>, fallback?: string): string {
    // Access locale.value to register reactive dependency in computed
    const _locale = locale.value
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
    locale,
    toggleLocale: store.toggleLocale,
    setLocale: store.setLocale,
  }
}
