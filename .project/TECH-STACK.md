# 技术栈说明

> 此文件记录项目技术选型，由 Dev-Agent 维护

## 前端技术栈

### 核心框架
- **Vue 3**：渐进式 JavaScript 框架
- **TypeScript**：类型安全
- **Vite**：下一代前端构建工具

### UI 组件库
- **首选**：Element Plus / Ant Design Vue / Naive UI
- **选择原则**：根据项目需求选择，保持一致性

### 状态管理
- **Pinia**：Vue 3 官方推荐状态管理
- 使用 Composition API 风格

### 路由
- **Vue Router 4**：官方路由
- 支持路由懒加载

### HTTP 客户端
- **Axios**：HTTP 请求库
- 封装请求/响应拦截器

### 工具库
- **dayjs**：日期处理
- **lodash-es**：工具函数
- **@vueuse/core**：Vue Composition 工具集

## 后端技术栈

### Node.js 技术栈
- **框架**：Express / Fastify / NestJS
- **ORM**：Prisma / TypeORM
- **认证**：jsonwebtoken / passport

### Golang 技术栈
- **框架**：Gin / Fiber / Echo
- **ORM**：GORM / sqlx
- **认证**：golang-jwt

### Rust 技术栈
- **框架**：Actix-web / Axum
- **ORM**：Diesel / sqlx
- **认证**：jsonwebtoken crate

## 数据库

| 数据库 | 使用场景 |
|--------|----------|
| PostgreSQL | 主数据库（关系型） |
| MongoDB | 文档型数据 |
| Redis | 缓存 / Session |

## 部署方案

### 容器化
```dockerfile
# 前端 Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

### CI/CD
- **GitHub Actions**：自动化构建部署
- **Docker Compose**：本地开发环境
- **Kubernetes**：生产环境（可选）

## 开发规范

### Git 分支
- `main`：生产环境
- `develop`：开发环境
- `feature/*`：功能分支
- `hotfix/*`：紧急修复

### Commit 规范
```
feat: 新功能
fix: 修复 Bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```