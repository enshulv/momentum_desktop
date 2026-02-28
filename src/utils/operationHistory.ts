import { Operation, OperationHistoryManagerConfig } from '../types/undoRedo';

export class OperationHistoryManager {
  private history: Operation[] = [];
  private currentIndex: number = -1;
  private config: OperationHistoryManagerConfig;

  constructor(config: OperationHistoryManagerConfig) {
    this.config = {
      maxHistorySize: 50,
      persistToStorage: true,
      storageKey: 'operation_history',
      ...config
    };

    if (this.config.persistToStorage) {
      this.loadFromStorage();
    }
  }

  // 添加操作到历史
  addOperation(operation: Operation): void {
    // 如果当前不在历史末尾，删除后面的历史
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // 添加新操作
    this.history.push(operation);
    this.currentIndex++;

    // 限制历史记录数量
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }

    // 持久化
    if (this.config.persistToStorage) {
      this.saveToStorage();
    }
  }

  // 撤销操作
  undo(): Operation | null {
    if (this.currentIndex < 0) {
      return null;
    }

    const operation = this.history[this.currentIndex];
    this.currentIndex--;

    if (this.config.persistToStorage) {
      this.saveToStorage();
    }

    return operation;
  }

  // 重做操作
  redo(): Operation | null {
    if (this.currentIndex >= this.history.length - 1) {
      return null;
    }

    this.currentIndex++;
    const operation = this.history[this.currentIndex];

    if (this.config.persistToStorage) {
      this.saveToStorage();
    }

    return operation;
  }

  // 获取历史记录
  getHistory(): Operation[] {
    return [...this.history];
  }

  // 获取当前索引
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  // 是否可以撤销
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  // 是否可以重做
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  // 清空历史
  clear(): void {
    this.history = [];
    this.currentIndex = -1;

    if (this.config.persistToStorage) {
      this.saveToStorage();
    }
  }

  // 持久化到存储
  private saveToStorage(): void {
    try {
      const data = {
        history: this.history,
        currentIndex: this.currentIndex
      };
      localStorage.setItem(this.config.storageKey!, JSON.stringify(data));
    } catch (error) {
      console.error('保存操作历史失败:', error);
    }
  }

  // 从存储加载
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.config.storageKey!);
      if (data) {
        const parsed = JSON.parse(data);
        this.history = parsed.history || [];
        this.currentIndex = parsed.currentIndex || -1;
      }
    } catch (error) {
      console.error('加载操作历史失败:', error);
    }
  }

  // 手动触发保存（用于外部调用）
  public forceSave(): void {
    if (this.config.persistToStorage) {
      this.saveToStorage();
    }
  }

  // 手动触发加载（用于外部调用）
  public forceLoad(): void {
    if (this.config.persistToStorage) {
      this.loadFromStorage();
    }
  }

  // 清除持久化数据
  public clearStorage(): void {
    try {
      localStorage.removeItem(this.config.storageKey!);
      this.clear();
    } catch (error) {
      console.error('清除操作历史存储失败:', error);
    }
  }
}

// 创建全局实例
export const operationHistoryManager = new OperationHistoryManager({
  maxHistorySize: 50,
  persistToStorage: true,
  storageKey: 'momentum_operation_history'
});
