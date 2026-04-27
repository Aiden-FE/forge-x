<template>
  <aside class="nav" :class="{ open }">
    <div class="nav-content">
      <button class="close-btn" @click="$emit('close')">
        <X :size="20" />
      </button>
      <ul class="nav-list">
        <li
          v-for="cat in categories"
          :key="cat.id"
          :class="['nav-item', { active: activeCategory === cat.id }]"
          @click="selectCategory(cat.id)"
        >
          <component :is="icons[cat.icon]" :size="18" />
          <span>{{ cat.label }}</span>
        </li>
      </ul>
    </div>
    <div v-if="open" class="nav-overlay" @click="$emit('close')"></div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X, LayoutGrid, Binary, Braces, Sparkles, ArrowLeftRight } from 'lucide-vue-next'
import { useToolsStore } from '@/stores/tools'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits(['close'])

const store = useToolsStore()
const { t } = useI18n()
const categories = computed(() =>
  store.categories.map(cat => ({
    ...cat,
    label: cat.id === 'all' ? t('allCategories') : t(`categories.${cat.id}`),
  }))
)
const activeCategory = computed(() => store.activeCategory)

const icons: Record<string, any> = {
  LayoutGrid, Binary, Braces, Sparkles, ArrowLeftRight
}

function selectCategory(id: string) {
  store.setActiveCategory(id)
  emit('close')
}
</script>

<style scoped>
.nav {
  width: var(--sidebar-width);
  background: var(--bg-panel);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  transition: transform var(--transition-normal);
}

.nav-content {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
}

.close-btn {
  display: none;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  align-self: flex-end;
  padding: var(--space-sm);
}

.nav-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  border-left: 2px solid transparent;
  transition: all var(--transition-fast);
}

.nav-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--bg-card);
  color: var(--accent);
  border-left-color: var(--accent);
}

.nav-overlay {
  display: none;
}

@media (max-width: 768px) {
  .nav {
    position: fixed;
    left: 0;
    top: var(--header-height);
    height: calc(100vh - var(--header-height));
    z-index: 200;
    transform: translateX(-100%);
  }

  .nav.open { transform: translateX(0); }

  .nav-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 199;
    top: var(--header-height);
  }

  .close-btn { display: flex; }
}
</style>
