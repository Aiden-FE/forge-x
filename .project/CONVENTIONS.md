# ForgeX 开发约定

## 命名规范
- 组件: PascalCase (`JsonFormatter.vue`)
- 工具目录: kebab-case (`json-formatter/`)
- 路由: kebab-case (`/tool/json-formatter`)
- CSS 类: BEM 或 kebab-case
- 常量: UPPER_SNAKE_CASE
- 变量/函数: camelCase

## Git 规范
- 分支: `feat/v{version}-{desc}` / `fix/v{version}-{desc}`
- 提交: Conventional Commits (`feat:`, `fix:`, `chore:`)
- PR: squash merge 到 main

## 工具开发规范
- 每个工具必须是纯前端可运行（不依赖后端）
- 工具组件必须是懒加载（`() => import()`）
- 工具必须处理空状态、错误状态
- 工具输入输出尽量支持复制/粘贴
