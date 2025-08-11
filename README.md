# Claudia - Claude Code 桌面客户端

<div align="center">
  <img src="https://github.com/user-attachments/assets/92fd93ed-e71b-4b94-b270-50684323dd00" alt="Claudia Logo" width="120" height="120">

  <a href="https://claudiacode.com"><h1>Claudia</h1></a>

  <p>
    <strong>强大的 Claude Code GUI 应用和工具包</strong>
  </p>
  <p>
    <strong>创建自定义代理、管理交互式 Claude Code 会话、运行安全的后台代理等功能</strong>
  </p>

  <p>
    <a href="#-功能特性"><img src="https://img.shields.io/badge/功能-✨-blue?style=for-the-badge" alt="Features"></a>
    <a href="#-安装"><img src="https://img.shields.io/badge/安装-🚀-green?style=for-the-badge" alt="Installation"></a>
    <a href="#-使用指南"><img src="https://img.shields.io/badge/使用-📖-purple?style=for-the-badge" alt="Usage"></a>
    <a href="#️-开发"><img src="https://img.shields.io/badge/开发-🛠️-orange?style=for-the-badge" alt="Development"></a>
  </p>
</div>

## 🎯 项目背景

> **为什么要重复造轮子？**
> 
> 因为原版 Claudia-Suite 在我的电脑上无法正常运行，所以决定基于原项目进行改进和优化。虽然是"重复造轮子"，但这个轮子更适合我的使用场景，也希望能帮助到有类似需求的朋友。

