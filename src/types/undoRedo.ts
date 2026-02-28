// 操作类型定义
export type OperationType =
  | 'CREATE_CHAIN'
  | 'UPDATE_CHAIN'
  | 'DELETE_CHAIN'
  | 'RESTORE_CHAIN'
  | 'COMPLETE_SESSION'
  | 'INTERRUPT_SESSION'
  | 'CREATE_RSIP_NODE'
  | 'UPDATE_RSIP_NODE'
  | 'DELETE_RSIP_NODE'
  | 'IMPORT_DATA'
  | 'SCHEDULE_SESSION';

// 操作记录接口
export interface Operation {
  id: string;
  type: OperationType;
  timestamp: Date;
  description: string;

  // 操作前的状态（用于撤销）
  previousState: any;

  // 操作后的状态（用于重做）
  nextState: any;

  // 相关的实体ID
  entityIds: string[];

  // 是否是批量操作
  isBatch?: boolean;

  // 批量操作中的子操作
  subOperations?: Operation[];
}

// 操作历史管理器配置
export interface OperationHistoryManagerConfig {
  maxHistorySize: number;
  persistToStorage: boolean;
  storageKey?: string;
}
