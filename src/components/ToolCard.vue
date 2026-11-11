<template>
  <div class="card" :data-tool-id="tool.id" @click="navigate">
    <button
      class="star-btn"
      :class="{ active: isFavorite }"
      type="button"
      :aria-label="starLabel"
      :aria-pressed="isFavorite"
      :title="starLabel"
      :data-test="`tool-star-${tool.id}`"
      @click.stop="toggleFavorite"
    >
      <Star :size="18" />
    </button>
    <div class="card-icon">
      <component :is="icon" :size="32" />
    </div>
    <div class="card-content">
      <h3 class="card-title">{{ localizedName }}</h3>
      <p class="card-desc">{{ localizedDesc }}</p>
      <span class="card-tag">{{ categoryLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import * as LucideIcons from 'lucide-vue-next'
import { Star } from 'lucide-vue-next'
import type { ToolMeta } from '@/types/tool'
import { useI18n } from '@/composables/useI18n'
import { useToolActivityStore } from '@/stores/toolActivity'

const props = defineProps<{ tool: ToolMeta }>()
const router = useRouter()
const { t } = useI18n()
const activity = useToolActivityStore()

const icon = computed(() => (LucideIcons as any)[props.tool.icon] || LucideIcons.Box)
const localizedName = computed(() => t(`tools.${props.tool.id}`, {}, props.tool.name))
const localizedDesc = computed(() => t(`tools.${props.tool.id}Desc`, {}, props.tool.description))
const categoryLabel = computed(() =>
  t(`categories.${props.tool.category}`, {}, props.tool.category)
)
const isFavorite = computed(() => activity.isFavorite(props.tool.id))
const starLabel = computed(
  () => `${isFavorite.value ? t('favorites.remove') : t('favorites.add')} · ${localizedName.value}`
)

function toggleFavorite() {
  activity.toggleFavorite(props.tool.id)
}

function navigate() {
  router.push(`/tool/${props.tool.id}`)
}
</script>

<style scoped>
.card {
  position: relative;
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

.star-btn {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.star-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.star-btn.active {
  color: var(--accent);
}

.star-btn:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.star-btn.active svg {
  fill: currentColor;
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
