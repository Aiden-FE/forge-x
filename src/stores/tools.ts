import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ToolMeta, Category } from '@/types/tool'

export const useToolsStore = defineStore('tools', () => {
  const tools = ref<ToolMeta[]>([])
  const searchQuery = ref('')
  const activeCategory = ref('all')

  const categories = ref<Category[]>([
    { id: 'all', label: '全部', icon: 'LayoutGrid' },
    { id: 'encode', label: '编码转换', icon: 'Binary' },
    { id: 'format', label: '格式化', icon: 'Braces' },
    { id: 'generate', label: '生成器', icon: 'Sparkles' },
    { id: 'convert', label: '转换', icon: 'ArrowLeftRight' },
  ])

  const filteredTools = computed(() => {
    let result = tools.value
    if (activeCategory.value !== 'all') {
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
