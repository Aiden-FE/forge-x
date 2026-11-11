<template>
  <header class="header">
    <div class="header-brand" @click="goHome">
      <span class="logo">🔥</span>
      <span class="title">ForgeX</span>
    </div>
    <div class="header-search">
      <Search class="search-icon" :size="18" />
      <input
        v-model="query"
        type="text"
        :placeholder="t('search')"
        class="search-input"
        @input="onSearch"
        @keydown="handleKeydown"
      />
    </div>
    <div class="header-actions">
      <button class="action-btn" :title="t('settings.title')" @click="openSettings">
        <Settings :size="18" />
      </button>
      <button class="action-btn" @click="storeLocale.toggleLocale()" :title="storeLocale.locale === 'zh-CN' ? t('lang.switchToEn') : t('lang.switchToCn')">
        {{ storeLocale.locale === 'zh-CN' ? 'EN' : '中' }}
      </button>
      <button class="action-btn" @click="storeTheme.toggleTheme()" :title="storeTheme.theme === 'dark' ? t('theme.toggleLight') : t('theme.toggleDark')">
        <Sun v-if="storeTheme.theme === 'light'" :size="18" />
        <Moon v-else :size="18" />
      </button>
      <button class="menu-btn" @click="$emit('toggle-sidebar')">
        <Menu :size="20" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Menu, Sun, Moon, Settings } from 'lucide-vue-next'
import { useToolsStore } from '@/stores/tools'
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'
import { useI18n } from '@/composables/useI18n'
import { isTextEntryTarget } from '@/lib/textEntryTarget'

const emit = defineEmits(['toggle-sidebar'])
const router = useRouter()
const store = useToolsStore()
const storeTheme = useThemeStore()
const storeLocale = useLocaleStore()
const { t } = useI18n()
const query = ref(store.searchQuery)

function onSearch() {
  store.setSearchQuery(query.value)
}

/** Enter in the search box jumps to the first matching tool. */
function handleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const filtered = store.filteredTools
  if (filtered.length > 0) {
    router.push(`/tool/${filtered[0].id}`)
  }
}

/**
 * Global `/` shortcut. It must yield while the user is typing in any text
 * entry surface (otherwise slashes are swallowed mid-input) and must not
 * steal modified or composing keys.
 */
function handleGlobalShortcut(e: KeyboardEvent) {
  if (e.key !== '/' || e.defaultPrevented || e.isComposing) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (isTextEntryTarget(e.target)) return
  e.preventDefault()
  focusSearch()
}

function focusSearch() {
  document.querySelector<HTMLInputElement>('.search-input')?.focus()
}

function goHome() {
  router.push('/')
}

function openSettings() {
  router.push({ name: 'provider-settings' })
}

onMounted(() => window.addEventListener('keydown', handleGlobalShortcut))
onUnmounted(() => window.removeEventListener('keydown', handleGlobalShortcut))
</script>

<style scoped>
.header {
  height: var(--header-height);
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-lg);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  user-select: none;
}

.logo { font-size: 20px; }
.title {
  font-weight: 510;
  font-size: 16px;
  color: var(--text-primary);
}

.header-search {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-md);
  flex: 1;
  max-width: 400px;
}

.search-icon { color: var(--text-tertiary); }

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 14px;
}

.search-input::placeholder { color: var(--text-tertiary); }

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

@media (max-width: 768px) {
  .header-search { max-width: 200px; }
  .menu-btn { display: flex; }
}
</style>
