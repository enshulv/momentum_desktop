# Momentum Desktop - 桌面版自控力提升工具 🖥️

> [!IMPORTANT]
> 上游仓库已提供桌面端实现，请优先使用上游桌面端版本：<https://github.com/KenXiao1/momentum>  
> 本仓库的历史使命已完成，现已停止功能更新，仅保留归档。

<p align="center">
  <img src="public/app-icon.png" alt="Momentum Logo" width="128" height="128">
</p>

<p align="center">
  <strong>基于链式时延协议（CTDP）理论的跨平台桌面应用</strong><br>
  通过"神圣座位原理"、"下必为例原理"和"线性时延原理"帮助用户建立强大的习惯链条
</p>

## 最新更新

- 优化了自动化发布流程，现在只有在需要发布时才会进行构建
- 小窗与置顶流程已完成（同窗口画中画模式）
- RSIP 节点支持编辑并持久化
- 撤回/前进与操作历史已接入（快捷键 + 全局右键菜单）
- 修复删除后撤回导致回收箱残留的问题
- 新增“更新后首次打开弹窗显示更新事项”（每版本仅一次）

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform Support">
  <img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="License">
  <img src="https://img.shields.io/badge/version-1.2.6-orange" alt="Version">
</p>

---

## 📖 关于本分支

本分支是从主分支分叉而来的**桌面版增强分支**，在保持核心CTDP理论不变的基础上，为用户提供了完整的跨平台桌面应用体验。

### 🔗 核心功能介绍
完整的CTDP理论、三大核心原理和基础功能介绍，请查看：
- **[主分支](https://github.com/KenXiao1/momentum)** - 详细的理论介绍和核心功能
- **[知乎文章](https://www.zhihu.com/question/19888447/answer/1930799480401293785)** - CTDP理论原文
- **[理论详解](https://zhuanlan.zhihu.com/p/1932530006774505748)** - 完整的使用指南

---

## 🚀 桌面版新特性

### ✨ 本地化体验
- **🖥️ 原生桌面应用** - 基于Electron构建，支持Windows
- **📱 系统托盘** - 支持后台运行，快速访问
- **⚙️ 窗口控制** - 自定义最小化、最大化、关闭按钮
- **🪟 小窗专注模式** - 一键进入小窗 + 可置顶 + 状态持久化

### 💾 数据管理
- **🗂️ 本地文件存储** - 支持本地数据存储，无需依赖网络
- **☁️ 云端同步** - 可选的Supabase云端数据同步
- **💾 数据备份** - 一键备份和恢复功能

### ⏰ 增强提醒系统
- **🔔 桌面通知** - 预约到期前3分钟桌面提醒
- **📅 智能调度** - 高精度的任务调度系统
- **⚡ 实时反馈** - 即时的任务状态更新

### 🔄 自动更新系统
- **📦 自动检测更新** - 应用启动时自动检查新版本
- **🔔 更新提醒** - 顶部通知栏显示可用更新
- **⚡ 一键更新** - 用户确认后自动下载和安装
- **📝 首次启动更新说明** - 升级后首次打开弹窗展示本次更新要点

---

## 📦 下载安装

### 📥 预编译版本
从 [Releases页面](https://github.com/enshulv/momentum_desktop/releases) 下载Windows版本：

- **Windows x64**: `.exe` 安装包 (NSIS)

### 🛠️ 从源码构建

#### 环境要求
- Node.js 18+ 
- npm 或 yarn
- Git

#### 构建步骤
```bash
# 克隆仓库
git clone https://github.com/enshulv/momentum_desktop.git
cd momentum

# 安装依赖
npm install

# 开发模式运行
npm run electron:dev

# 构建生产版本
npm run electron:build
```

---

## 🔧 开发指南

### 项目结构
```
momentum/
├── electron/              # Electron主进程文件
│   ├── main.js            # 主进程入口
│   ├── preload.js         # 预加载脚本
│   └── preload.mjs        # ES模块预加载脚本
├── src/                   # React源码
│   ├── components/        # React组件
│   ├── services/          # 业务服务
│   ├── utils/            # 工具函数
│   └── styles/           # 样式文件
├── public/               # 静态资源
└── dist/                 # 构建输出目录
```

### 可用脚本
```bash
# 开发模式（Web）
npm run dev

# 开发模式（Electron）
npm run electron:dev

# 构建Web版本
npm run build

# 构建Electron应用
npm run electron:build

# 代码检查
npm run lint
```

### 自动更新配置

应用集成了基于GitHub Releases的自动更新系统：

1. **自动检测**: 应用启动时自动检查更新
2. **用户提示**: 发现新版本时在界面顶部显示通知
3. **确认下载**: 用户点击后显示更新确认对话框
4. **自动安装**: 下载完成后提示重启应用
5. **更新说明弹窗**: 新版本首次启动展示更新事项（本地记录已读版本）

更新检查基于 [Electron官方文档](https://www.electronjs.org/zh/docs/latest/tutorial/updates) 实现。

---

## 🔒 安全特性

### Electron安全配置
- ✅ **contextIsolation**: 启用上下文隔离
- ✅ **nodeIntegration**: 禁用Node.js集成
- ✅ **enableRemoteModule**: 禁用远程模块
- ✅ **preload脚本**: 安全的主进程-渲染进程通信

### 数据安全
- 🔐 所有用户数据本地存储
- 🛡️ 可选的云端数据储存
- 🔍 定期安全漏洞检查和修复

---

## 🤝 贡献指南

本仓库已完成历史使命并停止更新，不再接受新功能贡献。

### 贡献流程
1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

### 开发规范
- 遵循TypeScript严格模式
- 使用ESLint进行代码检查
- 编写单元测试覆盖新功能
- 更新相关文档

---

## 📄 许可证

本项目跟随上游，采用 GPL-3.0 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

## 🙏 致谢

- **理论基础**: 感谢Edmond提出的链式时延协议（CTDP）理论
- **技术支持**: 基于Electron、React、TypeScript构建
- **社区贡献**: 感谢所有贡献者和用户的反馈

---

## 📞 支持与反馈

如需持续维护与最新桌面端能力，请前往上游仓库：<https://github.com/KenXiao1/momentum>

---

<p align="center">
  <strong>让我们一起用科学的方法提升自控力！🚀</strong>
</p>
