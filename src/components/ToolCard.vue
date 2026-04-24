<template>
  <div class="card" @click="navigate">
    <div class="card-icon">
      <component :is="icon" :size="32" />
    </div>
    <div class="card-content">
      <h3 class="card-title">{{ tool.name }}</h3>
      <p class="card-desc">{{ tool.description }}</p>
      <span class="card-tag">{{ categoryLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import * as LucideIcons from 'lucide-vue-next'
import type { ToolMeta } from '@/types/tool'
import { useToolsStore } from '@/stores/tools'

const props = defineProps<{ tool: ToolMeta }>()
const router = useRouter()
const store = useToolsStore()

const icon = computed(() => (LucideIcons as any)[props.tool.icon] || LucideIcons.Box)
const categoryLabel = computed(() =>
  store.categories.find(c => c.id === props.tool.category)?.label || props.tool.category
)

function navigate() {
  router.push(`/tool/${props.tool.id}`)
}
</script>

<style scoped>
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.card:hover {
  background: var(--bg-card-hover);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-2px);
}

.card-icon {
  color: var(--accent);
  display: flex;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.card-title {
  font-size: 16px;
  font-weight: 510;
  color: var(--text-primary);
}

.card-desc {
  font-size: 13px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.card-tag {
  font-size: 11px;
  font-weight: 510;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 2px var(--space-sm);
  border-radius: var(--radius-pill);
  margin-top: var(--space-sm);
}
</style>
