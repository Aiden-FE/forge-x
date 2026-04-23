# ForgeX 架构设计

## 系统架构

```
Browser
  ↓
Vue3 SPA (Vue Router + Pinia)
  ├── Home — 工具卡片网格
  ├── Category — 分类页
  └── Tool/:id — 工具详情页
  ↓
纯前端计算（无后端）
  ↓
GitHub Pages (静态部署)
```

## 模块划分

### 核心框架
- `src/App.vue` — 根组件
- `src/router/` — 路由配置（自动注册工具路由）
- `src/store/` — 状态管理（工具注册、收藏）
- `src/components/` — 通用组件
- `src/layouts/` — 布局组件

### 工具系统
- `src/tools/` — 工具目录
  - 每个工具一个文件夹，包含：
    - `index.ts` — 工具注册信息（name, icon, category, component）
    - `ToolName.vue` — 工具组件
- 工具通过约定式目录结构自动注册

### 基础设施
- `src/assets/` — 静态资源
- `src/styles/` — 全局样式
- `src/utils/` — 工具函数

## 工具注册机制

```typescript
// src/tools/json-formatter/index.ts
export default {
  id: 'json-formatter',
  name: 'JSON 格式化',
  icon: '🔧',
  category: 'formatter',
  description: '格式化、压缩、验证 JSON 数据',
  component: () => import('./JsonFormatter.vue')
}
```

路由和卡片通过扫描 `src/tools/*/index.ts` 自动生成。
