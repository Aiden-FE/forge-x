# 数据模型

> 此文件记录数据库设计，由 Dev-Agent 维护

## 数据库选型

- **主数据库**：[PostgreSQL / MySQL / MongoDB]
- **缓存**：Redis
- **对象存储**：[S3 / MinIO]

## 实体关系图 (ER Diagram)

```
┌──────────────┐       ┌──────────────┐
│    Users     │       │    Posts     │
├──────────────┤       ├──────────────┤
│ id (PK)      │──┐    │ id (PK)      │
│ email        │  │    │ title        │
│ password     │  │    │ content      │
│ name         │  │    │ user_id (FK) │──┘
│ created_at   │       │ created_at   │
│ updated_at   │       │ updated_at   │
└──────────────┘       └──────────────┘
```

## 表结构设计

### users 用户表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 邮箱 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希 |
| name | VARCHAR(100) | | 昵称 |
| avatar | VARCHAR(500) | | 头像 URL |
| status | ENUM | DEFAULT 'active' | 状态 |
| created_at | TIMESTAMP | NOT NULL | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL | 更新时间 |

**索引**：
- `idx_users_email` ON (email)
- `idx_users_status` ON (status)

---

### posts 文章表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| title | VARCHAR(200) | NOT NULL | 标题 |
| content | TEXT | | 内容 |
| user_id | UUID | FK -> users.id | 作者 ID |
| status | ENUM | DEFAULT 'draft' | 状态 |
| published_at | TIMESTAMP | | 发布时间 |
| created_at | TIMESTAMP | NOT NULL | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL | 更新时间 |

**索引**：
- `idx_posts_user_id` ON (user_id)
- `idx_posts_status` ON (status)
- `idx_posts_published_at` ON (published_at)

## 数据迁移

使用数据库迁移工具管理版本：
- Node.js: Prisma Migrate / TypeORM Migration
- Go: golang-migrate / Goose
- Rust: Diesel / sqlx-migrate