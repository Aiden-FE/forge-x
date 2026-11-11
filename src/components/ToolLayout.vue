<template>
  <div class="layout">
    <nav class="breadcrumb">
      <router-link to="/">{{ t('home') }}</router-link>
      <span class="sep">/</span>
      <span class="current">{{ localizedName }}</span>
    </nav>
    <header class="header">
      <div class="header-icon">
        <component :is="icon" :size="24" />
      </div>
      <div class="header-info">
        <h1 class="title">{{ localizedName }}</h1>
        <p class="desc">{{ localizedDesc }}</p>
      </div>
      <button
        class="star-btn"
        :class="{ active: isFavorite }"
        type="button"
        :aria-label="starLabel"
        :aria-pressed="isFavorite"
        :title="starLabel"
        data-test="tool-star"
        @click="toggleFavorite"
      >
        <Star :size="20" />
      </button>
    </header>
    <div
      class="content"
      data-test="tool-content"
      @input="onContentInteraction"
      @change="onContentInteraction"
      @click="onContentInteraction"
      @drop="onContentInteraction"
      @paste="onContentInteraction"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import * as LucideIcons from 'lucide-vue-next'
import { Star } from 'lucide-vue-next'
import type { ToolMeta } from '@/types/tool'
import { useI18n } from '@/composables/useI18n'
import { useToolActivityStore } from '@/stores/toolActivity'
import { createToolUsageGate, isUsageEvent } from '@/lib/toolUsage'

const props = defineProps<{ tool: ToolMeta }>()
const { t } = useI18n()
const activity = useToolActivityStore()

const icon = computed(() => (LucideIcons as any)[props.tool.icon] || LucideIcons.Box)
const localizedName = computed(() => t(`tools.${props.tool.id}`, {}, props.tool.name))
const localizedDesc = computed(() => t(`tools.${props.tool.id}Desc`, {}, props.tool.description))
const isFavorite = computed(() => activity.isFavorite(props.tool.id))
const starLabel = computed(
  () => `${isFavorite.value ? t('favorites.remove') : t('favorites.add')} · ${localizedName.value}`
)

function toggleFavorite() {
  activity.toggleFavorite(props.tool.id)
}

// One actual-use record per mounted tool page. The gate resets only when the
// same layout instance is reused for a different tool.
const usageGate = createToolUsageGate(() => activity.recordUse(props.tool.id))
watch(() => props.tool.id, () => usageGate.reset())

function onContentInteraction(event: Event) {
  if (!isUsageEvent(event)) return
  usageGate.hit()
}
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  max-width: 1200px;
  margin: 0 auto;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 13px;
}

.breadcrumb a {
  color: var(--text-tertiary);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.breadcrumb a:hover { color: var(--accent); }

.sep { color: var(--text-quaternary); }

.current { color: var(--text-secondary); }

.header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.header-icon {
  width: 48px;
  height: 48px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.header-info {
  min-width: 0;
}

.title {
  font-size: 24px;
  font-weight: 590;
  color: var(--text-primary);
}

.desc {
  font-size: 15px;
  color: var(--text-tertiary);
}

.star-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
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
  border-color: var(--border-focus);
}

.star-btn:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.star-btn.active svg {
  fill: currentColor;
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
</style>
