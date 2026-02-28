# 功能开发进度（实况修订）

更新日期: 2026-02-28

## 已完成

### 1. 小窗及置顶（主路径可用）
- [x] Focus 模式可切换 mini（同窗口画中画）
- [x] 置顶切换可用
- [x] 小窗状态持久化
- [x] 小窗功能按目标完成（采用低耦合方案，避免新增复杂 IPC）

### 2. Undo/Redo 基础设施
- [x] `undoRedo` 类型定义
- [x] `OperationHistoryManager`
- [x] `useUndoRedo` 快捷键
- [x] `App.tsx` 记录链条与 RSIP 变更历史
- [x] localStorage 持久化（`momentum_operation_history`）

## 部分完成

### 3. Undo/Redo 产品化
- [x] `UndoRedoButtons` 已接入页面
- [x] `OperationHistoryPanel` 已接入页面（安全模式）
- [x] undo/redo 已覆盖 CREATE/UPDATE/DELETE/RESTORE + RSIP 更新
- [x] 全局前端右键菜单已接入（撤回/前进/历史 + 快捷键提示）

## 未完成

### 4. RSIP 节点再编辑（已完成）
- [x] `RSIPNodeEditDialog` 已接入 `RSIPView`
- [x] 编辑字段已与当前 `RSIPNode` 结构对齐
- [x] 编辑进入统一操作历史

### 5. 小窗通道收敛
- [ ] `mini-timer:*` 与 `window:create-mini` 相关链路未闭环（主进程无处理）

## 说明
- 旧进度文档中提到的 `tests/...` 根目录测试文件在当前仓库不存在；现有测试主要位于 `src/**/__tests__`。
- 历史记录上限当前为 50（非 100）。
