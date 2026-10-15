<template>
  <ToolLayout :tool="toolMeta">
    <JsonYamlPanel />
  </ToolLayout>
</template>

<script setup lang="ts">
import ToolLayout from '@/components/ToolLayout.vue'
import type { ToolMeta } from '@/types/tool'
import JsonYamlPanel from './JsonYamlPanel.vue'

const toolMeta: ToolMeta = {
  id: 'json-yaml',
  name: 'JSON↔YAML 互转',
  description: '在本地进行 JSON 与 YAML 双向转换',
  category: 'convert',
  icon: 'FileJson2',
  component: JsonYamlPanel,
  keywords: ['json', 'yaml', 'convert', 'serialize', '互转', '转换']
}
</script>
