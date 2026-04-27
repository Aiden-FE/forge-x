<template>
  <div class="home">
    <div class="tools-grid">
      <ToolCard v-for="tool in filteredTools" :key="tool.id" :tool="tool" />
    </div>
    <div v-if="filteredTools.length === 0" class="empty">
      <p class="empty-text">{{ t('noMatch') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ToolCard from '@/components/ToolCard.vue'
import { useToolsStore } from '@/stores/tools'
import { useI18n } from '@/composables/useI18n'

const store = useToolsStore()
const { t } = useI18n()
const filteredTools = computed(() => store.filteredTools)
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
  justify-content: center;
  align-items: center;
  padding: var(--space-2xl);
}

.empty-text {
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>