# 追溯总览

## 变更信息

| 属性 | 值 |
|---|---|
| 变更主题 | Client 路由架构重构 |
| 变更标识 | 2026-06-24-路由架构重构 |
| 状态 | **已完成** |
| 创建日期 | 2026-06-24 |
| 完成日期 | 2026-06-24 |

## 全链路追溯

| 来源 ID | 来源描述 | 设计决策 ID | 设计决策摘要 | 执行任务 ID | 状态 |
|---------|---------|------------|-------------|------------|------|
| US-001 | 模块按钮切换 URL 变化 | DS-001 | createHashRouter 方案 | TP-011 | 已完成 |
| US-002 | 新增模块只加路由+Page | DS-003, DS-006 | hook + Page 模式 | TP-003, TP-008~TP-010 | 已完成 |
| US-003 | Electron 窗口恢复模块 | DS-001 | Hash Router 天然支持 | TP-011 | 已完成 |
| US-004 | 切换模块主题一致 | DS-002 | AppProvider 作为全局壳 | TP-007 | 已完成 |
| AC-001 | /#/chat 显示 ChatSidebar+ChatArea | DS-002 | route element = ChatPage | TP-008 | 已完成 |
| AC-002 | /#/image 显示 ImageSidebar+ImageChatArea | DS-004 | route element = ImagePage | TP-009 | 已完成 |
| AC-003 | /#/wiki 显示 WikiSidebar+WikiPanel | DS-005 | route element = WikiPage | TP-010 | 已完成 |
| AC-004 | NavLink 高亮当前模块 | DS-006 | SidebarHeader 使用 NavLink | TP-004 | 已完成 |
| AC-005 | 模块返回对话列表重新加载 | DS-003 | useConversations mount 时 fetch | TP-003 | 已完成 |
| AC-006 | 切换模块不关设置模态框 | DS-002 | AppProvider 持有 settings | TP-007 | 已完成 |
| AC-007 | 根路径自动重定向 /chat | DS-001 | index route: Navigate | TP-011 | 已完成 |
| AC-008 | ImageSidebar 独立于 ChatSidebar | DS-004 | 独立组件不共享 | TP-009 | 已完成 |

## 执行记录

| TP ID | 状态 | 开始时间 | 完成时间 | 产出文件 | 备注 |
|-------|------|---------|---------|---------|------|
| TP-001 | 已完成 | 2026-06-24 | 2026-06-24 | package.json | 新增 react-router-dom@6 |
| TP-002 | 已完成 | 2026-06-24 | 2026-06-24 | hooks/, shared/components/, features/wiki/ | 目录创建 |
| TP-003 | 已完成 | 2026-06-24 | 2026-06-24 | hooks/useConversations.ts | 抽取 conversation CRUD + loading + activeId |
| TP-004 | 已完成 | 2026-06-24 | 2026-06-24 | shared/components/SidebarHeader.tsx | 品牌 + NavLink 模块切换器 + 设置按钮 |
| TP-005 | 已完成 | 2026-06-24 | 2026-06-24 | features/wiki/WikiSidebar.tsx | 文件树 + 拖拽上传 + 进度轮询 |
| TP-006 | 已完成 | 2026-06-24 | 2026-06-24 | shared/components/SidebarFooter.tsx | 清空全部按钮 + ConfirmDialog |
| TP-007 | 已完成 | 2026-06-24 | 2026-06-24 | App.tsx (rewrite) | AppProvider: 主题 + SettingsModal + Outlet |
| TP-008 | 已完成 | 2026-06-24 | 2026-06-24 | features/chat/ChatPage.tsx + ChatSidebar.tsx | 组合 SidebarHeader + ChatSidebar + ChatArea |
| TP-009 | 已完成 | 2026-06-24 | 2026-06-24 | features/images/ImageSidebar.tsx + ImagePage.tsx | 独立生图侧边栏 |
| TP-010 | 已完成 | 2026-06-24 | 2026-06-24 | features/wiki/WikiPage.tsx + WikiPanel.tsx(move) | Wiki 模块 Page，WikiPanel 迁入 features/wiki/ |
| TP-011 | 已完成 | 2026-06-24 | 2026-06-24 | router.tsx, main.tsx | createHashRouter 配置 + RouterProvider 接入 |
| TP-012 | 已完成 | 2026-06-24 | 2026-06-24 | Sidebar.tsx(delete), WikiPanel.tsx(delete) | 清理旧文件 |
| TP-013 | 已完成 | 2026-06-24 | 2026-06-24 | — | Vite build + dev server 验证通过 |

## 偏差记录

暂无。

## 快捷链接

- [产品规格](product-spec.md)
- [设计文档](design-doc.md)
- [执行计划](exec-plan.md)
