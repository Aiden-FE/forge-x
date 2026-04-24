# UX 规范

> 此文件记录用户体验设计规范，由 Design-Agent 维护

## 设计系统

### 色彩体系

**主色调**：
- Primary: `#409EFF` (品牌蓝)
- Primary Dark: `#337ECC`
- Primary Light: `#79BBFF`

**功能色**：
- Success: `#67C23A` (成功绿)
- Warning: `#E6A23C` (警告橙)
- Danger: `#F56C6C` (错误红)
- Info: `#909399` (信息灰)

**中性色**：
- Text Primary: `#303133`
- Text Regular: `#606266`
- Text Secondary: `#909399`
- Border: `#DCDFE6`

### 字体规范

```css
/* 标题 */
h1: 32px / 48px, font-weight: 600
h2: 24px / 36px, font-weight: 600
h3: 20px / 30px, font-weight: 600
h4: 16px / 24px, font-weight: 600

/* 正文 */
body: 14px / 22px, font-weight: 400
small: 12px / 20px, font-weight: 400
```

### 间距系统

使用 4px 基础单位：
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px

## 组件规范

### 按钮

| 类型 | 样式 | 使用场景 |
|------|------|----------|
| Primary | 实心蓝底白字 | 主要操作 |
| Default | 白底蓝边蓝字 | 次要操作 |
| Text | 无边框 | 文字链接 |
| Danger | 红色 | 危险操作 |

### 表单

- 标签对齐：右对齐（label-width: 100px）
- 必填标记：红色星号
- 验证提示：行内红色文字
- 提交按钮：表单底部居中

### 响应式断点

```css
/* 移动端 */
@media (max-width: 768px) { }

/* 平板 */
@media (min-width: 769px) and (max-width: 1024px) { }

/* 桌面 */
@media (min-width: 1025px) { }
```

## 交互规范

### 反馈机制

1. **即时反馈**：点击按钮显示 loading 状态
2. **成功反馈**：操作成功显示绿色 Toast 提示
3. **错误反馈**：操作失败显示红色 Toast + 错误详情
4. **确认反馈**：危险操作弹出确认对话框

### 加载状态

- 页面加载：骨架屏 (Skeleton)
- 数据刷新：下拉刷新指示器
- 按钮提交：按钮内置 loading 动画

### 空状态

- 显示友好的空状态插图
- 提供明确的操作引导
- 例：「还没有数据，点击添加」