# 执行计划：Client 路由架构重构

## 目标与完成定义

将 Client 页面框架从 activeView 状态驱动重构为 Hash Router 模块隔离架构。完成后 App.tsx 不再包含模块编排逻辑，Sidebar 按模块拆分，新增模块只需加路由 + Page 文件。

**完成标准**：/#/chat、/#/image、/#/wiki 三个路由正常渲染对应模块，模块切换器使用 NavLink 高亮当前模块，设置和主题跨模块一致。

## 背景与范围

详见 product-spec.md 和 design-doc.md。

## 前置条件

- node_modules 已安装
- Vite dev server 可正常启动（npm run dev:client）

## 任务拆解

### 阶段一：依赖与基础结构

| TP ID | 任务 | 产出 | 验收 | 状态 |
|-------|------|------|------|------|
| TP-001 | 安装 react-router-dom 依赖 | package.json 更新 | npm ls react-router-dom 存在 | 已完成 |
| TP-002 | 新建目录结构：features/wiki/、hooks/、shared/components/ | 目录就位 | ls 确认 | 已完成 |
| TP-003 | 抽取 useConversations hook（从当前 App.tsx 的 conversation CRUD 逻辑） | hooks/useConversations.ts | 导出 create/delete/rename/clearAll/fetch，支持 type 参数 | 已完成 |

### 阶段二：共享组件提取

| TP ID | 任务 | 产出 | 验收 | 状态 |
|-------|------|------|------|------|
| TP-004 | 从 Sidebar.tsx 提取 SidebarHeader（品牌 + 模块切换 NavLink + 设置按钮） | shared/components/SidebarHeader.tsx | 接收 activeModule + onOpenSettings props | 已完成 |
| TP-005 | 从 Sidebar.tsx 提取 WikiSidebar（Wiki 文件树 + 上传 + 进度） | features/wiki/WikiSidebar.tsx | 保持现有所有功能：文件树展开/选中、拖拽上传、上传进度轮询 | 已完成 |
| TP-006 | 从 Sidebar.tsx 提取 SidebarFooter 为共享组件 | shared/components/SidebarFooter.tsx | 接收 showClear 和 onClearAll props | 已完成 |

### 阶段三：模块 Page 组装

| TP ID | 任务 | 产出 | 验收 | 状态 |
|-------|------|------|------|------|
| TP-007 | 创建 AppProvider（全局壳：主题管理 + SettingsModal outlet） | App.tsx 重写为 AppProvider | 主题切换独立于路由 | 已完成 |
| TP-008 | 创建 ChatPage（组合 SidebarHeader + ChatSidebar + ChatArea） | features/chat/ChatPage.tsx + ChatSidebar.tsx | /#/chat 渲染正确 | 已完成 |
| TP-009 | 创建 ImageSidebar + ImagePage（组合 SidebarHeader + ImageSidebar + ImageChatArea） | features/images/ImageSidebar.tsx + ImagePage.tsx | /#/image 渲染正确 | 已完成 |
| TP-010 | 创建 WikiPage（组合 SidebarHeader + WikiSidebar + WikiPanel） | features/wiki/WikiPage.tsx | /#/wiki 渲染正确 | 已完成 |
| TP-011 | 配置 router 并接入 main.tsx | router.tsx, main.tsx | 默认导航到 /#/chat | 已完成 |

### 阶段四：清理

| TP ID | 任务 | 产出 | 验收 | 状态 |
|-------|------|------|------|------|
| TP-012 | 删除原 Sidebar.tsx 和 components/WikiPanel.tsx | 文件删除 | git rm 确认 | 已完成 |
| TP-013 | 验证三个路由 + 导航 + 设置/主题 | 手动测试通过 | Vite build + dev server 验证 | 已完成 |

## 执行记录

| TP ID | 状态 | 注意事项 |
|-------|------|---------|
| TP-001 | 已完成 | npm install react-router-dom@6 |
| TP-002 | 已完成 | hooks/ shared/components/ features/wiki/ |
| TP-003 | 已完成 | useConversations hook 包含 conversations/loading/activeId/CRUD 方法 |
| TP-004 | 已完成 | NavLink 替代原 button + onViewChange |
| TP-005 | 已完成 | 完整保留文件树、拖拽上传、上传进度轮询逻辑 |
| TP-006 | 已完成 | 清空全部按钮 + ConfirmDialog 内聚 |
| TP-007 | 已完成 | App.tsx 重写为 AppProvider，使用 Outlet + useOutletContext |
| TP-008 | 已完成 | 新增 ChatSidebar.tsx 从原 Sidebar 提取对话列表逻辑 |
| TP-009 | 已完成 | ImageSidebar 独立组件，不复用 ChatSidebar（DS-004） |
| TP-010 | 已完成 | WikiPanel 从 components/ 迁入 features/wiki/ |
| TP-011 | 已完成 | createHashRouter 配置 + main.tsx 使用 RouterProvider |
| TP-012 | 已完成 | 无残留引用 |
| TP-013 | 已完成 | 构建通过，dev server 可正常启动 |

## 风险与依赖

- 无阻塞风险。ChatPage remount 时 conversations refetch 的 loading 闪烁已有现成 loading 态处理
- WikiSidebar 从 Sidebar.tsx 拆分时需确保上传轮询的 clearInterval 逻辑不丢失

## 验证与验收

1. `npm run dev:client` 启动后：
   - 访问 http://localhost:5173 → 自动跳转 /#/chat
   - 点击 Image/Wiki 按钮 → URL 和内容切换
   - 设置模态框可在任意模块打开
   - 主题切换在所有模块一致
2. `cd client && npm run build` 构建通过
