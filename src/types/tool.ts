import type { Component } from 'vue'

export interface ToolMeta {
  id: string
  name: string
  description: string
  category: string
  icon: string
  component: Component
  keywords?: string[]
}

export type Category = {
  id: string
  label: string
  icon: string
}
