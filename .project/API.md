# API 文档

> 此文件记录 RESTful API 设计规范，由 Dev-Agent 维护

## API 设计规范

### 基础 URL
```
开发环境: http://localhost:3000/api/v1
生产环境: https://api.example.com/v1
```

### 通用响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": { },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### 错误码定义

| 错误码 | 含义 | 处理建议 |
|--------|------|----------|
| 0 | 成功 | - |
| 400 | 参数错误 | 检查请求参数 |
| 401 | 未认证 | 重新登录 |
| 403 | 无权限 | 检查权限配置 |
| 404 | 资源不存在 | 检查资源 ID |
| 500 | 服务器错误 | 联系管理员 |

## API 列表

### 用户模块

#### POST /auth/login
用户登录

**请求参数**：
```json
{
  "email": "user@example.com",
  "password": "******"
}
```

**响应示例**：
```json
{
  "code": 0,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "id": "1",
      "email": "user@example.com",
      "name": "用户名"
    }
  }
}
```

#### GET /users/me
获取当前用户信息

**请求头**：
```
Authorization: Bearer {token}
```

---

[继续添加其他 API...]

## 版本控制

- URL 路径版本控制：`/api/v1/`, `/api/v2/`
- 向后兼容原则：新增字段不影响旧版本客户端