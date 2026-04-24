<template>
  <header class="header">
    <div class="header-brand">
      <span class="logo">🔥</span>
      <span class="title">ForgeX</span>
    </div>
    <div class="header-search">
      <Search class="search-icon" :size="18" />
      <input
        v-model="query"
        type="text"
        placeholder="搜索工具... (按 /)"
        class="search-input"
        @input="onSearch"
        @keydown="handleKeydown"
      />
    </div>
    <button class="menu-btn" @click="$emit('toggle-sidebar')">
      <Menu :size="20" />
    </button>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search, Menu } from 'lucide-vue-next'
import { useToolsStore } from '@/stores/tools'

const emit = defineEmits(['toggle-sidebar'])
const store = useToolsStore()
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

.menu-btn {
  display: none;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  color: var(--text-secondary);
  cursor: pointer;
}

@media (max-width: 768px) {
  .header-search { max-width: 200px; }
  .menu-btn { display: flex; }
}
</style>
