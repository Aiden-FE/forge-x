import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import type { ToolMeta } from '@/types/tool'
import { useToolsStore } from '@/stores/tools'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// Auto-register tools via import.meta.glob
const toolModules = import.meta.glob<{ default: ToolMeta }>('../tools/*/index.ts', { eager: true })

export function registerAllTools() {
  const store = useToolsStore()
  const dynamicRoutes: RouteRecordRaw[] = []

  for (const path in toolModules) {
    const mod = toolModules[path]
    const meta = mod.default
    if (!meta?.id) continue

    store.registerTool(meta)
    dynamicRoutes.push({
      path: `/tool/${meta.id}`,
      name: `tool-${meta.id}`,
      component: meta.component,
      meta: { title: `${meta.name} - ForgeX` },
    })
  }

  // Add a catch-all tool route
  dynamicRoutes.push({
    path: '/tool/:id',
    name: 'tool-not-found',
    component: () => import('@/views/HomeView.vue'),
  })

  for (const route of dynamicRoutes) {
    router.addRoute(route)
  }
}

router.beforeEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title as string
  } else {
    document.title = 'ForgeX - 开发者快捷工具平台'
  }
})

export default router
