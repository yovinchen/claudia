# GitHub Actions 工作流说明

本项目包含多个 GitHub Actions 工作流，适用于不同的使用场景。

## 📋 工作流列表

### 1. `build-opensource.yml` - 开源发布（推荐）
**用途**：正式版本发布，适合开源项目分发

**触发条件**：
- 创建版本标签 (`v*`)
- 手动触发

**特点**：
- ✅ 无需代码签名
- ✅ 自动创建 GitHub Release
- ✅ 支持所有平台
- ✅ 生成用户友好的安装包

**使用方法**：
```bash
# 创建版本发布
git tag v1.0.0
git push origin v1.0.0
```

---

### 2. `dev-ci.yml` - 开发测试
**用途**：PR 和开发分支的自动化测试

**触发条件**：
- Push 到 `dev`, `develop`, `feature/*` 分支
- 创建 PR 到 `main` 或 `dev`

**特点**：
- ✅ 代码格式检查
- ✅ Clippy 静态分析
- ✅ TypeScript 类型检查
- ✅ 单元测试
- ✅ 构建验证

**检查项目**：
- Rust 格式化 (`cargo fmt`)
- Rust 代码质量 (`cargo clippy`)
- TypeScript 类型 (`tsc`)
- 测试运行 (`cargo test`)

---

### 3. `quick-build.yml` - 快速构建
**用途**：快速测试构建，不创建发布

**触发条件**：
- 仅手动触发

**特点**：
- ✅ 可选择特定平台
- ✅ 最小化配置
- ✅ 快速构建
- ✅ 保存构建产物 7 天

**使用方法**：
1. GitHub → Actions → Quick Build
2. 选择目标平台
3. 点击 Run workflow

---

### 4. `build.yml` - 完整构建（需要签名）
**用途**：需要代码签名的正式发布

**要求**：
- ❗ 需要配置 Apple 证书
- ❗ 需要 GitHub Secrets

**不推荐用于**：
- 开源项目
- 个人开发
- 没有 Apple 开发者账号的情况

---

### 5. `build-unsigned.yml` - 未签名构建
**用途**：不需要签名的完整构建

**特点**：
- ✅ 支持所有平台
- ✅ 无需证书配置
- ⚠️ macOS 用户需要手动信任

---

## 🎯 推荐使用方案

### 开源项目
使用 **`build-opensource.yml`**：
- 简单配置
- 自动发布
- 用户友好

### 日常开发
使用 **`dev-ci.yml`**：
- 自动化测试
- 代码质量保证
- PR 检查

### 快速测试
使用 **`quick-build.yml`**：
- 手动触发
- 选择平台
- 快速验证

## 🚀 快速开始

### 1. 首次设置
```bash
# 确保工作流文件存在
ls -la .github/workflows/

# 推送到 GitHub
git add .github/
git commit -m "添加 GitHub Actions 工作流"
git push origin main
```

### 2. 创建发布
```bash
# 更新版本号
# 编辑 src-tauri/Cargo.toml, src-tauri/tauri.conf.json, package.json

# 提交更改
git add .
git commit -m "chore: bump version to v1.0.0"

# 创建标签并推送
git tag v1.0.0
git push origin v1.0.0

# 工作流会自动运行并创建 Release Draft
```

### 3. 开发测试
```bash
# 创建功能分支
git checkout -b feature/new-feature

# 推送会自动触发测试
git push origin feature/new-feature
```

## 📝 注意事项

1. **开源项目不需要代码签名**
   - 用户需要手动信任应用是正常的
   - 这不影响应用的功能

2. **构建产物保留时间**
   - Release: 永久保存
   - Artifacts: 7 天后自动删除

3. **并行构建**
   - 所有平台同时构建
   - 一个平台失败不影响其他平台

## 🔧 故障排除

### 构建失败
1. 检查 Actions 日志
2. 确认依赖版本正确
3. 本地测试构建：`bun run tauri build`

### Linux 构建问题
确保安装所有依赖：
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Windows 构建问题
- 确保使用 Windows Server 2019 或更高版本
- 检查 Visual Studio Build Tools

## 📚 相关文档

- [Tauri 构建文档](https://tauri.app/v1/guides/building/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [项目 README](../../README.md)
