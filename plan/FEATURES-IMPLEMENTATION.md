# 功能开发进度总结（按 2026-02-28 代码实况）

## 总体状态
- 小窗/置顶：已完成（同窗口画中画实现）
- RSIP 节点再编辑：已完成并接入主流程
- Undo/Redo：已完成生产可用化（链条 + RSIP 主流程）

## 各模块实况

### 1. 小窗与置顶
- 已实现：`window:enter-mini-mode` / `window:exit-mini-mode` / `window:toggle-always-on-top`
- 已实现：窗口状态持久化（normal/mini bounds + 置顶）
- 说明：旧 `mini-timer:*` 与 `window:create-mini` 通道属于遗留项，不影响当前已完成功能

### 2. RSIP 节点编辑
- 已实现：`RSIPView.tsx` 节点编辑入口
- 已实现：`RSIPNodeEditDialog.tsx` 字段对齐当前 `RSIPNode` 模型
- 已实现：编辑后通过 `onSaveNodes` 持久化并进入操作历史

### 3. Undo/Redo
- 已实现：`types/undoRedo.ts`、`utils/operationHistory.ts`、`hooks/useUndoRedo.ts`
- 已集成：`App.tsx` 记录 CREATE/UPDATE/DELETE/RESTORE + RSIP update 变更
- 已实现：键盘快捷键触发撤销重做
- 已接入：`UndoRedoButtons`、`OperationHistoryPanel` 渲染
- 已扩展：undo/redo 回放支持 `RESTORE_CHAIN`、`UPDATE_RSIP_NODE`

## 需要优先修复的问题
1. 清理未使用 mini 遗留文件/通道（非主流程）。
2. 如需“历史跳转恢复”，在 App 层提供受控恢复回调后启用。
3. 增加端到端回归测试覆盖关键路径。

## 参考文件
- `electron/main.js`
- `electron/preload.js`
- `src/components/FocusMode.tsx`
- `src/components/RSIPView.tsx`
- `src/components/RSIPNodeEditDialog.tsx`
- `src/App.tsx`
- `src/hooks/useUndoRedo.ts`
- `src/utils/operationHistory.ts`
