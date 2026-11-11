import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ToolMeta, Category } from '@/types/tool'
import { useToolActivityStore } from './toolActivity'

export const useToolsStore = defineStore('tools', () => {
  const activity = useToolActivityStore()
  const tools = ref<ToolMeta[]>([])
  const searchQuery = ref('')
  const activeCategory = ref('all')

  const categories = ref<Category[]>([
    { id: 'favorites', label: '收藏', icon: 'Star' },
    { id: 'all', label: '全部', icon: 'LayoutGrid' },
    { id: 'ai', label: 'AI', icon: 'Languages' },
    { id: 'encode', label: '编码转换', icon: 'Binary' },
    { id: 'security', label: '安全加密', icon: 'ShieldCheck' },
    { id: 'format', label: '格式化', icon: 'Braces' },
    { id: 'generate', label: '生成器', icon: 'Sparkles' },
    { id: 'convert', label: '转换', icon: 'ArrowLeftRight' },
    { id: 'text', label: '文本处理', icon: 'Type' },
    { id: 'debug', label: '调试测试', icon: 'Bug' },
  ])

  /** Registration order is the default order and the tie-breaker for usage sorting. */
  const registrationIndex = computed(() => {
    const index = new Map<string, number>()
    tools.value.forEach((tool, position) => index.set(tool.id, position))
    return index
  })

  const filteredTools = computed(() => {
    let result = tools.value

    if (activeCategory.value === 'favorites') {
      result = result.filter(t => activity.isFavorite(t.id))
    } else if (activeCategory.value !== 'all') {
      result = result.filter(t => t.category === activeCategory.value)
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim()
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.keywords && t.keywords.some(k => k.toLowerCase().includes(q)))
      )
    }

    // Only "All" and "Favorites" are usage-ranked; category views keep the
    // stable registration order even after a tool has been used.
    if (activeCategory.value === 'all' || activeCategory.value === 'favorites') {
      const order = registrationIndex.value
      result = [...result].sort((a, b) => {
        const byUsage = activity.usageCount(b.id) - activity.usageCount(a.id)
        if (byUsage !== 0) return byUsage
        return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
      })
    }

    return result
  })

  function registerTool(tool: ToolMeta) {
    if (!tools.value.find(t => t.id === tool.id)) {
      tools.value.push(tool)
    }
  }

  function setSearchQuery(q: string) {
    searchQuery.value = q
  }

  function setActiveCategory(cat: string) {
    activeCategory.value = cat
  }

  return { tools, searchQuery, activeCategory, categories, filteredTools, registerTool, setSearchQuery, setActiveCategory }
})
