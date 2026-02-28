# AGENTS.MD - Momentum 项目架构指南

## 项目概述

**Momentum** 是一个基于链式时延协议（CTDP）理论的跨平台桌面应用，帮助用户建立强大的习惯链条。这是一个 Electron + React + TypeScript 项目。

### 核心技术栈
- **前端框架**: React 18 + TypeScript
- **桌面框架**: Electron 37
- **构建工具**: Vite
- **样式**: Tailwind CSS
- **状态管理**: React Hooks (useState, useEffect)
- **存储**: LocalStorage / Supabase (可选)
- **测试**: Jest / Vitest

---

## 项目结构

```
momentum/
├── electron/                      # Electron 主进程
│   ├── main.js                   # 主进程入口
│   ├── preload.js                # 预加载脚本 (CommonJS)
│   └── preload.mjs               # 预加载脚本 (ESM)
├── src/
│   ├── components/               # React 组件
│   │   ├── App.tsx              # 主应用组件
│   │   ├── Dashboard.tsx        # 仪表盘
│   │   ├── ChainEditor.tsx      # 链条编辑器
│   │   ├── ChainDetail.tsx      # 链条详情
│   │   ├── FocusMode.tsx        # 专注模式
│   │   ├── RSIPView.tsx         # RSIP 树视图
│   │   └── ...
│   ├── hooks/                   # 自定义 React Hooks
│   ├── services/                # 业务服务层
│   │   ├── DataStorageManager.ts
│   │   ├── LocalFileStorage.ts
│   │   └── RecycleBinService.ts
│   ├── utils/                   # 工具函数
│   │   ├── storage.ts          # 存储工具
│   │   ├── chainTree.ts        # 链条树操作
│   │   ├── time.ts             # 时间处理
│   │   └── notifications.ts    # 通知管理
│   ├── types/                   # TypeScript 类型定义
│   │   └── index.ts
│   └── lib/                     # 第三方库配置
│       └── supabase.ts
├── plan/                        # 功能计划文档 (新建)
├── public/                      # 静态资源
├── dist/                        # 构建输出
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## 核心概念

### 1. Chain（链条）
```typescript
interface Chain {
  id: string;
  name: string;
  description?: string;
  type: 'unit' | 'group';      // 单元任务 or 任务群
  duration: number;              // 任务时长（分钟）
  isDurationless?: boolean;     // 是否是无时长任务
  parentId?: string;            // 父级ID（用于任务群层级）
  
  // 统计信息
  currentStreak: number;        // 当前连续完成次数
  auxiliaryStreak: number;     // 辅助信号连续次数
  totalCompletions: number;      // 总完成次数
  totalFailures: number;         // 总失败次数
  auxiliaryFailures: number;     // 辅助信号失败次数
  
  // 时间戳
  createdAt: Date;
  lastCompletedAt?: Date;
  deletedAt?: Date;              // 软删除标记
}
```

### 2. RSIP Node（RSIP 树节点）
```typescript
interface RSIPNode {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  completed?: boolean;
  children?: RSIPNode[];
  parentId?: string;
  createdAt: Date;
  updatedAt?: Date;
}
```

### 3. 预约会话
```typescript
interface ScheduledSession {
  chainId: string;
  scheduledAt: Date;
  expiresAt: Date;
  auxiliarySignal: string;
}
```

### 4. 活跃会话（专注模式）
```typescript
interface ActiveSession {
  chainId: string;
  startedAt: Date;
  duration: number;
  isPaused: boolean;
  pausedAt?: Date;
  totalPausedTime: number;
}
```

---

## 核心功能模块

### 1. 数据存储系统

**Storage 接口** (`src/utils/storage.ts`):
```typescript
export interface Storage {
  // Chain 操作
  getChains(): Promise<Chain[]>;
  getActiveChains(): Promise<Chain[]>;
  saveChains(chains: Chain[]): Promise<void>;
  softDeleteChain(chainId: string): Promise<void>;
  restoreChain(chainId: string): Promise<void>;
  permanentlyDeleteChain(chainId: string): Promise<void>;
  
  // Session 操作
  getActiveSession(): Promise<ActiveSession | null>;
  saveActiveSession(session: ActiveSession | null): Promise<void>;
  getScheduledSessions(): Promise<ScheduledSession[]>;
  saveScheduledSessions(sessions: ScheduledSession[]): Promise<void>;
  