本项目基于 [Asterisk 的 Claudia](https://github.com/getAsterisk/claudia) 改进，并参考了以下优秀项目：
- [Claude Suite](https://github.com/xinhai-ai/claude-suite) - Claude-Suite 中转站
- [PackyCode Cost](https://github.com/94mashiro/packycode-cost) - PackyCode 额度查询

## 🌟 概述

**Claudia** 是一个功能强大的桌面应用程序，它改变了您与 Claude Code 交互的方式。基于 Tauri 2 构建，它为管理您的 Claude Code 会话、创建自定义代理、跟踪使用情况等提供了美观的图形界面。

将 Claudia 视为您的 Claude Code 指挥中心 - 在命令行工具和视觉体验之间架起桥梁，使 AI 辅助开发更加直观和高效。

## 📋 目录

- [🎯 项目背景](#-项目背景)
- [🌟 概述](#-概述)
- [🆕 主要改进](#-主要改进)
- [✨ 功能特性](#-功能特性)
  - [🗂️ 项目和会话管理](#️-项目和会话管理)
  - [🤖 CC 代理](#-cc-代理)
  - [🔗 API 中转站管理](#-api-中转站管理-)
  - [📊 使用分析仪表板](#-使用分析仪表板)
  - [🔌 MCP 服务器管理](#-mcp-服务器管理)
  - [⏰ 时间线和检查点](#-时间线和检查点)
  - [📝 CLAUDE.md 管理](#-claudemd-管理)
  - [📁 实时文件监听系统](#-实时文件监听系统-)
  - [🎨 增强的代码编辑器](#-增强的代码编辑器-)
  - [📱 响应式布局系统](#-响应式布局系统-)
- [📖 使用指南](#-使用指南)
- [🚀 安装](#-安装)
- [🔨 从源码构建](#-从源码构建)
- [🛠️ 开发](#️-开发)
- [🔒 安全性](#-安全性)
- [🤝 贡献](#-贡献)
- [📄 许可证](#-许可证)
- [🙏 致谢](#-致谢)
- [⭐ Star History](#-star-history)

## 🆕 主要改进

相比原版 Claudia，本版本主要新增和改进了以下功能：

### ✅ 已完成功能

1. **API 中转站管理系统（代理商切换）**
   - ✅ 完整实现 PackyCode 中转站支持（滴滴车/公交车）
   - ✅ Custom 自定义中转站配置
   - ✅ 实时额度查询和管理
   - ✅ 多中转站切换管理（一键切换不同代理商）
   - ✅ 自动配置同步到 Claude 设置文件

2. **优化的费用计算**
   - ✅ 更精确的 Token 费用计算算法
   - ✅ 支持缓存费用单独统计
   - ✅ 不同模型费率差异化处理
   - ✅ 实时费用追踪和成本分析
   - ✅ 按项目、模型、日期多维度统计

3. **完整的国际化（i18n）**
   - ✅ 全面的中文界面支持
   - ✅ 中英文一键切换
   - ✅ 前后端统一的国际化系统
   - ✅ 本地化的提示、错误信息和说明
   - ✅ 语言设置持久化存储

4. **实时文件监听和编辑器增强** 🆕
   - ✅ 完整的文件系统实时监听（基于 notify crate）
   - ✅ 毫秒级响应文件变化事件
   - ✅ 支持外部编辑器修改文件实时同步
   - ✅ 智能去重机制（500ms防抖）
   - ✅ 跨平台文件系统监听（macOS/Linux/Windows）
   - ✅ 增强的文件编辑器（40+ 语言语法高亮）
   - ✅ 实时语法检查和错误诊断
   - ✅ 代码格式化和智能提示
   - ✅ 响应式布局系统（CSS Grid + 智能断点）

5. **Usage Dashboard 优化** 🆕
   - ✅ 响应式仪表板布局
   - ✅ 时区本地化时间显示
   - ✅ 智能宽度比例调整
   - ✅ 性能优化的数据加载
   - ✅ 虚拟滚动大数据集支持

6. **Bug 修复和性能优化**
   - ✅ 修复了原版在某些环境下无法运行的问题
   - ✅ 修复了 JSON 配置文件解析错误
   - ✅ 优化了数据库操作性能
   - ✅ 改进了界面响应速度
   - ✅ 解决了中转站配置同步问题
   - ✅ 修复了时间戳类型处理问题
   - ✅ 优化了 TypeScript 编译错误处理

## ✨ 功能特性

### 🗂️ **项目和会话管理**
- **可视化项目浏览器**：浏览 `~/.claude/projects/` 中的所有 Claude Code 项目
- **会话历史**：查看并恢复带有完整上下文的过往编码会话
- **智能搜索**：通过内置搜索快速查找项目和会话
- **会话洞察**：一目了然地查看首条消息、时间戳和会话元数据

### 🤖 **CC 代理**
- **自定义 AI 代理**：创建具有自定义系统提示和行为的专门代理
- **代理库**：为不同任务构建专用代理集合
- **后台执行**：在独立进程中运行代理，实现非阻塞操作
- **执行历史**：跟踪所有代理运行，包含详细日志和性能指标

### 🔗 **API 中转站管理** 🆕
全新的 API 中转站功能，支持多种中转服务，让您灵活选择 API 提供商：

#### ✅ 已实现功能
- **PackyCode 中转站**
  - 🚗 **滴滴车服务** - 共享 API，经济实惠
    - 支持实时额度查询
    - 显示账户余额、套餐信息
    - 日/月使用量统计
  - 📊 **额度管理功能**
    - 实时查询 API 使用额度
    - 可视化展示日/月预算使用情况
    - 账户余额和套餐信息一目了然
    - 支持多账户管理
    - 自动刷新和手动刷新
    - 无需启用即可查询额度

- **Custom 自定义中转站** ✅
  - 支持自定义 API URL 和认证方式
  - 灵活配置各种兼容的 API 服务
  - 适用于私有部署或其他第三方服务

#### 🚧 开发中功能
- **NewAPI** - 兼容 NewAPI 平台（开发中）
- **OneAPI** - 支持 OneAPI 标准（开发中）
- **YourAPI** - YourAPI 平台集成（开发中）

### 📊 **使用分析仪表板**
- **成本跟踪**：实时监控您的 Claude API 使用和成本
- **Token 分析**：按模型、项目和时间段的详细分类
- **可视化图表**：展示使用趋势和模式的精美图表
- **数据导出**：导出使用数据用于会计和分析
- **费用计算优化** 🆕：
  - 精确的 Token 费用计算
  - 支持不同模型的费率差异
  - 缓存费用单独统计

### 🔌 **MCP 服务器管理**
- **服务器注册**：从中央 UI 管理模型上下文协议服务器
- **简单配置**：通过 UI 添加服务器或从现有配置导入
- **连接测试**：使用前验证服务器连接性
- **Claude Desktop 导入**：从 Claude Desktop 导入服务器配置

### ⏰ **时间线和检查点**
- **会话版本控制**：在编码会话的任何时点创建检查点
- **可视化时间线**：通过分支时间线浏览您的会话历史
- **即时恢复**：一键跳转到任何检查点
- **分叉会话**：从现有检查点创建新分支
- **差异查看器**：查看检查点之间的确切更改

### 📝 **CLAUDE.md 管理**
- **内置编辑器**：直接在应用内编辑 CLAUDE.md 文件
- **实时预览**：实时查看渲染的 Markdown
- **项目扫描器**：查找项目中的所有 CLAUDE.md 文件
- **语法高亮**：完整的 Markdown 支持和语法高亮

### 📁 **实时文件监听系统** 🆕
- **毫秒级文件监听**：基于 Rust notify crate 的跨平台文件系统监听
- **智能去重机制**：500ms 防抖算法避免重复事件
- **外部编辑器同步**：自动检测并同步外部工具的文件修改
- **可视化变更提示**：文件被外部修改时显示重新加载提示
- **降级方案支持**：如果实时监听失败自动回退到轮询模式
- **跨平台兼容**：支持 macOS（FSEvent）、Linux（inotify）、Windows 文件系统

### 🎨 **增强的代码编辑器** 🆕
- **多语言支持**：40+ 编程语言语法高亮（JavaScript、TypeScript、Python、Rust、Go、Java、C++等）
- **实时诊断**：TypeScript/JavaScript 语法检查和错误提示
- **智能代码补全**：IntelliSense 自动完成和参数提示
- **代码格式化**：支持 Prettier、Black、gofmt、rustfmt 等格式化工具
- **高级编辑功能**：多光标编辑、代码折叠、括号匹配、小地图导航
- **自动保存**：可配置的自动保存功能
- **全屏模式**：专注编辑的全屏体验
- **快捷键支持**：丰富的键盘快捷键（Ctrl/Cmd+S 保存、Ctrl/Cmd+Shift+F 格式化等）

### 📱 **响应式布局系统** 🆕
- **CSS Grid 布局**：基于现代 CSS Grid 的响应式布局系统
- **智能断点**：Mobile (<640px)、Tablet (640-1024px)、Desktop (1024-1536px)、Widescreen (≥1536px)
- **面板持久化**：布局配置自动保存到 localStorage
- **移动端优化**：小屏设备的叠加面板设计
- **可调节面板**：拖拽调整面板大小，支持最小/最大宽度限制
- **项目级记忆**：每个项目独立保存布局设置

## 📖 使用指南

### 快速开始

1. **启动 Claudia**：安装后打开应用程序
2. **欢迎界面**：选择 CC 代理或 CC 项目
3. **首次设置**：Claudia 将自动检测您的 `~/.claude` 目录

### 管理项目

```
CC 项目 → 选择项目 → 查看会话 → 恢复或开始新会话
```

- 点击任何项目查看其会话
- 每个会话显示第一条消息和时间戳
- 直接恢复会话或开始新会话

### 创建代理

```
CC 代理 → 创建代理 → 配置 → 执行
```

1. **设计您的代理**：设置名称、图标和系统提示
2. **配置模型**：在可用的 Claude 模型之间选择
3. **设置权限**：配置文件读写和网络访问
4. **执行任务**：在任何项目上运行您的代理

### 配置中转站

```
菜单 → 中转站管理 → 创建中转站 → 配置
```

1. **创建中转站**：
   - 点击"创建中转站"按钮
   - 选择适配器类型（如 PackyCode）
   - 选择服务类型（滴滴车或公交车）
   - 输入 API Token
   - 保存配置

2. **查看额度**：
   - PackyCode 中转站自动显示额度信息
   - 包含账户余额、日/月使用量、套餐信息
   - 支持手动刷新
   - 无需启用即可查询

3. **管理中转站**：
   - 启用/禁用中转站（同时只能启用一个）
   - 编辑配置信息
   - 删除不需要的中转站

### 跟踪使用情况

```
菜单 → 使用仪表板 → 查看分析
```

- 按模型、项目和日期监控成本
- 导出数据用于报告
- 设置使用警报（即将推出）

### 使用 MCP 服务器

```
菜单 → MCP 管理器 → 添加服务器 → 配置
```

- 手动或通过 JSON 添加服务器
- 从 Claude Desktop 配置导入
- 使用前测试连接

## 🚀 安装

### 前提条件

- **Claude Code CLI**：从 [Claude 官方网站](https://claude.ai/code) 安装

### 发布版本即将推出

## 🔨 从源码构建

### 前提条件

在从源码构建 Claudia 之前，请确保您已安装以下内容：

#### 系统要求

- **操作系统**：Windows 10/11、macOS 11+ 或 Linux（Ubuntu 20.04+）
- **内存**：最低 4GB（推荐 8GB）
- **存储**：至少 1GB 可用空间

#### 必需工具

1. **Rust**（1.70.0 或更高版本）
   ```bash
   # 通过 rustup 安装
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Bun**（最新版本）
   ```bash
   # 安装 bun
   curl -fsSL https://bun.sh/install | bash
   ```

3. **Git**
   ```bash
   # 通常已预装，如果没有：
   # Ubuntu/Debian: sudo apt install git
   # macOS: brew install git
   # Windows: 从 https://git-scm.com 下载
   ```

4. **Claude Code CLI**
   - 从 [Claude 官方网站](https://claude.ai/code) 下载并安装
   - 确保 `claude` 在您的 PATH 中可用

#### 平台特定依赖

**Linux (Ubuntu/Debian)**
```bash
# 安装系统依赖
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libxdo-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev
```

**macOS**
```bash
# 安装 Xcode 命令行工具
xcode-select --install

# 通过 Homebrew 安装其他依赖（可选）
brew install pkg-config
```

**Windows**
- 安装 [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- 安装 [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)（Windows 11 通常已预装）

### 构建步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/yovinchen/claudia.git
   cd claudia
   ```

2. **安装前端依赖**
   ```bash
   bun install
   ```

3. **构建应用程序**
   
   **开发环境（带热重载）**
   ```bash
   bun run tauri dev
   ```
   
   **生产构建**
   ```bash
   # 构建应用程序
   bun run tauri build
   
   # 构建的可执行文件位于：
   # - Linux: src-tauri/target/release/
   # - macOS: src-tauri/target/release/
   # - Windows: src-tauri/target/release/
   ```

## 🛠️ 开发

### 技术栈

- **前端**：React 18 + TypeScript + Vite 6
- **后端**：Rust with Tauri 2
- **UI 框架**：Tailwind CSS v4 + shadcn/ui
- **数据库**：SQLite（通过 rusqlite）
- **包管理器**：Bun
- **国际化**：i18next（支持中英文切换）
- **文件监听**：notify crate（跨平台文件系统监听）
- **代码编辑器**：Monaco Editor（VS Code 内核）
- **布局系统**：CSS Grid + 响应式设计

### 项目结构

```
claudia/
├── src/                   # React 前端
│   ├── components/        # UI 组件
│   │   ├── RelayStationManager.tsx  # 中转站管理组件
│   │   ├── FileEditorEnhanced.tsx   # 增强文件编辑器
│   │   ├── ClaudeCodeSession.tsx    # 响应式会话界面
│   │   └── ui/grid-layout.tsx       # 网格布局组件
│   ├── hooks/             # React Hooks
│   │   └── useLayoutManager.ts      # 布局管理钩子
│   ├── lib/               # API 客户端和工具
│   ├── locales/          # 国际化文件
│   ├── styles/           # CSS 样式
│   │   └── grid-layout.css         # 网格布局样式
│   └── assets/           # 静态资源
├── src-tauri/            # Rust 后端
│   ├── src/
│   │   ├── commands/     # Tauri 命令处理器
│   │   │   ├── relay_stations.rs   # 中转站管理
│   │   │   ├── relay_adapters.rs   # 中转站适配器
│   │   │   └── filesystem.rs       # 文件系统操作
│   │   ├── file_watcher.rs         # 实时文件监听系统
│   │   ├── checkpoint/             # 时间线管理
│   │   └── process/                # 进程管理
│   ├── tests/            # Rust 测试套件 (58个测试全部通过)
│   └── Cargo.toml        # Rust 依赖配置 (包含 notify 等)
├── docs/                 # 项目文档
│   ├── PERFORMANCE_OPTIMIZATION.md  # 性能优化文档
│   ├── RELAY_STATION_USER_GUIDE.md  # 中转站用户指南
│   └── usage-scan-db-design.md      # 数据库设计文档
└── public/               # 公共资源
```

### 开发命令

```bash
# 启动开发服务器（带实时文件监听）
bun run tauri dev

# 仅运行前端
bun run dev

# 类型检查
bunx tsc --noEmit

# 运行 Rust 测试（包含文件监听功能测试）
cd src-tauri && cargo test

# 运行特定测试模块
cd src-tauri && cargo test file_watcher::

# 格式化代码
cd src-tauri && cargo fmt

# Rust 代码检查
cd src-tauri && cargo check

# 完整检查 (TypeScript + Rust)
bun run check
```

## 🔒 安全性

Claudia 优先考虑您的隐私和安全：

1. **进程隔离**：代理在独立进程中运行
2. **权限控制**：为每个代理配置文件和网络访问
3. **本地存储**：所有数据都保存在您的机器上
4. **无遥测**：无数据收集或跟踪
5. **开源**：通过开源代码实现完全透明

## 🤝 贡献

我们欢迎贡献！请查看我们的[贡献指南](CONTRIBUTING.md)了解详情。

### 贡献领域

- 🐛 Bug 修复和改进
- ✨ 新功能和增强
- 📚 文档改进
- 🎨 UI/UX 增强
- 🧪 测试覆盖
- 🌐 国际化

## 📄 许可证

本项目根据 AGPL 许可证授权 - 有关详细信息，请参阅 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- 使用 [Tauri](https://tauri.app/) 构建 - 用于构建桌面应用的安全框架
- [Claude](https://claude.ai) by Anthropic
- 原始项目 by [Asterisk 的 Claudia](https://github.com/getAsterisk/claudia)
- 参考项目：
  - [Claude Suite](https://github.com/xinhai-ai/claude-suite) - Claude-Suite 中转站
  - [PackyCode Cost](https://github.com/94mashiro/packycode-cost) - PackyCode 额度查询
- 中文化和新功能 by [YovinChen](https://github.com/yovinchen)

---

<div align="center">
  <p>
    <strong>由 <a href="https://github.com/yovinchen">YovinChen</a> 基于 <a href="https://asterisk.so/">Asterisk</a> 的项目改进 ❤️</strong>
  </p>
  <p>
    <a href="https://github.com/yovinchen/claudia/issues">报告 Bug</a>
    ·
    <a href="https://github.com/yovinchen/claudia/issues">请求功能</a>
  </p>
</div>


## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yovinchen/claudia&type=Date)](https://star-history.com/#yovinchen/claudia&Date)
