import React, { useState, useEffect, useRef } from 'react';
import { History, X, RotateCcw, ChevronDown, ChevronUp, Clock, Trash2 } from 'lucide-react';
import { Operation, OperationType } from '../types/undoRedo';
import { operationHistoryManager } from '../utils/operationHistory';

interface OperationHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreToOperation?: (operation: Operation) => void;
  onHistoryChanged?: () => void;
  maxHeight?: string;
}

// 操作类型映射到显示文本和颜色
const operationTypeConfig: Record<OperationType, { label: string; color: string; bgColor: string }> = {
  CREATE_CHAIN: { label: '创建', color: 'text-green-600', bgColor: 'bg-green-100' },
  UPDATE_CHAIN: { label: '更新', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  DELETE_CHAIN: { label: '删除', color: 'text-red-600', bgColor: 'bg-red-100' },
  RESTORE_CHAIN: { label: '恢复', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  COMPLETE_SESSION: { label: '完成', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  INTERRUPT_SESSION: { label: '中断', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  CREATE_RSIP_NODE: { label: '创建节点', color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  UPDATE_RSIP_NODE: { label: '更新节点', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  DELETE_RSIP_NODE: { label: '删除节点', color: 'text-rose-600', bgColor: 'bg-rose-100' },
  IMPORT_DATA: { label: '导入', color: 'text-teal-600', bgColor: 'bg-teal-100' },
  SCHEDULE_SESSION: { label: '预约', color: 'text-amber-600', bgColor: 'bg-amber-100' },
};

// 格式化时间戳
const formatTimestamp = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  
  // 小于1分钟
  if (diff < 60000) {
    return '刚刚';
  }
  // 小于1小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`;
  }
  // 小于24小时
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`;
  }
  
  // 超过24小时显示具体日期
  const d = new Date(date);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const OperationHistoryPanel: React.FC<OperationHistoryPanelProps> = ({
  isOpen,
  onClose,
  onRestoreToOperation,
  onHistoryChanged,
  maxHeight = '400px',
}) => {
  const [history, setHistory] = useState<Operation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // 加载历史记录
  useEffect(() => {
    if (isOpen) {
      const loadedHistory = operationHistoryManager.getHistory();
      const loadedIndex = operationHistoryManager.getCurrentIndex();
      setHistory(loadedHistory);
      setCurrentIndex(loadedIndex);
    }
  }, [isOpen]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const toggleExpand = (operationId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(operationId)) {
        newSet.delete(operationId);
      } else {
        newSet.add(operationId);
      }
      return newSet;
    });
  };

  const handleRestore = (operation: Operation) => {
    if (!onRestoreToOperation) return;
    onRestoreToOperation(operation);
    onHistoryChanged?.();
    setCurrentIndex(operationHistoryManager.getCurrentIndex());
  };

  const handleClearHistory = () => {
    if (window.confirm('确定要清空所有操作历史吗？此操作不可恢复。')) {
      operationHistoryManager.clearStorage();
      setHistory([]);
      setCurrentIndex(-1);
      onHistoryChanged?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
      <div
        ref={panelRef}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <History className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                操作历史
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                共 {history.length} 条记录
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="清空历史"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* History List */}
        <div
          className="overflow-y-auto"
          style={{ maxHeight }}
        >
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <History className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400">
                暂无操作历史
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                您的操作将自动记录在这里
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {history.map((operation, index) => {
                const config = operationTypeConfig[operation.type];
                const isCurrent = index === currentIndex;
                const isExpanded = expandedItems.has(operation.id);
                const canRestore = index !== currentIndex && !!onRestoreToOperation;

                return (
                  <div
                    key={operation.id}
                    className={`group relative ${
                      isCurrent
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Type Badge */}
                        <div className={`flex-shrink-0 px-2 py-1 rounded-md text-xs font-medium ${config.bgColor} ${config.color}`}>
                          {config.label}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {operation.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Clock className="w-3 h-3" />
                              {formatTimestamp(operation.timestamp)}
                            </span>
                            {isCurrent && (
                              <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                                当前状态
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canRestore && (
                            <button
                              onClick={() => handleRestore(operation)}
                              className="p-1.5 text-primary-600 hover:bg-primary-100 dark:text-primary-400 dark:hover:bg-primary-900/30 rounded-md transition-colors"
                              title="恢复到此状态"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => toggleExpand(operation.id)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500 dark:text-gray-400 mb-1">操作ID</p>
                              <p className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">
                                {operation.id}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500 dark:text-gray-400 mb-1">实体ID</p>
                              <p className="font-mono text-xs text-gray-700 dark:text-gray-300">
                                {operation.entityIds.join(', ') || '无'}
                              </p>
                            </div>
                          </div>
                          {operation.isBatch && operation.subOperations && (
                            <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-md">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                包含 {operation.subOperations.length} 个子操作
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                当前位置: {currentIndex + 1} / {history.length}
              </span>
              <span>
                {currentIndex >= 0 ? `最后操作: ${formatTimestamp(history[currentIndex]?.timestamp)}` : '无操作'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OperationHistoryPanel;
