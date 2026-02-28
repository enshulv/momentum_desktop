# 功能需求 2：国策树节点再编辑功能（实况版）

## 当前结论
该需求已落地并可用。编辑入口已接入 RSIP 主界面，且字段模型已与现有 `RSIPNode` 对齐。

## 目标功能状态
- [x] 允许编辑已确定的国策树节点
- [x] 编辑时保留历史记录（通过 `UPDATE_RSIP_NODE`）
- [x] 支持修改节点核心属性并持久化
- [x] 编辑后更新相关链式结构

## 当前代码现状

### 已有能力
- `RSIPView.tsx`：支持新增、删除、编辑节点，以及计时/定时配置。
- `RSIPNodeEditDialog.tsx`：已接入并支持编辑 `title/rule/useTimer/timerMinutes/useScheduledTimer/scheduledHour/scheduledMinute`。
- `App.tsx`：`onSaveNodes` 变更会记录 `UPDATE_RSIP_NODE` 历史并持久化。

## 后续优化建议
### 1. 审计级历史（可选）
- 若需要字段级审计，再扩展 `RSIPMeta` 或独立历史表。
### 2. 编辑测试（可选）
- 增加编辑弹窗提交流程的组件测试与回归用例。

## 验收标准（修订）
- [x] RSIP 节点可编辑 `title/rule/计时定时` 字段
- [x] 保存后树结构正确刷新并持久化
- [x] 编辑操作进入 Undo/Redo 历史
- [x] 字段与 `RSIPNode` 类型保持一致
