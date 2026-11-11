<template>
  <div class="home">
    <div class="tools-grid">
      <ToolCard v-for="tool in filteredTools" :key="tool.id" :tool="tool" />
    </div>
    <div v-if="filteredTools.length === 0" class="empty">
      <template v-if="isFavoritesEmpty">
        <p class="empty-title">{{ t('favorites.empty') }}</p>
        <p class="empty-hint">{{ t('favorites.hint') }}</p>
        <button class="empty-action" type="button" data-test="favorites-browse-all" @click="browseAll">
          {{ t('favorites.browseAll') }}
        </button>
      </template>
      <p v-else class="empty-text">{{ t('noMatch') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ToolCard from '@/components/ToolCard.vue'
import { useToolsStore } from '@/stores/tools'
import { useToolActivityStore } from '@/stores/toolActivity'
import { useI18n } from '@/composables/useI18n'

const store = useToolsStore()
const activity = useToolActivityStore()
const { t } = useI18n()
const filteredTools = computed(() => store.filteredTools)
const hasFavorites = computed(() => store.tools.some(tool => activity.isFavorite(tool.id)))
const isFavoritesEmpty = computed(
  () => store.activeCategory === 'favorites' && !hasFavorites.value
)

function browseAll() {
  store.setActiveCategory('all')
}
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-2xl);
}

.empty-title {
  color: var(--text-secondary);
  font-size: 15px;
}

.empty-hint {
  color: var(--text-tertiary);
  font-size: 13px;
}

.empty-text {
  color: var(--text-tertiary);
  font-size: 14px;
}

.empty-action {
  margin-top: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.empty-action:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.empty-action:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}
</style>
