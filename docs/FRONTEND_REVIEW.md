# 前端规范审查（对照 jakub.kr better-* skills）

审查日期：2026-10-02，基于 `origin/main` 46e8502。仅读源码，未运行应用；对比度由主题 token 的 oklch 值计算。

说明：全局字体为等宽 Maple Mono，数字天然等宽，用量/费用表无需 `tabular-nums`。

## 高（Block）

1. **全局移除焦点样式** — `src/styles.css:300-341` 用 `* { outline:none !important }`、`*:focus-visible { box-shadow:none !important }`、`.ring-*{box-shadow:none !important}` 覆盖了组件自带的 `focus-visible:ring`。改为 `:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px }`，并核对各主题下 ring 对比度。
2. **不尊重 prefers-reduced-motion** — 56 个 framer-motion 文件 + `styles.css` 的 shimmer/scanlines/trail-rotate/`animate-spin-slow`。`src/main.tsx` 外包 `<MotionConfig reducedMotion="user">`，CSS 循环动画放入 `@media (prefers-reduced-motion: no-preference)`。
3. **图标按钮无可读名称** — 87 处 `size="icon"`，仅 4 个 `aria-label`。如 `FloatingPromptInput.tsx:753/1030/1077`、`ClaudeCodeSession.tsx:1522/1687`、`Settings.tsx:800/928`、`TabManager.tsx:111/412`、`toast.tsx:85`、`UsageDashboard.tsx:280`。补 `aria-label={t(...)}`，图标 `aria-hidden`。
4. **状态仅靠颜色** — `Topbar.tsx:119-125`、`ClaudeCodeSession.tsx:1491/1690`、`UsageDashboard.tsx:305`。开关加 `aria-pressed`，状态点配文字或不同图标。
5. **MCP 删除无确认、仅 hover 可见** — `MCPServerList.tsx:262-286`。参照 `CCAgents.tsx:541` 加确认，补 `group-focus-within:opacity-100`。同类：`ProjectList.tsx:245`、`WelcomePage.tsx:229`、`ImagePreview.tsx:104`、`ClaudeCodeSession.tsx:1502`、`TabManager.tsx:119`。
6. **卡片/标签页只能鼠标操作** — `ProjectList.tsx:204`（`<Card onClick>`）、`TabManager.tsx:63-80`（无 tabIndex/role，关闭按钮 `tabIndex={-1}`）。用真实 `<button>` 或 `role="tablist"/"tab"` + 方向键。
7. **错误 toast 3 秒消失且不播报** — `ui/toast.tsx:45`、`App.tsx:669`。错误类型 `duration=0`，容器 `role="status"`，错误 `role="alert"`。
8. **对比度不达标** — destructive 按钮文字 4.12–4.24:1（`styles.css:139/184/211`，L 0.6→≈0.55）；placeholder 2.8–3.2:1（`styles.css:278`，去掉 `opacity: 0.6`）。
9. **`dark:` 跟随系统而非应用主题** — 102 处。应用浅色 + 系统深色时如 `Settings.tsx:866` 仅 1.73:1。`styles.css` 加 `@custom-variant dark (&:where(.theme-dark, .theme-gray, .theme-dark *, .theme-gray *));`

## 中

10. `--color-border`/`--color-input` 对背景仅 1.05–1.54:1，深色主题 border 与 muted 同值；input 边框单独设到 ≥3:1。
11. `index.html:7`、`styles.css:259-261` 写死 `color-scheme: dark`，浅色主题控件/滚动条仍为深色；各 `.theme-*` 分别声明。
12. `ui/switch.tsx:25-57` 在 `role=switch` 按钮内嵌隐藏 checkbox，`id` 落到 input 上，`<Label htmlFor>` 指错；改用 `@radix-ui/react-switch`。
13. `ui/tabs.tsx:65/100` 无 tablist 语义、方向键与 `aria-controls`；改用 `@radix-ui/react-tabs`。
14. 仅 placeholder 当标签：`Settings.tsx:794/841/912/919`、`FloatingPromptInput.tsx:770/1013`。
15. `FloatingPromptInput.tsx:735-748` 展开弹窗无 `role="dialog"`、Esc 和焦点约束；改用 `ui/dialog`。
16. 点击区域 <24px：`ui/dialog.tsx:44`、`TabManager.tsx:117`。
17. 截断文本无全文：`ProjectList.tsx:226`、`TabManager.tsx:90`，加 `title` 或 Tooltip。
18. 硬编码文案未走 i18n：`FloatingPromptInput.tsx:1074`、`ExecutionControlBar.tsx:96`、`Topbar.tsx:100`、`ClaudeCodeSession.tsx:1502/1562/1697/2215-2250`、`StreamMessage.tsx:427-601`、`SlashCommandPicker.tsx:304-315`、`ui/dialog.tsx:46`、`SortableStationItem.tsx:140`。
19. zh 比 en 少 57 个 key；`zh/common.json:747` 的 key `loadClaudemدFailed` 混入阿拉伯字母。
20. 复数靠拼接（`en/common.json:101-103/778`），改用 i18next `_one`/`_other`。
21. 英文 Title Case（250）与 sentence case（187）混用；10 条成功提示带“!”。

## 低

22. `index.html:2` `lang="en"` 写死，随 `languageChanged` 同步 `document.documentElement.lang`。
23. 字体用 `.ttf`（改 `.woff2`）、加载未使用的 300 字重、body `letter-spacing:-0.01em`（`index.html:11-37`、`styles.css:271`）。
24. 无效 CSS：`.theme-white`（`styles.css:223-247`）、`.theme-light .text-muted-foreground`（`:923-929`）；状态色建议语义 token `--color-success`，629 处直接调色板类可逐步替换。
25. 46 处 `transition-all`；切换主题时未临时禁用过渡。

## 可安全自动修复

1、2、7、8、9、11、16、17、22、23、24 及 19 的 key 名修正为局部改动；3、18 机械但跨文件多，建议分批并跑 tsc；6、12、13、15 改变组件结构，需要回归测试。
