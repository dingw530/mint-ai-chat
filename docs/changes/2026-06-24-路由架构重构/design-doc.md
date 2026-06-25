# 设计方案：Client 路由架构重构

## 背景与目标

现有 Client 架构中，App.tsx 通过 `activeView` 状态控制 Chat/Image/Wiki 三个模块的切换，Sidebar 组件同时承载对话列表和 Wiki 文件树。这种设计导致模块间逻辑耦合，新增模块需同时修改 App 和 Sidebar。

目标详见 product-spec.md。

## 约束与前提

1. 仅修改 client/ 目录代码
2. 使用 Hash Router，无需 Express fallback 配置
3. 现有 CSS 选择器和 DOM 结构尽可能少改，仅做必要的结构调整
4. 不改变现有 UI 外观和交互

## 方案选项

### 方案 A：activeView 重构（不引入路由）

在原架构基础上，抽取 useConversation 等 hook，拆分 Sidebar，App.tsx 仍保留 activeView 状态驱动。

**优点**：无新增依赖，改动最小
**缺点**：无 URL 状态，无浏览器导航，新增模块仍需修改 App.tsx 的判断逻辑

### 方案 B：Hash Router 模块隔离（推荐）

引入 react-router-dom，createHashRouter，每个模块为独立 Page 组件。

**优点**：URL 驱动、模块完全隔离、新增模块只需加路由 + 文件、Electron 窗口恢复天然支持
**缺点**：需新增依赖 react-router-dom，模块切换时 Page 重新 mount

### 方案 C：Browser Router + Express fallback

使用 createBrowserRouter，配置 Express 将所有未匹配路由返回 client/index.html。

**优点**：URL 无 # 号，更美观
**缺点**：需修改 server 端配置（违反约束 1），Electron 环境下 hash 更可靠

### 方案对比

| 维度 | 方案 A | 方案 B | 方案 C |
|------|--------|--------|--------|
| 改动量 | 中 | 中 | 大（含 server） |
| 模块隔离度 | 低 | 高 | 高 |
| Electron 兼容 | 需额外维护 | 原生支持 | 需额外配置 |
| 新增模块代价 | 改 App + Sidebar | 加路由 + Page | 加路由 + Page |
| 浏览器导航 | 不支持 | 支持 | 支持 |
| 新增依赖 | 无 | react-router-dom | react-router-dom |

### 最终决策

**选择方案 B**。Hash Router 在纯前端 SPA + Electron 场景下是最优平衡。

## 详细设计

### 路由结构

```
createHashRouter([
  {
    element: <AppProvider />,    // 全局壳：主题 + SettingsModal Context
    children: [
      { path: '/chat',  element: <ChatPage /> },
      { path: '/image', element: <ImagePage /> },
      { path: '/wiki',  element: <WikiPage /> },
      { index: true,    element: <Navigate to="/chat" /> },
    ],
  },
]);
```

### 组件层级

```
AppProvider (theme + settings modal)
└── <Outlet>
    ├── ChatPage
    │   ├── SidebarHeader (共享)
    │   ├── ChatSidebar (对话列表)
    │   └── ChatArea
    │
    ├── ImagePage
    │   ├── SidebarHeader (共享)
    │   ├── ImageSidebar (独立)
    │   └── ImageChatArea
    │
    └── WikiPage
        ├── SidebarHeader (共享)
        ├── WikiSidebar (文件树 + 上传)
        └── WikiPanel
```

### 组件职责

| 组件 | 职责 | 状态源 |
|------|------|--------|
| AppProvider | 主题管理、SettingsModal 渲染、全局 Context | 组件内部 |
| SidebarHeader | 品牌 Logo、模块切换 NavLink、设置按钮 | props |
| ChatSidebar | 对话列表 CRUD、Search | useConversations hook |
| ImageSidebar | 生图对话列表（独立组件） | useConversations('image') |
| WikiSidebar | Wiki 文件树、文件上传、上传进度 | 组件内部 |
| ChatPage | 组合 ChatSidebar + ChatArea | 组件内部 |
| ImagePage | 组合 ImageSidebar + ImageChatArea | 组件内部 |
| WikiPage | 组合 WikiSidebar + WikiPanel | 组件内部 |

### 数据管理

```typescript
// useConversations hook — 模块内自管理
function useConversations(type?: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  // CRUD: create, delete, rename, clearAll
  // 挂载时 fetchConversations(type)
  return { conversations, loading, create, delete, rename, clearAll };
}
```

ImageSidebar 内部调用 `useConversations('image')` 获取 image 类型的对话列表。

### 目录结构变更

```
client/src/
├── App.tsx                        → 删除或精简为路由配置
├── components/
│   ├── Sidebar.tsx                → 删除，拆分为 ChatSidebar + WikiSidebar
│   ├── WikiPanel.tsx              → 移至 features/wiki/
│   └── ConfirmDialog.tsx          → 保留
├── features/
│   ├── chat/
│   │   ├── components/...
│   │   └── ChatPage.tsx           ← 新增
│   ├── images/
│   │   ├── components/...
│   │   ├── ImageSidebar.tsx       ← 新增
│   │   └── ImagePage.tsx          ← 新增
│   └── wiki/
│       ├── WikiSidebar.tsx        ← 从 Sidebar.tsx 拆分
│       ├── WikiPanel.tsx          ← 从 components/ 移入
│       └── WikiPage.tsx           ← 新增
├── hooks/
│   └── useConversations.ts        ← 新增
├── shared/
│   └── components/
│       └── SidebarHeader.tsx      ← 从 Sidebar 提取
└── styles/                        → 不变
```

## 影响与风险

1. **模块切换 remount**：ChatPage 离开 /chat 路由后组件卸载，返回时 useConversations 重新 fetch。为避免闪烁，hook 内保留 loading 态，Sidebar 显示 skeleton/loading。当前已有 loading 态，无需额外处理。
2. **CSS 选择器兼容**：DOM 层级基本不变（sidebar + main-content），CSS 无需调整
3. **SidebarFooter 逻辑**：当前仅在 chat 模式显示「清空全部」按钮，需作为共享组件接收 `showClear` prop

## 发布与验证

1. 开发环境：Vite dev server `/api` 代理不变，Hash Router 无需额外配置
2. 生产构建：`npm run build` 后，Express 托管 `client/dist/`，所有请求路径页面为 index.html，Hash Router 自动处理前端路由
3. 验证方式：通过 Vite dev 手动测试 4 个路由（/chat /image /wiki 根路径）+ 模块切换按钮行为

## 设计决策

| DS ID | 决策 | 关联 US/BR |
|-------|------|-----------|
| DS-001 | 使用 createHashRouter 而非 createBrowserRouter | US-003, BR-004 |
| DS-002 | AppProvider 作为 layout route，Page 作为 child outlet | US-004 |
| DS-003 | useConversations hook 封装对话 CRUD，各 Page 独立调用 | US-002 |
| DS-004 | ImageSidebar 独立组件，不复用 ChatSidebar | AC-008 |
| DS-005 | WikiSidebar + WikiPanel 同步迁移到 features/wiki/ | US-002 |
| DS-006 | SidebarHeader 提取为共享组件，接收 activeModule + onOpenSettings | US-001 |
