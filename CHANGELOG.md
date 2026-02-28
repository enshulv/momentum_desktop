## [1.3.0](https://github.com/enshulv/momentum_desktop/compare/v1.2.6...v1.3.0) (2026-02-28)

### 🚀 新功能

* ship production-ready update UX and undo/rsip stability fixes ([55dd48a](https://github.com/enshulv/momentum_desktop/commit/55dd48aab387429e44a64a328879e8002337eb4e))

## [1.2.6](https://github.com/enshulv/momentum_desktop/compare/v1.2.5...v1.2.6) (2025-09-11)

### 🐛 修复

* reapply local changes after repo reset ([5c0a0e3](https://github.com/enshulv/momentum_desktop/commit/5c0a0e3f9f9e3ac50ce95ec1590641032beff4d5))

## [1.2.5](https://github.com/enshulv/momentum_desktop/compare/v1.2.4...v1.2.5) (2025-08-25)

### 🐛 修复

* 更新应用配置和组件功能，修复了编辑不保存神圣座位的bug，增加了自动更新功能 ([53227fe](https://github.com/enshulv/momentum_desktop/commit/53227fe158ee22c5bf6ccd1ffed6586a42bdd1bc))

## [1.2.4](https://github.com/enshulv/momentum_desktop/compare/v1.2.3...v1.2.4) (2025-08-20)

### 🐛 修复

* 增强规则管理和导入导出功能 ([2e188df](https://github.com/enshulv/momentum_desktop/commit/2e188dffff5e5e0d59c1fb78d8eb52e8e56442d8))

## [1.2.3](https://github.com/enshulv/momentum_desktop/compare/v1.2.2...v1.2.3) (2025-08-19)

### 🐛 修复

* trigger build ([dbbc3c5](https://github.com/enshulv/momentum_desktop/commit/dbbc3c55be823641bc0d4671f0d836b894a73338))

## [1.2.2](https://github.com/enshulv/momentum_desktop/compare/v1.2.1...v1.2.2) (2025-08-19)

### 🐛 修复

* 修复自动更新配置，确保生成latest.yml文件 ([1e7035c](https://github.com/enshulv/momentum_desktop/commit/1e7035ca7a99a4c0201112b62d09bcb1881c31b2))
* 解决合并冲突，修复自动更新配置 ([31d8afc](https://github.com/enshulv/momentum_desktop/commit/31d8afce62375aa5f05a7c14e4edea3c77f64dd4))

## [1.2.1](https://github.com/enshulv/momentum_desktop/compare/v1.2.0...v1.2.1) (2025-08-19)

### ⚠ BREAKING CHANGES

* **App.tsx**: 修复变量名错误，将 `updatedActiveChains` 更正为 `cleanActiveChains`
* **storage.ts**: 修复循环引用导致的序列化失败问题，添加数据清理逻辑
* - 添加循环引用检测和清理机制
* - 跳过不可序列化的属性（如window、document、element）
* - 增强错误处理和日志记录
* - 特殊处理Date对象的序列化

### 🐛 修复

* 修正了一些bug ([41a132c](https://github.com/enshulv/momentum_desktop/commit/41a132c13745e0fc3318fe86d7e745a65882cea5))

## [1.2.0](https://github.com/enshulv/momentum_desktop/compare/v1.1.0...v1.2.0) (2025-08-19)

### 🚀 新功能

* 新增预约提醒功能和对话框系统重构 ([5e560bf](https://github.com/enshulv/momentum_desktop/commit/5e560bf4dab8a88dd55e4b6fd76b3b47c417f67f))
>>>>>>> 358471a7ad8adc95077ac13ae5a41b0a190ba4e5

## [1.1.0](https://github.com/enshulv/momentum_desktop/compare/v1.0.0...v1.1.0) (2025-08-19)

### 🚀 新功能

* 重新触发版本发布系统 ([f3a3cf7](https://github.com/enshulv/momentum_desktop/commit/f3a3cf7257f9742f9bf10e83d3491b84809aec38))

# Changelog

All notable changes to this project will be documented in this file.
