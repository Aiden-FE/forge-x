# ForgeX 🔥

> 开发者快捷工具平台 — 一个平台，锻造无限工具

## 特色

- 🔧 一站式开发工具集合
- ⚡ 纯前端计算，即开即用
- 🧩 插件化架构，轻松扩展
- 🌙 暗色极简设计

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build

# 预览
pnpm preview
```

## 添加新工具

在 `src/tools/` 下创建目录：

```
src/tools/my-tool/
├── index.ts      # 工具注册信息
└── MyTool.vue    # 工具组件
```

工具会自动注册到路由和首页卡片。

## 部署

- GitHub Pages（自动）
- Docker + Nginx（自托管）

## License

MIT
