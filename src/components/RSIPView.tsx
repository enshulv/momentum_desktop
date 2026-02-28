import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RSIPNode, RSIPTreeNode, RSIPMeta } from '../types';
import { buildRSIPTree, deleteNodeAndDescendants } from '../utils/rsipTree';
import { Plus, Trash2, ArrowLeft, Clock, AlertCircle, AlarmClock, Pencil } from 'lucide-react';
import { ConfirmationDialog } from './ConfirmationDialog';
import { RSIPNodeEditDialog } from './RSIPNodeEditDialog';

interface RSIPViewProps {
  nodes: RSIPNode[];
  meta: RSIPMeta;
  onBack: () => void;
  onSaveNodes: (nodes: RSIPNode[]) => void;
  onSaveMeta: (meta: RSIPMeta) => void;
}

// 优化的节点组件，使用React.memo避免不必要的重新渲染
const RSIPNodeComponent = React.memo<{ node: RSIPTreeNode; renderNode: (node: RSIPTreeNode) => JSX.Element }>(({ node, renderNode }) => (
  <div className="bento-card">
    {/* 左侧竖线与连线效果 */}
    <div className="relative">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-gray-200 to-transparent dark:from-slate-700"></div>
      <div className="pl-4">{renderNode(node)}</div>
    </div>
  </div>
), (prevProps, nextProps) => {
  // 自定义比较函数，检查节点属性和renderNode函数的变化
  return prevProps.node.id === nextProps.node.id && 
         prevProps.node.title === nextProps.node.title &&
         prevProps.node.rule === nextProps.node.rule &&
         prevProps.node.children.length === nextProps.node.children.length &&
         prevProps.renderNode === nextProps.renderNode;
});

