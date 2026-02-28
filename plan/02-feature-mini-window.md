# 功能需求 1：倒计时小窗及窗口置顶（实况版）

## 当前结论
当前功能已完成。实现方式采用“主窗口画中画模式（resize + move + alwaysOnTop）”，避免额外 IPC 复杂度。

## 目标功能状态
- [x] 小窗口倒计时显示（精简界面）
- [x] 窗口置顶功能（Always on Top）
- [x] 支持从小窗切换回大窗口
- [x] 小窗模式下显示任务名称和倒计时
- [x] 支持拖拽移动小窗口位置（通过系统窗口拖拽）
- [x] 大小窗流程与专注模式状态稳定联动

## 真实技术实现

### 1. Electron 主进程（已实现）
- `window:enter-mini-mode`: 主窗口切换到小尺寸（默认约 `240x180`）
- `window:exit-mini-mode`: 恢复到进入前主窗口尺寸与位置
- `window:toggle-always-on-top`: 切换置顶
- 使用 `window-state.json` 持久化 normal/mini bounds + 置顶状态

### 2. 渲染进程（已实现）
- `FocusMode.tsx` 内置 mini 渲染分支（`isMiniMode`）
- 小窗显示任务名、计时、进度、暂停/恢复、置顶
- 通过 `onMiniModeChange` 与 IPC 联动进/出 mini

### 3. 需要对齐的遗留项（未完成）
- `preload.js` 里暴露了 `window:create-mini` / `window:close-mini` / `window:set-mini-always-on-top` / `window:restore-from-mini` / `window:get-mini-status`，但主进程无对应 `ipcMain.handle`。
- `mini-timer:*` 通道在多个组件与 `electron/mini-timer.html` 中仍有引用，主进程无对应监听。
- `MiniTimerWindow.tsx` / `MiniTimerPage.tsx` / `MiniTimerWindowApp.tsx` 当前未接入主流程。

## 文件实况
- `electron/main.js`: 实际生效 mini 逻辑
- `src/components/FocusMode.tsx`: mini UI 与切换入口
- `electron/preload.js`: 含未闭环 mini API 暴露（待清理/补全）

## 下一步
1. 清理遗留未使用的 mini 通道与组件（不影响已完成功能）
2. 补 mini 模式端到端测试
