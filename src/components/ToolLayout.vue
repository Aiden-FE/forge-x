<template>
  <div class="layout">
    <nav class="breadcrumb">
      <router-link to="/">{{ t('home') }}</router-link>
      <span class="sep">/</span>
      <span class="current">{{ tool.name }}</span>
    </nav>
    <header class="header">
      <div class="header-icon">
        <component :is="icon" :size="24" />
      </div>
      <div class="header-info">
        <h1 class="title">{{ tool.name }}</h1>
        <p class="desc">{{ tool.description }}</p>
      </div>
    </header>
    <div class="content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import * as LucideIcons from 'lucide-vue-next'
import type { ToolMeta } from '@/types/tool'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{ tool: ToolMeta }>()
const { t } = useI18n()
const icon = computed(() => (LucideIcons as any)[props.tool.icon] || LucideIcons.Box)
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

.title {
  font-size: 24px;
  font-weight: 590;
  color: var(--text-primary);
}

.desc {
  font-size: 15px;
  color: var(--text-tertiary);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
</style>
