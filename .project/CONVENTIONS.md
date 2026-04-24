# 开发规范

> 此文件记录团队开发规范，由全员共同遵守

## 代码风格

### 前端 (Vue/TypeScript)

```typescript
// 文件命名：PascalCase.vue
// 组件命名：PascalCase
// 变量命名：camelCase
// 常量命名：UPPER_SNAKE_CASE
// CSS 类名：kebab-case

// 推荐的组件结构
<template>
  <!-- 模板内容 -->
</template>

<script setup lang="ts">
// 1. 导入
import { ref, computed, onMounted } from 'vue'
import type { User } from '@/types'

// 2. Props & Emits
const props = defineProps<{
  userId: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

// 3. 响应式状态
const loading = ref(false)
const user = ref<User | null>(null)

// 4. 计算属性
const displayName = computed(() => user.value?.name ?? '未知用户')

// 5. 方法
async function fetchUser() {
  loading.value = true
  try {
    user.value = await getUser(props.userId)
  } finally {
    loading.value = false
  }
}

// 6. 生命周期
onMounted(() => {
  fetchUser()
})
</script>

<style scoped>
.user-card { }
</style>
```

### 后端 (Node.js)

```typescript
// 目录结构约定
src/
├── controllers/    # 控制器
├── services/       # 业务逻辑
├── models/         # 数据模型
├── routes/         # 路由定义
├── middlewares/    # 中间件
├── utils/          # 工具函数
└── types/          # 类型定义

// 服务类示例
export class UserService {
  constructor(private userRepository: UserRepository) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id)
  }
}
```

## Git 工作流

### 分支命名
```
feature/USER-123-add-login
bugfix/USER-456-fix-crash
hotfix/USER-789-security-patch
```

### Commit Message
```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型**：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档
- `style`: 格式（不影响代码运行）
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

**示例**：
```
feat(auth): add JWT token refresh

- Add refresh token endpoint
- Update auth middleware
- Add token rotation logic

Closes #123
```

### PR 规范

```markdown
## 变更说明
[描述本次 PR 的目的和实现方式]

## 变更类型
- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构
- [ ] 文档

## 测试
- [ ] 单元测试已通过
- [ ] 集成测试已通过
- [ ] 手动测试已完成

## 截图
[如有 UI 变更，附上截图]
```

## Code Review 检查项

- [ ] 代码符合团队规范
- [ ] 没有明显的性能问题
- [ ] 错误处理完善
- [ ] 有适当的日志
- [ ] 测试覆盖充分
- [ ] 没有安全漏洞
- [ ] 文档已更新

## 发布流程

1. **开发完成** → 创建 PR → Code Review
2. **Review 通过** → 合并到 develop → 自动部署测试环境
3. **测试通过** → 合并到 main → 自动部署生产环境
4. **打 Tag** → 发布 Release Notes