# 设计文档：GitHub Pages 双语产品站

## 设计方向

采用“开源编辑部”视觉方向：深墨色首屏承载产品宣言，暖纸色内容区承载能力介绍，珊瑚橙用于行动和重点标记。通过细网格、编号标签和纵向时间线强化“可理解、可探索”的产品气质。

## 技术方案

- **DS-001**：使用零运行时依赖的静态 workspace，构建输出为 `website/dist`。
- **DS-002**：使用相对资源路径和单 DOM 翻译节点，兼容仓库子路径与双语切换。

- `website/index.html`：语义化单页结构和中英双语文案。
- `website/styles.css`：独立设计 token、响应式布局、动画和无障碍焦点状态。
- `website/main.js`：语言切换、语言持久化和年份更新；不依赖框架。
- `website/scripts/build.mjs`：将静态源文件复制到 `website/dist`，确保 Pages 只消费构建目录。
- `website/assets/`：复用 Mint 实际界面预览，并裁切为总览、侧边栏和对话区三组展示素材。
- `.github/workflows/deploy-pages.yml`：在 `main` 分支变更时构建并部署 Pages。

## 关键决策

1. 采用零运行时依赖的静态页面，避免 GitHub Pages 需要 Node 服务或 API。
2. 使用相对资源路径，兼容 `https://<org>.github.io/<repo>/` 子路径部署。
3. 用 `data-i18n` 集中标记翻译节点，避免维护两套 DOM。
4. 所有外部动作使用仓库链接占位（`GITHUB_REPO_URL` 在部署前可替换），不伪造产品内功能。
