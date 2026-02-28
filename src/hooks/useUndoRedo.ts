import { useEffect, useCallback, useState } from 'react';
import { operationHistoryManager } from '../utils/operationHistory';

export interface UseUndoRedoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export const useUndoRedo = (onUndo: () => void, onRedo: () => void): UseUndoRedoReturn => {
  // 使用状态来追踪撤销/重做能力，这样UI可以响应变化
  const [canUndoState, setCanUndoState] = useState(operationHistoryManager.canUndo());
  const [canRedoState, setCanRedoState] = useState(operationHistoryManager.canRedo());

  // 更新状态的辅助函数
  const updateUndoRedoState = useCallback(() => {
    setCanUndoState(operationHistoryManager.canUndo());
    setCanRedoState(operationHistoryManager.canRedo());
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ctrl/Cmd + Z - 撤销
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      if (operationHistoryManager.canUndo()) {
        onUndo();
        updateUndoRedoState();
      }
    }

    // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y - 重做
    if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
      event.preventDefault();
      if (operationHistoryManager.canRedo()) {
        onRedo();
        updateUndoRedoState();
      }
    }
  }, [onUndo, onRedo, updateUndoRedoState]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 暴露撤销/重做方法供UI调用
  const undo = useCallback(() => {
    if (operationHistoryManager.canUndo()) {
      onUndo();
      updateUndoRedoState();
    }
  }, [onUndo, updateUndoRedoState]);

  const redo = useCallback(() => {
    if (operationHistoryManager.canRedo()) {
      onRedo();
      updateUndoRedoState();
    }
  }, [onRedo, updateUndoRedoState]);

  return {
    canUndo: canUndoState,
    canRedo: canRedoState,
    undo,
    redo
  };
};
