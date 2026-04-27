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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Menu, Sun, Moon } from 'lucide-vue-next'
import { useToolsStore } from '@/stores/tools'
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'
import { useI18n } from '@/composables/useI18n'

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

function handleKeydown(e: KeyboardEvent) {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault()
    focusSearch()
  }
}

function focusSearch() {
  document.querySelector<HTMLInputElement>('.search-input')?.focus()
}

function goHome() {
  router.push('/')
}

onMounted(() => {
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault()
      focusSearch()
    }
  })
})
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
