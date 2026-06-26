# 产品规格：Client 路由架构重构

## 背景与目标

Mint Client 当前三个功能模块（Chat / Image / Wiki）共用 App.tsx 作为编排入口，`activeView` 状态控制视图切换，Sidebar 组件同时承载对话列表和 Wiki 文件树两份逻辑。这导致：

- App.tsx 职责过重：持有 conversations、endpoints、activeView、wiki 等非全局状态
- Sidebar 违反 SRP：根据 activeView 条件渲染截然不同的内容（对话列表 vs Wiki 文件树）
- 模块间逻辑交织，新增模块需要修改 App.tsx 和 Sidebar 两个核心文件
- 无 URL 状态，Electron 窗口恢复需额外维护 activeView 持久化

**目标**：引入 Hash Router，将三个模块拆为独立 Page 组件，App.tsx 降级为路由配置 + 全局壳（主题 + SettingsModal），Sidebar 按模块职责拆分。

## 用户与场景

- **开发者**：新增模块只需添加路由和 Page 文件，不修改 App/Sidebar 核心逻辑
- **用户**：在 Electron 窗口中使用浏览器前进后退切换模块；窗口恢复时 URL 保持当前模块

## 用户故事

| US ID | 描述 | 优先级 |
|-------|------|--------|
| US-001 | 作为用户，我点击侧边栏的模块按钮（Chat/Image/Wiki），URL 相应变化，页面展示对应模块 | P0 |
| US-002 | 作为开发者，新增模块时只需添加一个路由配置和一个 Page 文件，不修改现有 App/Sidebar | P0 |
| US-003 | 作为用户，Electron 窗口关闭后重新打开，页面停留在上次使用的模块 | P1 |
| US-004 | 作为用户，设置主题后切换模块，主题保持一致 | P0 |

## 范围（In Scope）

- 引入 react-router-dom，createHashRouter
- App.tsx 简化为路由配置 + 全局主题/SettingsModal
- Sidebar.tsx 拆分为 ChatSidebar / WikiSidebar + 共享 SidebarHeader
- 新建 ChatPage / ImagePage / WikiPage 各自组装侧边栏和主区域
- Image 模块独立侧边栏（ImageSidebar，不复用 ChatSidebar）
- WikiPanel 从 components/ 移至 features/wiki/ 目录
- 各模块 Page 内部使用独立数据管理层（useConversations hook）
- 移除 activeView 状态及关联的条件渲染逻辑
- SidebarFooter 作为共享组件保留

### 非目标

- 不涉及 Server 端变更
- 暂不实现 Wiki → Chat 的跳转（onAskQuestion）
- 不改变现有 UI 样式和交互行为
- 不引入 SSR/SSG
- 不做测试覆盖（仅代码重组，不涉及新增功能逻辑）

## 业务规则

| BR ID | 规则 | 说明 |
|-------|------|------|
| BR-001 | 默认路由指向 /chat | 根路径 / → Navigate to /chat |
| BR-002 | 设置模态框在全局壳层渲染 | 独立于路由，不随模块切换关闭 |
| BR-003 | 模块切换不丢失当前对话状态 | ChatPage 内部管理 conversations，重新进入 ChatPage 时 refetch |
| BR-004 | 路由 base 为 / | 使用 Hash Router，无服务器 fallback 需求 |

## 验收标准

| AC ID | 描述 | 关联 US |
|-------|------|---------|
| AC-001 | 访问 /#/chat 显示对话模块（ChatSidebar + ChatArea） | US-001 |
| AC-002 | 访问 /#/image 显示生图模块（ImageSidebar + ImageChatArea） | US-001 |
| AC-003 | 访问 /#/wiki 显示知识库模块（WikiSidebar + WikiPanel） | US-001 |
| AC-004 | 侧边栏模块按钮使用 NavLink，点击后 URL 更新且按钮高亮当前模块 | US-001 |
| AC-005 | 在 /chat 切换模块到 /wiki，再返回 /chat，对话列表重新加载 | US-002 |
| AC-006 | 切换模块不关闭设置模态框，主题在所有模块下一致 | US-004 |
| AC-007 | 根路径 /#/ 自动重定向到 /#/chat | US-001 |
| AC-008 | ImageSidebar 独立于 ChatSidebar，不共享对话列表组件 | US-002 |

## 风险与依赖

- 无外部依赖。需新增 npm 依赖 react-router-dom
- 风险：ChatPage 重新 mount 时 conversations refetch 可能闪烁，需在 hook 层做缓存或 loading 态处理

## 术语与统一口径

| 术语 | 定义 |
|------|------|
| Page | 一个路由对应的完整页面组件，组合侧边栏和主区域 |
| SidebarShell | 侧边栏框架（品牌 + 模块切换器 + footer），不包含具体内容 |
| AppLayout | 全局布局壳，包含主题注入和 SettingsModal outlet |
| Hash Router | URL 以 #/ 开头的客户端路由，无需服务端 fallback |
