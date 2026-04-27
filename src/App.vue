<template>
  <div class="app">
    <AppHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />
    <div class="app-body">
      <CategoryNav :open="sidebarOpen" @close="sidebarOpen = false" />
      <main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import CategoryNav from '@/components/CategoryNav.vue'
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'

// Init theme & i18n — the stores apply on creation via watch({ immediate: true })
useThemeStore()
useLocaleStore()

const sidebarOpen = ref(false)
</script>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #app {
  height: 100%;
  width: 100%;
}

body {
  font-family: var(--font-primary);
  font-feature-settings: "cv01", "ss03";
  background: var(--bg-canvas);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-xl);
}

.fade-enter-active,
.fade-leave-active { transition: opacity var(--transition-normal); }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-hover); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-quaternary); }
</style>