export const RSIPView: React.FC<RSIPViewProps> = ({ nodes, meta, onBack, onSaveNodes, onSaveMeta }) => {
  const tree = useMemo<RSIPTreeNode[]>(() => buildRSIPTree(nodes), [nodes]);
  const [selectedParentId, setSelectedParentId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [rule, setRule] = useState('');
  
  // 添加确认对话框状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{
    nodeId: string;
    nodeTitle: string;
    deletedCount: number;
  } | null>(null);
  const [editingNode, setEditingNode] = useState<RSIPNode | null>(null);

  const canAddToday = useMemo(() => {
    if (meta.allowMultiplePerDay) return true;
    if (!meta.lastAddedAt) return true;
    const last = new Date(meta.lastAddedAt);
    const now = new Date();
    return last.toDateString() !== now.toDateString();
  }, [meta.allowMultiplePerDay, meta.lastAddedAt]);

  const [createUseTimer, setCreateUseTimer] = useState<boolean>(false);
  const [createTimerMinutes, setCreateTimerMinutes] = useState<number>(15);
  // 新增定时相关状态
  const [createUseScheduledTimer, setCreateUseScheduledTimer] = useState<boolean>(false);
  const [createScheduledHour, setCreateScheduledHour] = useState<number>(9);
  const [createScheduledMinute, setCreateScheduledMinute] = useState<number>(0);

  // 修改handleAdd函数 - 使用useCallback优化
  const handleAdd = React.useCallback(async () => {
    if (!canAddToday) return;
    if (!title.trim() || !rule.trim()) return;
    const newNode: RSIPNode = {
      id: crypto.randomUUID(),
      parentId: selectedParentId || undefined,
      title: title.trim(),
      rule: rule.trim(),
      sortOrder: Math.floor(Date.now() / 1000),
      createdAt: new Date(),
      useTimer: createUseTimer,
      timerMinutes: createUseTimer ? createTimerMinutes : undefined,
      useScheduledTimer: createUseScheduledTimer,
      scheduledHour: createUseScheduledTimer ? createScheduledHour : undefined,
      scheduledMinute: createUseScheduledTimer ? createScheduledMinute : undefined,
    };
    const newNodes = [...nodes, newNode];
    // 异步保存，避免阻塞UI
    onSaveNodes(newNodes);
    onSaveMeta({ ...meta, lastAddedAt: new Date() });
    setTitle('');
    setRule('');
    setSelectedParentId(undefined);
    setCreateUseTimer(false);
    setCreateTimerMinutes(15);
    setCreateUseScheduledTimer(false);
    setCreateScheduledHour(9);
    setCreateScheduledMinute(0);
  }, [canAddToday, title, rule, selectedParentId, nodes, createUseTimer, createTimerMinutes, createUseScheduledTimer, createScheduledHour, createScheduledMinute, onSaveNodes, meta, onSaveMeta]);


  const [now, setNow] = React.useState(new Date());
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({}); // nodeId -> endsAt ms

  useEffect(() => {
    const checkTimers = () => {
      const currentTime = Date.now();
      
      // 检查是否有过期的计时器
      Object.entries(activeTimers).forEach(([id, endsAt]) => {
        if (currentTime >= endsAt) {
          // notify once and clear
          setActiveTimers(prev => {
            const copy = { ...prev } as Record<string, number>;
            delete copy[id];
            return copy;
          });
          try {
            if ('Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification('计时完成', { body: 'RSIP 定式计时已结束' });
              } else if (Notification.permission !== 'denied') {
                Notification.requestPermission();
              }
            }
           } catch {
             // ignore
           }
        }
      });
      
      // 只在有活动计时器时才更新now状态，减少不必要的重新渲染
      if (Object.keys(activeTimers).length > 0) {
        setNow(currentTime);
      }
    };
    
    const t = setInterval(checkTimers, 1000);
    return () => clearInterval(t);
  }, [activeTimers]);

  const formatRemaining = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleFailure = React.useCallback(async (nodeId: string) => {
    // 直接从nodes数组中查找节点，避免重新构建树
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // 先计算要删除的节点数量用于确认对话框
    const originalLength = nodes.length;
    const newNodes = deleteNodeAndDescendants(nodes, nodeId);
    const deletedCount = originalLength - newNodes.length - 1; // 减1是因为不包括当前节点
    
    // 显示内置确认对话框而不是原生confirm
    setShowDeleteConfirm({
      nodeId,
      nodeTitle: node.title,
      deletedCount
    });
  }, [nodes]);
  
  // 处理确认删除
  const handleConfirmDelete = React.useCallback(async () => {
    if (!showDeleteConfirm) return;
    
    const newNodes = deleteNodeAndDescendants(nodes, showDeleteConfirm.nodeId);
    onSaveNodes(newNodes);
    
    // 关闭确认对话框
    setShowDeleteConfirm(null);
    
    // 清理表单状态，确保编辑功能正常
    setTitle('');
    setRule('');
    setSelectedParentId(undefined);
  }, [showDeleteConfirm, nodes, onSaveNodes]);

  const handleOpenEdit = useCallback((node: RSIPNode) => {
    setEditingNode(node);
  }, []);

  const handleSaveEdit = useCallback((updatedNode: RSIPNode) => {
    const updatedNodes = nodes.map(node =>
      node.id === updatedNode.id
        ? { ...updatedNode, sortOrder: node.sortOrder, createdAt: node.createdAt, parentId: node.parentId }
        : node
    );
    onSaveNodes(updatedNodes);
    setEditingNode(null);
  }, [nodes, onSaveNodes]);

  // 添加定时相关状态
  const [scheduledTimers, setScheduledTimers] = useState<Record<string, { scheduledAt: Date; hour: number; minute: number }>>({}); // nodeId -> scheduled info
  const [showTimeSelector, setShowTimeSelector] = useState<Record<string, boolean>>({}); // nodeId -> show selector
  const [tempScheduleTime, setTempScheduleTime] = useState<Record<string, { hour: number; minute: number }>>({}); // nodeId -> temp time

  // 添加点击外部区域关闭浮窗的功能
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 检查是否有任何浮窗处于显示状态
      const hasOpenSelector = Object.values(showTimeSelector).some(isOpen => isOpen);
      if (!hasOpenSelector) return;

      // 检查点击是否在浮窗内部
      const target = event.target as Element;
      const isClickInsideSelector = target.closest('.time-selector-popup');
      const isClickOnTriggerButton = target.closest('[data-time-selector-trigger]');
      
      // 如果点击在浮窗外部且不是触发按钮，则关闭所有浮窗
      if (!isClickInsideSelector && !isClickOnTriggerButton) {
        setShowTimeSelector({});
      }
    };

    // 只在有浮窗显示时添加事件监听器
    const hasOpenSelector = Object.values(showTimeSelector).some(isOpen => isOpen);
    if (hasOpenSelector) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showTimeSelector]);

  // 智能定位浮窗的函数
  const getPopupPosition = useCallback((nodeId: string) => {
    const triggerElement = document.querySelector(`[data-time-selector-trigger][data-node-id="${nodeId}"]`);
    if (!triggerElement) return 'bottom';
    
    const rect = triggerElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const popupHeight = 200; // 估算浮窗高度
    
    // 如果下方空间不足，显示在上方
    if (rect.bottom + popupHeight > viewportHeight && rect.top > popupHeight) {
      return 'top';
    }
    return 'bottom';
  }, []);
  
  // 移除了isInDisabledPeriod函数，现在直接在组件内部计算时间判定
  
  // 处理定时设置 - 使用useCallback优化
  const handleScheduleTimer = React.useCallback(async (nodeId: string, hour: number, minute: number) => {
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hour, minute, 0, 0);
    
    // 如果设定时间已过，则设为明天
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    setScheduledTimers(prev => ({
      ...prev,
      [nodeId]: { scheduledAt: scheduledTime, hour, minute }
    }));
    
    // 更新节点的定时信息和lastScheduledAt
    const updatedNodes = nodes.map(node => 
      node.id === nodeId ? { 
        ...node, 
        scheduledHour: hour,
        scheduledMinute: minute,
        lastScheduledAt: now 
      } : node
    );
    onSaveNodes(updatedNodes);
    
    // 关闭时间选择器和清理临时状态
    setShowTimeSelector(prev => ({ ...prev, [nodeId]: false }));
    setTempScheduleTime(prev => {
      const updated = { ...prev };
      delete updated[nodeId];
      return updated;
    });
  }, [nodes, onSaveNodes]);

  // 测试函数：手动触发定时检查
  const testScheduledTimer = useCallback((nodeId: string, testHour: number, testMinute: number) => {
    console.log('🧪 测试定时功能 - 节点ID:', nodeId);
    console.log('🧪 测试时间:', `${testHour.toString().padStart(2, '0')}:${testMinute.toString().padStart(2, '0')}`);
    
    // 模拟定时到达
    const now = new Date();
    const testTime = new Date();
    testTime.setHours(testHour, testMinute, 0, 0);
    
    console.log('🧪 当前时间:', now.toLocaleTimeString());
    console.log('🧪 测试时间:', testTime.toLocaleTimeString());
    
    // 查找节点
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      console.error('❌ 未找到节点:', nodeId);
      return;
    }
    
    if (!node.useScheduledTimer) {
      console.error('❌ 节点未启用定时功能');
      return;
    }
    
    console.log('✅ 节点信息:', {
      title: node.title,
      useScheduledTimer: node.useScheduledTimer,
      scheduledHour: node.scheduledHour,
      scheduledMinute: node.scheduledMinute,
      useTimer: node.useTimer,
      timerMinutes: node.timerMinutes
    });
    
    // 模拟定时触发
    if (node.useTimer && node.timerMinutes) {
      const endTime = Date.now() + node.timerMinutes * 60000;
      setActiveTimers(prev => ({ ...prev, [nodeId]: endTime }));
      console.log('✅ 已启动计时器，时长:', node.timerMinutes, '分钟');
      
      // 发送通知
      try {
        if (Notification.permission === 'granted') {
          const timerMinutes = node.timerMinutes || 15;
          new Notification('定时到达', {
            body: `国策「${node.title}」\n规则：${node.rule}\n计时：${timerMinutes}分钟内完成\n\n定时已到，计时已自动开始！`,
            icon: '/app-icon.png',
            requireInteraction: true
          });
          console.log('✅ 已发送通知');
        } else {
          console.log('⚠️ 通知权限未授予');
        }
      } catch (error) {
        console.error('❌ 发送通知失败:', error);
      }
    } else {
      console.log('⚠️ 节点未启用计时功能，仅触发定时提醒');
      try {
        if (Notification.permission === 'granted') {
          new Notification('定时提醒', {
            body: `国策「${node.title}」\n规则：${node.rule}\n\n定时已到！`,
            icon: '/app-icon.png',
            requireInteraction: true
          });
          console.log('✅ 已发送定时提醒通知');
        }
      } catch (error) {
        console.error('❌ 发送通知失败:', error);
      }
    }
  }, [nodes]);

  // 测试函数：检查数据保存
  const testDataSaving = useCallback(() => {
    console.log('🧪 测试数据保存功能');
    console.log('📊 当前所有节点数据:');
    nodes.forEach((node, index) => {
      console.log(`节点 ${index + 1}:`, {
        id: node.id,
        title: node.title,
        useScheduledTimer: node.useScheduledTimer,
        scheduledHour: node.scheduledHour,
        scheduledMinute: node.scheduledMinute,
        lastScheduledAt: node.lastScheduledAt,
        useTimer: node.useTimer,
        timerMinutes: node.timerMinutes
      });
    });
    
    console.log('📊 当前定时器状态:');
    console.log('scheduledTimers:', scheduledTimers);
    console.log('activeTimers:', activeTimers);
    console.log('showTimeSelector:', showTimeSelector);
  }, [nodes, scheduledTimers, activeTimers, showTimeSelector]);

  // 自动清理已删除节点的相关状态
  useEffect(() => {
    // 创建一个当前所有有效节点 ID 的 Set，用于快速查找
    const currentNodeIds = new Set(nodes.map(n => n.id));

    // 定义一个通用的清理函数
    const cleanupState = (setStateFunc: React.Dispatch<React.SetStateAction<Record<string, number | { hour: number; minute: number } | boolean>>>) => {
      setStateFunc(prevState => {
        const newState = { ...prevState };
        let changed = false;
        for (const nodeId in newState) {
          if (!currentNodeIds.has(nodeId)) {
            delete newState[nodeId];
            changed = true;
          }
        }
        // 只有在状态确实发生变化时才返回新对象，避免不必要的重新渲染
        return changed ? newState : prevState;
      });
    };

    // 清理所有相关的状态
    cleanupState(setActiveTimers);
    cleanupState(setScheduledTimers);
    cleanupState(setShowTimeSelector);
    cleanupState(setTempScheduleTime);
  }, [nodes]); // 这个 effect 只在 nodes prop 变化时运行

  // 将测试函数暴露到全局，方便在控制台调用
  React.useEffect(() => {
    (window as Record<string, unknown>).testRSIPScheduledTimer = testScheduledTimer;
    (window as Record<string, unknown>).testRSIPDataSaving = testDataSaving;
  }, [nodes, scheduledTimers, activeTimers, showTimeSelector, testDataSaving, testScheduledTimer]);
  

  
  // 检查定时是否到达
  useEffect(() => {
    const checkScheduledTimers = () => {
      const now = new Date();
      // 创建节点映射以提高查找效率
      const nodeMap = new Map(nodes.map(node => [node.id, node]));
      
      Object.entries(scheduledTimers).forEach(([nodeId, timerInfo]) => {
          if (now >= timerInfo.scheduledAt && !activeTimers[nodeId]) {
            // 定时到达
            const node = nodeMap.get(nodeId);
            if (node) {
              // 清除定时
              setScheduledTimers(prev => {
                const updated = { ...prev };
                delete updated[nodeId];
                return updated;
              });
              
              if (node.useTimer) {
                // 如果启用了计时，自动开始计时
                setActiveTimers(prev => ({
                  ...prev,
                  [nodeId]: Date.now() + (node.timerMinutes || 15) * 60000
                }));
                
                // 通知用户计时已开始
                try {
                  if ('Notification' in window && Notification.permission === 'granted') {
                    const timerMinutes = node.timerMinutes || 15;
                    new Notification('定时到达', { 
                      body: `国策「${node.title}」\n规则：${node.rule}\n计时：${timerMinutes}分钟内完成\n\n定时已到，计时已自动开始！`,
                      icon: '/app-icon.png',
                      requireInteraction: true
                    });
                  }
                } catch {
                  // ignore
                }
              } else {
                // 如果只启用了定时，仅发送提醒通知
                try {
                  if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('定时提醒', { 
                      body: `国策「${node.title}」\n规则：${node.rule}\n\n定时已到！`,
                      icon: '/app-icon.png',
                      requireInteraction: true
                    });
                  }
                } catch {
                  // ignore
                }
              }
            }
          }
        });
      };
    
    const interval = setInterval(checkScheduledTimers, 1000);
    return () => clearInterval(interval);
  }, [scheduledTimers, activeTimers, nodes]);
  
  // 使用useCallback稳定化renderNode函数，避免陈旧闭包问题
  const renderNode = React.useCallback((node: RSIPTreeNode) => {
    const hasScheduledTimer = scheduledTimers[node.id];
    const showSelector = showTimeSelector[node.id];
    
    return (
      <div className="border border-gray-200 dark:border-slate-700 rounded-2xl p-4 bg-white/60 dark:bg-slate-800/60">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-lg font-bold font-chinese text-gray-900 dark:text-slate-100">{node.title}</h4>
            <p className="text-sm text-gray-600 dark:text-slate-400 font-chinese whitespace-pre-wrap">{node.rule}</p>
            

            
            {/* 计时和定时组合布局 */}
            {(node.useTimer || node.useScheduledTimer) && (
              <div className="mt-2">
                {/* 当计时和定时同时启用时，保持原来的同行布局 */}
                {node.useTimer && node.useScheduledTimer && (
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="inline-flex items-center text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-xl">
                        <Clock size={14} className="mr-1 flex-shrink-0" /> 计时 {node.timerMinutes} 分钟
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {/* 计时器控制按钮 */}
                      {activeTimers[node.id] ? (
                        <>
                          <span className="text-xs font-mono text-emerald-700 dark:text-emerald-300 flex-shrink-0">{formatRemaining(activeTimers[node.id] - now)}</span>
                          <button
                            onClick={() => setActiveTimers(prev => { const c = { ...prev }; delete c[node.id]; return c; })}
                            className="px-2 py-1 text-xs rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/40 dark:text-emerald-300 flex-shrink-0"
                          >
                            完成
                          </button>
                          <button
                            onClick={() => {
                              handleFailure(node.id).catch(console.error);
                            }}
                            className="px-2 py-1 text-xs rounded-lg bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/40 dark:text-red-300 flex-shrink-0"
                          >
                            判定失败
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setActiveTimers(prev => ({ ...prev, [node.id]: Date.now() + (node.timerMinutes || 15) * 60000 }))}
                          className="px-2 py-1 text-xs rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/40 dark:text-emerald-300 flex-shrink-0"
                        >
                          开始计时
                        </button>
                      )}
                      
                      {/* 定时标签组 - 与计时在同一行，最右侧对齐 */}
                      <div className="relative flex items-center space-x-2">
                        <div className="inline-flex items-center text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-xl">
                          <AlarmClock size={14} className="mr-1 flex-shrink-0" /> 定时 {node.scheduledHour?.toString().padStart(2, '0')}:{node.scheduledMinute?.toString().padStart(2, '0')}
                        </div>
                        
                        <button
                          onClick={() => {
                            setTempScheduleTime(prev => ({
                              ...prev,
                              [node.id]: { hour: node.scheduledHour || 9, minute: node.scheduledMinute || 0 }
                            }));
                            setShowTimeSelector(prev => ({ ...prev, [node.id]: true }));
                          }}
                          className="px-2 py-1 text-xs rounded-lg flex-shrink-0 bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:hover:bg-blue-900/40 dark:text-blue-300"
                          title="设置定时"
                          data-time-selector-trigger
                          data-node-id={node.id}
                        >
                          定时调整
                        </button>
                    
                        {/* 浮窗 - 智能定位，根据空间显示在上方或下方 */}
                        {showSelector && (() => {
                          const position = getPopupPosition(node.id);
                          const positionClasses = position === 'top' 
                            ? 'bottom-full right-0 mb-2' 
                            : 'top-full right-0 mt-2';
                          return (
                            <div className={`time-selector-popup absolute ${positionClasses} z-50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-gray-200 dark:border-slate-600 rounded-2xl p-4 shadow-lg min-w-[180px]`}>
                              <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">定时时间</label>
                                <input
                                  type="time"
                                  value={`${(tempScheduleTime[node.id]?.hour || 9).toString().padStart(2, '0')}:${(tempScheduleTime[node.id]?.minute || 0).toString().padStart(2, '0')}`}
                                  onChange={(e) => {
                                    const [hour, minute] = e.target.value.split(':').map(Number);
                                    setTempScheduleTime(prev => ({
                                      ...prev,
                                      [node.id]: { hour, minute }
                                    }));
                                  }}
                                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-300 font-chinese [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-clear-button]:hidden"
                                  style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => {
                                    const time = tempScheduleTime[node.id] || { hour: 9, minute: 0 };
                                    handleScheduleTimer(node.id, time.hour, time.minute).catch(console.error);
                                  }}
                                  className="px-3 py-2 text-sm rounded-xl transition-colors duration-200 bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:hover:bg-blue-900/40 dark:text-blue-300"
                                >
                                  确定
                                </button>
                                <button
                                  onClick={() => setShowTimeSelector(prev => ({ ...prev, [node.id]: false }))}
                                  className="px-3 py-2 text-sm rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-900/30 dark:hover:bg-gray-900/40 dark:text-gray-300 transition-colors duration-200"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 只启用计时时的布局 */}
                {node.useTimer && !node.useScheduledTimer && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="inline-flex items-center text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-xl">
                        <Clock size={14} className="mr-1 flex-shrink-0" /> 计时 {node.timerMinutes} 分钟
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {/* 计时器控制按钮 */}
                      {activeTimers[node.id] ? (
                        <>
                          <span className="text-xs font-mono text-emerald-700 dark:text-emerald-300 flex-shrink-0">{formatRemaining(activeTimers[node.id] - now)}</span>
                          <button
                            onClick={() => setActiveTimers(prev => { const c = { ...prev }; delete c[node.id]; return c; })}
                            className="px-2 py-1 text-xs rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/40 dark:text-emerald-300 flex-shrink-0"
                          >
                            完成
                          </button>
                          <button
                            onClick={() => {
                              handleFailure(node.id).catch(console.error);
                            }}
                            className="px-2 py-1 text-xs rounded-lg bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/40 dark:text-red-300 flex-shrink-0"
                          >
                            判定失败
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setActiveTimers(prev => ({ ...prev, [node.id]: Date.now() + (node.timerMinutes || 15) * 60000 }))}
                          className="px-2 py-1 text-xs rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/40 dark:text-emerald-300 flex-shrink-0"
                        >
                          开始计时
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                {/* 只启用定时时的布局 - 占据原计时位置 */}
                {!node.useTimer && node.useScheduledTimer && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="inline-flex items-center text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-xl">
                        <AlarmClock size={14} className="mr-1 flex-shrink-0" /> 定时 {node.scheduledHour?.toString().padStart(2, '0')}:{node.scheduledMinute?.toString().padStart(2, '0')}
                      </div>
                    </div>
                    
                    <div className="relative flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setTempScheduleTime(prev => ({
                            ...prev,
                            [node.id]: { hour: node.scheduledHour || 9, minute: node.scheduledMinute || 0 }
                          }));
                          setShowTimeSelector(prev => ({ ...prev, [node.id]: true }));
                        }}
                        className="px-2 py-1 text-xs rounded-lg flex-shrink-0 bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:hover:bg-blue-900/40 dark:text-blue-300"
                        title="设置定时"
                        data-time-selector-trigger
                        data-node-id={node.id}
                      >
                        定时调整
                      </button>
                  
                      {/* 浮窗 - 智能定位，根据空间显示在上方或下方 */}
                      {showSelector && (() => {
                        const position = getPopupPosition(node.id);
                        const positionClasses = position === 'top' 
                          ? 'bottom-full right-0 mb-2' 
                          : 'top-full right-0 mt-2';
                        return (
                          <div className={`time-selector-popup absolute ${positionClasses} z-50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-gray-200 dark:border-slate-600 rounded-2xl p-4 shadow-lg min-w-[180px]`}>
                            <div className="mb-3">
                              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">定时时间</label>
                              <input
                                type="time"
                                value={`${(tempScheduleTime[node.id]?.hour || 9).toString().padStart(2, '0')}:${(tempScheduleTime[node.id]?.minute || 0).toString().padStart(2, '0')}`}
                                onChange={(e) => {
                                  const [hour, minute] = e.target.value.split(':').map(Number);
                                  setTempScheduleTime(prev => ({
                                    ...prev,
                                    [node.id]: { hour, minute }
                                  }));
                                }}
                                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-300 font-chinese [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-clear-button]:hidden"
                                style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => {
                                  const time = tempScheduleTime[node.id] || { hour: 9, minute: 0 };
                                  handleScheduleTimer(node.id, time.hour, time.minute).catch(console.error);
                                }}
                                className="px-3 py-2 text-sm rounded-xl transition-colors duration-200 bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:hover:bg-blue-900/40 dark:text-blue-300"
                              >
                                确定
                              </button>
                              <button
                                onClick={() => setShowTimeSelector(prev => ({ ...prev, [node.id]: false }))}
                                className="px-3 py-2 text-sm rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-900/30 dark:hover:bg-gray-900/40 dark:text-gray-300 transition-colors duration-200"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleOpenEdit(node)}
              className="p-2 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20"
              title="编辑节点"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => {
                handleFailure(node.id).catch(console.error);
              }}
              className="p-2 text-red-500 hover:text-red-600 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
              title="判定失败（删除此节点及其所有子节点）"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {node.children.length > 0 && (
          <div className="mt-3 pl-4 border-l-2 border-dashed border-gray-200 dark:border-slate-700 space-y-3">
            {node.children.map((child, index) => (
              <div key={`${child.id}-${index}`}>
                {renderNode(child)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [
    // renderNode函数内部使用到的所有来自RSIPView作用域的依赖项
    scheduledTimers,
    showTimeSelector,
    activeTimers,
    now,
    handleScheduleTimer,
    handleFailure,
    handleOpenEdit,
    tempScheduleTime,
    setActiveTimers,
    setScheduledTimers,
    setShowTimeSelector,
    setTempScheduleTime,
    getPopupPosition
  ]); // useCallback依赖数组

  const flatForSelect = React.useCallback((arr: RSIPTreeNode[]): RSIPTreeNode[] => {
    const res: RSIPTreeNode[] = [];
    const seenIds = new Set<string>();
    const walk = (n: RSIPTreeNode) => {
      if (!seenIds.has(n.id)) {
        seenIds.add(n.id);
        res.push(n);
      }
      n.children.forEach(walk);
    };
    arr.forEach(walk);
    return res;
  }, []);

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <button onClick={onBack} className="p-3 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded-2xl hover:bg-white/60 dark:hover:bg-slate-800/60">
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold font-chinese text-gray-900 dark:text-slate-100">国策树 · RSIP</h1>
              <p className="text-xs font-mono text-gray-600 dark:text-slate-400 tracking-wider uppercase">Recursive Stabilization Iteration Protocol</p>
            </div>
          </div>
          {/* Daily policy toggle */}
          <div className="flex items-center space-x-3">
            <span className="text-xs font-chinese text-gray-600 dark:text-slate-400">一天可多条</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!meta.allowMultiplePerDay}
                onChange={(e) => onSaveMeta({ ...meta, allowMultiplePerDay: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </header>

        {/* First-time empty state */}
        {nodes.length === 0 && (
          <div className="bento-card max-w-3xl mx-auto mb-8">
            <h2 className="text-2xl font-bold font-chinese text-gray-900 dark:text-slate-100 mb-3">开始你的第一条国策</h2>
            <p className="text-gray-700 dark:text-slate-300 leading-relaxed font-chinese">
              RSIP 强调通过「每天至多新增一个、失败即回溯」来稳定迭代你的生活定式。选择一个小而稳的起点，建立第一条国策吧。
            </p>
          </div>
        )}

        {/* Add form */}
        <div className="bento-card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">父节点（可空，表示新分支）</label>
              <select
                value={selectedParentId || ''}
                onChange={e => setSelectedParentId(e.target.value || undefined)}
                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-300 font-chinese"
              >
                <option value="">（无父节点，建立新根）</option>
                {flatForSelect(tree).map((n, index) => (
                  <option key={`${n.id}-${index}`} value={n.id}>{'— '.repeat(n.depth)}{n.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">国策标题</label>
              <input
                key="title-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：进门15分钟内开始洗澡"
                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-300 font-chinese"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">精准规则</label>
              <input
                key="rule-input"
                value={rule}
                onChange={e => setRule(e.target.value)}
                placeholder="例如：回家即启动15分钟计时，计时内进浴室"
                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-300 font-chinese"
              />
            </div>
          </div>
          {/* Timer settings */}
          <div className="mt-4 space-y-4">
            {/* 启用计时 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between bento-subtle px-4 py-3 rounded-2xl">
                <div className="flex items-center space-x-2">
                  <Clock size={16} className="text-emerald-600" />
                  <span className="text-sm font-chinese text-gray-700 dark:text-slate-300">启用计时</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createUseTimer}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCreateUseTimer(checked);
                      // 如果计时关闭，则定时也关闭
                      if (!checked) {
                        setCreateUseScheduledTimer(false);
                      }
                      e.target.blur(); // 移除焦点以避免蓝色边框残留
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              <div className={`${createUseTimer ? '' : 'opacity-60'}`}>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">计时分钟数</label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  disabled={!createUseTimer}
                  value={createTimerMinutes}
                  onChange={(e) => setCreateTimerMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-300 font-chinese"
                />
              </div>
            </div>
            
            {/* 启用定时 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between bento-subtle px-4 py-3 rounded-2xl">
                <div className="flex items-center space-x-2">
                  <AlarmClock size={16} className="text-blue-600" />
                  <span className="text-sm font-chinese text-gray-700 dark:text-slate-300">启用定时</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createUseScheduledTimer}
                    onChange={(e) => {
                      setCreateUseScheduledTimer(e.target.checked);
                      e.target.blur(); // 移除焦点以避免蓝色边框残留
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div className={`${createUseScheduledTimer ? '' : 'opacity-60'}`}>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">定时时间</label>
                <input
                  type="time"
                  value={`${createScheduledHour.toString().padStart(2, '0')}:${createScheduledMinute.toString().padStart(2, '0')}`}
                  onChange={(e) => {
                    const [hour, minute] = e.target.value.split(':').map(Number);
                    setCreateScheduledHour(hour);
                    setCreateScheduledMinute(minute);
                  }}
                  disabled={!createUseScheduledTimer}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-300 font-chinese [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-clear-button]:hidden"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm font-chinese text-gray-600 dark:text-slate-400">
              每天最多新增一个国策。{canAddToday ? '今日可新增。' : '今日已新增，明日继续。'}
            </div>
            <button
              onClick={() => {
                handleAdd().catch(console.error);
              }}
              disabled={!canAddToday || !title.trim() || !rule.trim()}
              className={`flex items-center space-x-2 px-6 py-3 rounded-2xl font-medium transition-all duration-300 shadow-lg ${(!canAddToday || !title.trim() || !rule.trim()) ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500' : 'gradient-primary text-white hover:shadow-xl hover:scale-105'}`}
            >
              <Plus size={18} />
              <span className="font-chinese">新增国策</span>
            </button>
          </div>
        </div>

        {/* Tree */}
        <div className="space-y-4">
          {tree.length === 0 ? (
            <div className="text-center text-gray-600 dark:text-slate-400 font-chinese">尚无国策，先从上方表单添加一个吧。</div>
          ) : (
            tree.map((n, index) => (
              <RSIPNodeComponent key={`${n.id}-${index}`} node={n} renderNode={renderNode} />
            ))
          )}
        </div>
      </div>
      
      {/* 删除确认对话框 */}
      <ConfirmationDialog
        isOpen={!!showDeleteConfirm}
        title="判定失败确认"
        message={showDeleteConfirm ? `将删除「${showDeleteConfirm.nodeTitle}」及其 ${showDeleteConfirm.deletedCount} 个子节点。确认回溯？` : ''}
        confirmText="确认回溯"
        cancelText="取消"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(null)}
      />
      <RSIPNodeEditDialog
        isOpen={!!editingNode}
        node={editingNode}
        onClose={() => setEditingNode(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
};