  // RSIP 操作
  getRSIPNodes(): Promise<RSIPNode[]>;
  saveRSIPNodes(nodes: RSIPNode[]): Promise<void>;
  getRSIPMeta(): Promise<RSIPMeta>;
  saveRSIPMeta(meta: RSIPMeta): Promise<void>;
}
```

**存储实现**:
- `localStorageUtils`: LocalStorage 实现
- `supabaseStorage`: Supabase 云端存储
- `DataStorageManager`: 存储管理器，自动选择存储方式

### 2. 通知系统

**NotificationManager** (`src/utils/notifications.ts`):
```typescript
class NotificationManager {
  // 预约提醒
  scheduleNotification(chainName: string, minutesBefore: number): void;
  
  // 任务完成通知
  notifyTaskCompleted(chainName: string, streak: number): void;
  
  // 任务失败通知
  notifyTaskFailed(chainName: string, reason: string): void;
  
  // 预约过期通知
  notifyScheduleExpired(chainName: string): void;
}
```

### 3. 链式树操作

**ChainTree** (`src/utils/chainTree.ts`):
```typescript
// 构建链条树
function buildChainTree(chains: Chain[]): ChainTreeNode[];

// 获取任务群中的下一个单元
function getNextUnitInGroup(groupNode: ChainTreeNode): Chain | null;

// 更新任务群完成次数
function updateGroupCompletions(chains: Chain[], groupId: string): Chain[];
```

### 4. 专注模式计时器

**Timer System**:
```typescript
// 正向计时器（无时长任务）
class ForwardTimerManager {
  startTimer(sessionId: string): void;
  stopTimer(sessionId: string): number;  // 返回经过的秒数
  clearTimer(sessionId: string): void;
}

// 预约计时器
class ScheduleTimerManager {
  addSchedule(chainId: string, chainName: string, expiresAt: Date): void;
  removeSchedule(chainId: string): void;
}
```

---

## 开发规范

### 1. 代码风格
- 使用 TypeScript 严格模式
- 组件使用函数式组件 + Hooks
- 使用 `const` 和 `let`，避免 `var`
- 使用单引号 `'`，不使用双引号

### 2. 文件命名
- 组件: `PascalCase.tsx` (e.g., `ChainEditor.tsx`)
- 工具函数: `camelCase.ts` (e.g., `storage.ts`)
- 类型定义: `camelCase.ts` 或 `PascalCase.ts`

### 3. 组件结构
```typescript
// 1. Imports
import React, { useState, useEffect } from 'react';
import { SomeComponent } from './SomeComponent';

// 2. Types (if not in separate file)
interface Props {
  // ...
}

// 3. Component
export const MyComponent: React.FC<Props> = ({ prop1, prop2 }) => {
  // State
  const [state, setState] = useState(...);
  
  // Effects
  useEffect(() => {
    // ...
  }, []);
  
  // Handlers
  const handleClick = () => {
    // ...
  };
  
  // Render
  return (
    <div>
      {/* ... */}
    </div>
  );
};
```

### 4. Git 提交规范
使用 Conventional Commits:
```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式调整
refactor: 重构代码
test: 添加测试
chore: 构建/工具调整
```

---

## 常用命令

```bash
# 开发模式
npm run electron:dev

# 构建 Web 版本
npm run build

# 构建 Electron 应用
npm run electron:build

# 仅构建 Windows 版本
npm run build:win

# 代码检查
npm run lint

# 运行测试
npm test
```

---

## 注意事项

### 1. 存储限制
- LocalStorage 有 5MB 限制
- 大数据量考虑使用 IndexedDB 或文件存储

### 2. Electron 安全
- 使用 `contextIsolation: true`
- 禁用 `nodeIntegration`
- 使用 preload 脚本进行 IPC 通信

### 3. 性能优化
- 使用 `React.memo` 避免不必要的重渲染
- 大数据列表使用虚拟滚动
- 图片资源使用懒加载

### 4. 跨平台兼容
- 路径处理使用 `path.join`
- 文件操作使用 Node.js 的 `fs` 模块
- 避免使用平台特定的 API

---

## 相关资源

- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [TypeScript 文档](https://www.typescriptlang.org/docs)

---

## 更新记录

- 2026-02-15: 创建 AGENTS.MD，总结项目架构和核心逻辑
