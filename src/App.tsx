import { useState, useEffect } from 'react';
import { AppState, Chain, ScheduledSession, ActiveSession, CompletionHistory, RSIPNode, RSIPMeta } from './types';
import { Dashboard } from './components/Dashboard';
import { RSIPView } from './components/RSIPView';
import { AuthWrapper } from './components/AuthWrapper';
import { ChainEditor } from './components/ChainEditor';
import { FocusMode } from './components/FocusMode';
import { ChainDetail } from './components/ChainDetail';
import { GroupView } from './components/GroupView';
import { AuxiliaryJudgment } from './components/AuxiliaryJudgment';
import WindowControls from './components/WindowControls';
import { UpdateAnnouncementModal } from './components/UpdateAnnouncementModal';
import { DialogProvider, useDialog } from './components/DialogManager';
import { storage as localStorageUtils } from './utils/storage';
import { UserPreferences, userPreferences } from './utils/userPreferences';
import { AppContextMenu } from './components/AppContextMenu';
import OperationHistoryPanel from './components/OperationHistoryPanel';
import { useUndoRedo } from './hooks/useUndoRedo';
import { operationHistoryManager } from './utils/operationHistory';
import { Operation } from './types/undoRedo';

import { isSupabaseConfigured } from './lib/supabase';
import { isSessionExpired } from './utils/time';
import { buildChainTree, getNextUnitInGroup, updateGroupCompletions } from './utils/chainTree';
import { notificationManager } from './utils/notifications';
import { startGroupTimer, isGroupExpired, resetGroupProgress } from './utils/timeLimit';
import { forwardTimerManager } from './utils/forwardTimer';
import { scheduleTimerManager } from './utils/scheduleTimer';
import { initializeRuleSystem } from './utils/initializeRuleSystem';
import { runMigration } from './utils/migration';
import { dataStorageManager } from './services/DataStorageManager';
import './utils/quickFix'; // 自动运行快速修复
import './utils/debugRuleCreation'; // 调试工具
import './utils/emergencyFix'; // 紧急修复

import './utils/fixRuleIds'; // 修复规则ID
import './utils/directFix'; // 直接修复
import './utils/ultimateFix'; // 终极修复
import { UltimateFix } from './utils/ultimateFix';


function AppContent() {
  const dialog = useDialog();
  const VERSION_SEEN_KEY = 'momentum_seen_app_version';
  
  // ========== 所有 hooks 必须放在条件返回之前 ==========
  
  // 画中画模式状态
  const [isMiniMode, setIsMiniMode] = useState(false);
  
  // 主应用状态
  const [state, setState] = useState<AppState>({
    chains: [],
    scheduledSessions: [],
    activeSession: null,
    currentView: 'dashboard',
    editingChain: null,
    viewingChainId: null,
    completionHistory: [],
    rsipNodes: [],
    rsipMeta: {},
    taskTimeStats: [],
    exceptionRules: [],
    ruleUsageRecords: [],
  });

  const [showAuxiliaryJudgment, setShowAuxiliaryJudgment] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // 操作历史状态
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [showUpdateAnnouncement, setShowUpdateAnnouncement] = useState(false);

  // 更新操作历史状态
  const updateHistoryState = () => {
    setHistoryState({
      canUndo: operationHistoryManager.canUndo(),
      canRedo: operationHistoryManager.canRedo(),
    });
  };

  // 记录链条操作历史
  const recordChainOperation = (
    type: Operation['type'],
    previousState: unknown,
    nextState: unknown,
    entityId: string,
    description: string
  ) => {
    const operation: Operation = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date(),
      description,
      previousState,
      nextState,
      entityIds: [entityId],
    };
    operationHistoryManager.addOperation(operation);
    updateHistoryState();
  };

  // 处理撤销
  const handleUndo = () => {
    const operation = operationHistoryManager.undo();
    if (!operation) return;

    // 根据操作类型执行撤销逻辑
    switch (operation.type) {
      case 'CREATE_CHAIN':
        // 撤销创建：删除创建的链条
        if (operation.entityIds[0]) {
          const updatedChains = state.chains.filter(c => c.id !== operation.entityIds[0]);
          safelySaveChains(updatedChains);
          setState(prev => ({ ...prev, chains: updatedChains }));
        }
        break;
      case 'UPDATE_CHAIN':
        // 撤销更新：恢复到之前的状态
        if (operation.previousState) {
          const prevChain = operation.previousState as Chain;
          const updatedChains = state.chains.map(c => 
            c.id === prevChain.id ? prevChain : c
          );
          safelySaveChains(updatedChains);
          setState(prev => ({ ...prev, chains: updatedChains }));
        }
        break;
      case 'DELETE_CHAIN':
        // 撤销删除：恢复被删除的链条
        if (operation.entityIds[0]) {
          const deletedId = operation.entityIds[0];
          storage.restoreChain(deletedId).then(async () => {
            const refreshedActiveChains = await storage.getActiveChains();
            setState(prev => ({ ...prev, chains: refreshedActiveChains }));
          }).catch((error: unknown) => {
            console.error('撤销删除失败:', error);
          });
        }
        break;
      case 'RESTORE_CHAIN':
        // 撤销恢复：从活跃链条中移除
        if (operation.entityIds[0]) {
          const restoredId = operation.entityIds[0];
          storage.softDeleteChain(restoredId).then(async () => {
            const refreshedActiveChains = await storage.getActiveChains();
            setState(prev => ({ ...prev, chains: refreshedActiveChains }));
          }).catch((error: unknown) => {
            console.error('撤销恢复失败:', error);
          });
        }
        break;
      case 'UPDATE_RSIP_NODE':
        // 撤销节点变更：恢复到之前的 RSIP 节点集合
        if (operation.previousState) {
          const prevNodes = operation.previousState as RSIPNode[];
          setState(prev => ({ ...prev, rsipNodes: prevNodes }));
          storage.saveRSIPNodes(prevNodes).catch((error: unknown) => {
            console.error('撤销 RSIP 节点失败:', error);
          });
        }
        break;
    }
    updateHistoryState();
  };

  // 处理重做
  const handleRedo = () => {
    const operation = operationHistoryManager.redo();
    if (!operation) return;

    // 根据操作类型执行重做逻辑
    switch (operation.type) {
      case 'CREATE_CHAIN':
        // 重做创建：重新添加链条
        if (operation.nextState) {
          const newChain = operation.nextState as Chain;
          const updatedChains = [...state.chains, newChain];
          safelySaveChains(updatedChains);
          setState(prev => ({ ...prev, chains: updatedChains }));
        }
        break;
      case 'UPDATE_CHAIN':
        // 重做更新：重新应用更新
        if (operation.nextState) {
          const updatedChain = operation.nextState as Chain;
          const updatedChains = state.chains.map(c => 
            c.id === updatedChain.id ? updatedChain : c
          );
          safelySaveChains(updatedChains);
          setState(prev => ({ ...prev, chains: updatedChains }));
        }
        break;
      case 'DELETE_CHAIN':
        // 重做删除：重新删除链条
        if (operation.entityIds[0]) {
          const deleteId = operation.entityIds[0];
          storage.softDeleteChain(deleteId).then(async () => {
            const refreshedActiveChains = await storage.getActiveChains();
            setState(prev => ({ ...prev, chains: refreshedActiveChains }));
          }).catch((error: unknown) => {
            console.error('重做删除失败:', error);
          });
        }
        break;
      case 'RESTORE_CHAIN':
        // 重做恢复：重新添加链条
        if (operation.entityIds[0]) {
          const restoreId = operation.entityIds[0];
          storage.restoreChain(restoreId).then(async () => {
            const refreshedActiveChains = await storage.getActiveChains();
            setState(prev => ({ ...prev, chains: refreshedActiveChains }));
          }).catch((error: unknown) => {
            console.error('重做恢复失败:', error);
          });
        }
        break;
      case 'UPDATE_RSIP_NODE':
        // 重做节点变更：应用新的 RSIP 节点集合
        if (operation.nextState) {
          const nextNodes = operation.nextState as RSIPNode[];
          setState(prev => ({ ...prev, rsipNodes: nextNodes }));
          storage.saveRSIPNodes(nextNodes).catch((error: unknown) => {
            console.error('重做 RSIP 节点失败:', error);
          });
        }
        break;
    }
    updateHistoryState();
  };

  // 使用 useUndoRedo hook（提供键盘快捷键和按钮调用）
  const { undo, redo } = useUndoRedo(handleUndo, handleRedo);

  // Use data storage manager instead of direct storage selection
  const [storage, setStorage] = useState(localStorageUtils);

  useEffect(() => {
    updateHistoryState();
  }, []);

  useEffect(() => {
    const onHistoryShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setIsHistoryPanelOpen(true);
      }
    };
    window.addEventListener('keydown', onHistoryShortcut);
    return () => window.removeEventListener('keydown', onHistoryShortcut);
  }, []);

  useEffect(() => {
    const checkVersionAnnouncement = async () => {
      try {
        let currentVersion = '';
        if (window.electronAPI?.app?.getVersion) {
          currentVersion = await window.electronAPI.app.getVersion();
        }

        if (!currentVersion) return;

        setAppVersion(currentVersion);
        const seenVersion = localStorage.getItem(VERSION_SEEN_KEY);
        if (seenVersion !== currentVersion) {
          setShowUpdateAnnouncement(true);
        }
      } catch (error) {
        console.error('检查更新说明弹窗失败:', error);
      }
    };

    checkVersionAnnouncement();
  }, []);

  const getUpdateNotes = (): string[] => {
    // 当前版本未配置专门文案时，使用通用更新说明
    return [
      '小窗模式与置顶流程稳定性优化，专注流程切换更一致。',
      '新增全局右键菜单，集成撤回/前进/操作历史，并提供快捷键提示。',
      'RSIP 节点编辑已接入主流程，支持规则与计时配置直接修改。',
      '修复“删除后撤回但回收箱仍残留”的问题。'
    ];
  };

  const handleCloseUpdateAnnouncement = () => {
    if (appVersion) {
      localStorage.setItem(VERSION_SEEN_KEY, appVersion);
    }
    setShowUpdateAnnouncement(false);
  };
  
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 初始化数据存储管理器
        await dataStorageManager.initialize();
        const activeStorage = dataStorageManager.getStorage();
        setStorage(activeStorage);
        
        console.log('存储源确定:', dataStorageManager.getStorageMode());
        
        // 初始化规则系统
        const ruleResult = await initializeRuleSystem();
        if (ruleResult.success) {
          console.log('✅ 规则系统初始化成功');
        } else {
          console.error('❌ 规则系统初始化失败:', ruleResult.message);
        }

        // 运行迁移脚本
        runMigration();
        
        // 设置UltimateFix的dialogProvider
        const ultimateFix = UltimateFix.getInstance();
        ultimateFix.setDialogProvider(dialog);
        
        setIsInitialized(true);
      } catch (error) {
        console.error('应用初始化失败:', error);
        // 即使初始化失败，也要确保应用能够启动
        setStorage(localStorageUtils);
        setIsInitialized(true);
      }
    };

    initializeApp();
  }, []);

  const renderContent = () => {
    if (!isSupabaseConfigured) {
      // 没有 Supabase 配置时，直接渲染内容，不需要认证
      return renderCurrentView();
    }
    
    // 有 Supabase 配置时，使用认证包装
    return (
      <AuthWrapper>
        {renderCurrentView()}
      </AuthWrapper>
    );
  };

  const renderCurrentView = () => {
    // 如果还没有初始化完成，显示加载状态
    if (!isInitialized) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-[#161615] dark:via-black dark:to-[#161615] flex items-center justify-center relative overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-primary-500/5 dark:from-primary-500/5 dark:via-transparent dark:to-primary-500/5"></div>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 dark:bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary-500/5 dark:bg-primary-500/5 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
          
          <div className="relative z-10 text-center animate-fade-in">
            <div className="mb-12">
              <div className="w-20 h-20 rounded-3xl bg-primary-500/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-8 border border-primary-500/30 dark:bg-primary-500/20 dark:border-primary-500/30 shadow-2xl">
                <i className="fas fa-fire text-primary-500 text-3xl"></i>
              </div>
              <h1 className="text-4xl md:text-5xl font-light font-chinese text-gray-900 dark:text-white mb-4">
                Momentum
              </h1>
              <h2 className="text-xl font-chinese text-gray-600 dark:text-gray-300 mb-8">
                正在初始化应用...
              </h2>
            </div>
            
            {/* Loading Animation */}
            <div className="flex items-center justify-center space-x-2 mb-8">
              <div className="w-3 h-3 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            
            <p className="text-gray-500 dark:text-gray-400 font-mono text-sm tracking-wider">
              INITIALIZING SYSTEM COMPONENTS
            </p>
          </div>
        </div>
      );
    }

    switch (state.currentView) {
      case 'editor':
        return (
          <>
            <ChainEditor
              chain={state.editingChain || undefined}
              isEditing={!!state.editingChain}
              initialParentId={state.viewingChainId || undefined}
              onSave={handleSaveChain}
              onCancel={handleBackToDashboard}
            />
            {showAuxiliaryJudgment && (
              <AuxiliaryJudgment
                chain={state.chains.find(c => c.id === showAuxiliaryJudgment)!}
                onJudgmentFailure={() => handleAuxiliaryJudgmentFailure(showAuxiliaryJudgment!)}
                onJudgmentAllow={(exceptionRule) => handleAuxiliaryJudgmentAllow(showAuxiliaryJudgment, exceptionRule)}
                onCancel={() => setShowAuxiliaryJudgment(null)}
              />
            )}
          </>
        );

      case 'focus': {
        const activeChain = state.chains.find(c => c.id === state.activeSession?.chainId);
        if (!state.activeSession || !activeChain) {
          handleBackToDashboard();
          return null;
        }
        return (
          <>
            <FocusMode
              session={state.activeSession}
              chain={activeChain}
              storage={storage}
              onComplete={handleCompleteSession}
              onInterrupt={handleInterruptSession}
              onPause={handlePauseSession}
              onResume={handleResumeSession}
              isMiniMode={isMiniMode}
              onMiniModeChange={setIsMiniMode}
            />
            {showAuxiliaryJudgment && (
              <AuxiliaryJudgment
                chain={state.chains.find(c => c.id === showAuxiliaryJudgment)!}
                onJudgmentFailure={() => handleAuxiliaryJudgmentFailure(showAuxiliaryJudgment!)}
                onJudgmentAllow={(exceptionRule) => handleAuxiliaryJudgmentAllow(showAuxiliaryJudgment, exceptionRule)}
                onCancel={() => setShowAuxiliaryJudgment(null)}
              />
            )}
          </>
        );
      }

      case 'detail': {
        const viewingChain = state.chains.find(c => c.id === state.viewingChainId);
        if (!viewingChain) {
          handleBackToDashboard();
          return null;
        }
        return (
          <>
            <ChainDetail
              chain={viewingChain}
              history={state.completionHistory}
              onBack={handleBackToDashboard}
              onEdit={() => handleEditChain(viewingChain.id)}
              onDelete={() => handleDeleteChain(viewingChain.id)}
            />
            {showAuxiliaryJudgment && (
              <AuxiliaryJudgment
                chain={state.chains.find(c => c.id === showAuxiliaryJudgment)!}
                onJudgmentFailure={() => handleAuxiliaryJudgmentFailure(showAuxiliaryJudgment!)}
                onJudgmentAllow={(exceptionRule) => handleAuxiliaryJudgmentAllow(showAuxiliaryJudgment, exceptionRule)}
                onCancel={() => setShowAuxiliaryJudgment(null)}
              />
            )}
          </>
        );
      }

      case 'group': {
        const viewingGroup = state.chains.find(c => c.id === state.viewingChainId);
        if (!viewingGroup) {
          handleBackToDashboard();
          return null;
        }
        
        // 构建任务树并找到对应的群组节点
        const chainTree = buildChainTree(state.chains);
        const groupNode = chainTree.find(node => node.id === state.viewingChainId);
        if (!groupNode) {
          handleBackToDashboard();
          return null;
        }
        
        return (
          <>
            <GroupView
              group={groupNode}
              scheduledSessions={state.scheduledSessions}
              availableUnits={chainTree}
              onBack={handleBackToDashboard}
              onStartChain={handleStartChain}
              onScheduleChain={handleScheduleChain}
              onEditChain={(chainId) => handleEditChain(chainId)}
              onDeleteChain={handleDeleteChain}
              onAddUnit={() => handleCreateChain(state.viewingChainId!)}
              onImportUnits={handleImportUnits}
            />
            {showAuxiliaryJudgment && (
              <AuxiliaryJudgment
                chain={state.chains.find(c => c.id === showAuxiliaryJudgment)!}
                onJudgmentFailure={() => handleAuxiliaryJudgmentFailure(showAuxiliaryJudgment!)}
                onJudgmentAllow={(exceptionRule) => handleAuxiliaryJudgmentAllow(showAuxiliaryJudgment, exceptionRule)}
                onCancel={() => setShowAuxiliaryJudgment(null)}
              />
            )}
          </>
        );
      }

      case 'rsip':
        return (
          <RSIPView
            nodes={state.rsipNodes}
            meta={state.rsipMeta}
            onBack={handleBackToDashboard}
            onSaveNodes={async (nodes) => {
              // 记录操作历史（如果节点发生变化）
              const hasChanges = JSON.stringify(nodes) !== JSON.stringify(state.rsipNodes);
              if (hasChanges) {
                recordChainOperation(
                  'UPDATE_RSIP_NODE',
                  state.rsipNodes,
                  nodes,
                  'rsip_nodes',
                  '更新RSIP节点'
                );
              }
              
              // 立即更新UI状态，避免阻塞
              setState(prev => ({ ...prev, rsipNodes: nodes }));
              // 异步保存到存储，不阻塞UI
              try {
                await storage.saveRSIPNodes(nodes);
              } catch (error) {
                console.error('保存RSIP节点失败:', error);
                // 如果保存失败，可以考虑回滚状态或显示错误提示
              }
            }}
            onSaveMeta={(meta) => {
              // 立即更新UI状态，避免阻塞
              setState(prev => ({ ...prev, rsipMeta: meta }));
              // 异步保存到存储，不阻塞UI
              storage.saveRSIPMeta(meta).catch((error: unknown) => {
                console.error('保存RSIP元数据失败:', error);
              });
            }}
          />
        );

      default:
        return (
          <>
            <Dashboard
              chains={state.chains}
              scheduledSessions={state.scheduledSessions}
              isLoading={isLoadingData}
              onCreateChain={handleCreateChain}
              onOpenRSIP={() => setState(prev => ({ ...prev, currentView: 'rsip' }))}
              onStartChain={handleStartChain}
              onScheduleChain={handleScheduleChain}
              onViewChainDetail={handleViewChainDetail}
              onCancelScheduledSession={handleCancelScheduledSession}
              onDeleteChain={handleDeleteChain}
              onImportChains={handleImportChains}
              onRestoreChains={handleRestoreChains}
              onPermanentDeleteChains={handlePermanentDeleteChains}
              history={state.completionHistory}
              rsipNodes={state.rsipNodes}
              rsipMeta={state.rsipMeta}
              userPreferences={userPreferences.getAll()}
              onRSIPImport={handleRSIPImport}
              onRSIPMetaImport={handleRSIPMetaImport}
              onUserPrefsImport={handleUserPrefsImport}
            />
            {showAuxiliaryJudgment && (
              <AuxiliaryJudgment
                chain={state.chains.find(c => c.id === showAuxiliaryJudgment)!}
                onJudgmentFailure={() => handleAuxiliaryJudgmentFailure(showAuxiliaryJudgment!)}
                onJudgmentAllow={(exceptionRule) => handleAuxiliaryJudgmentAllow(showAuxiliaryJudgment, exceptionRule)}
                onCancel={() => setShowAuxiliaryJudgment(null)}
              />
            )}
          </>
        );
    }
  };

  // Load data from storage on mount
  useEffect(() => {
    const loadData = async () => {
      console.log('开始加载数据，使用存储类型:', isSupabaseConfigured ? 'Supabase' : 'LocalStorage');
      setIsLoadingData(true);
      try {
        // 在加载数据前先执行自动清理
        try {
          const cleanedCount = await storage.cleanupExpiredDeletedChains(30);
          if (cleanedCount > 0) {
            console.log(`自动清理了 ${cleanedCount} 条过期的已删除链条`);
          }
        } catch (cleanupError) {
          console.error('自动清理失败:', cleanupError);
        }
        const chains = await storage.getActiveChains();
        
        // 检查并修复循环引用的数据
        const hasCircularReferences = chains.some(chain => chain.parentId === chain.id);
        if (hasCircularReferences) {
          console.log('检测到循环引用数据，正在修复...');
          const fixedChains = chains.map(chain => {
            if (chain.parentId === chain.id) {
              console.log(`修复链条 ${chain.name} 的循环引用`);
              return { ...chain, parentId: undefined };
            }
            return chain;
          });
          
          // 将修复后的数据保存回数据库
          await storage.saveChains(fixedChains);
          console.log('循环引用数据修复完成并已保存');
          
          // 使用修复后的数据
          setState(prev => ({
            ...prev,
            chains: fixedChains,
            scheduledSessions: [],
            activeSession: null,
            completionHistory: [],
            currentView: 'dashboard',
          }));
          return;
        }
        
        console.log('加载到的链数据:', chains.length, '条');
        console.log('链数据详情:', chains.map(c => ({ id: c.id, name: c.name })));
        const allScheduledSessions = await storage.getScheduledSessions();
        const scheduledSessions = allScheduledSessions.filter(
          session => !isSessionExpired(session.expiresAt)
        );
        const activeSession = await storage.getActiveSession();
        const completionHistory = await storage.getCompletionHistory();
        const rsipNodes = await storage.getRSIPNodes();
        const rsipMeta = await storage.getRSIPMeta();
        const taskTimeStats = await storage.getTaskTimeStats();

        // 执行数据迁移以确保历史记录包含用时信息
        storage.migrateCompletionHistoryForTiming();
        
        // 执行完整的数据迁移（仅在开发环境中记录详细信息）
        if (process.env.NODE_ENV === 'development') {
          try {
            const { dataMigrationManager } = await import('./utils/dataMigration');
            const migrationResult = await dataMigrationManager.migrateAll();
            if (!migrationResult.success || migrationResult.errors.length > 0) {
              console.warn('数据迁移完成，但有警告:', migrationResult);
            } else {
              console.log('数据迁移成功完成');
            }
          } catch (migrationError) {
            console.warn('数据迁移过程中出现错误:', migrationError);
          }
        }

        console.log('设置应用状态，链数量:', chains.length);
        setState(prev => ({
          ...prev,
          chains,
          scheduledSessions,
          activeSession,
          completionHistory,
          rsipNodes,
          rsipMeta,
          taskTimeStats,
          currentView: activeSession ? 'focus' : 'dashboard',
        }));

        // Clean up expired sessions
        if (scheduledSessions.length !== allScheduledSessions.length) {
          await storage.saveScheduledSessions(scheduledSessions);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    if (isInitialized) {
      console.log('应用初始化完成，开始加载数据');
      loadData();
    } else {
      setIsLoadingData(false);
    }
  }, [storage, isInitialized]);

  // 定期检查任务群过期状态
  useEffect(() => {
    if (!isInitialized) return;
    
    const checkExpiredGroups = () => {
      setState(prev => {
        let hasChanges = false;
        const updatedChains = prev.chains.map(chain => {
          if (chain.type === 'group' && isGroupExpired(chain)) {
            hasChanges = true;
            return resetGroupProgress(chain);
          }
          return chain;
        });

        if (hasChanges) {
          storage.saveChains(updatedChains);
          return { ...prev, chains: updatedChains };
        }
        return prev;
      });
    };

    // 每分钟检查一次
    const interval = setInterval(checkExpiredGroups, 60000);
    return () => clearInterval(interval);
  }, [storage, isInitialized]);

  // Initialize schedule timer manager and clean up expired scheduled sessions
  useEffect(() => {
    if (!isInitialized) return;
    
    // 设置过期回调函数
    scheduleTimerManager.setOnExpiredCallback((chainId: string) => {
      setShowAuxiliaryJudgment(chainId);
    });

    // 初始化所有当前的预约会话到计时器管理器
    state.scheduledSessions.forEach(session => {
      const chain = state.chains.find(c => c.id === session.chainId);
      if (chain && !isSessionExpired(session.expiresAt)) {
        scheduleTimerManager.addSchedule(
          session.chainId,
          chain.name,
          session.expiresAt
        );
      }
    });

    // 定期清理过期的预约会话
    const interval = setInterval(() => {
      setState(prev => {
        const expiredSessions = prev.scheduledSessions.filter(
          session => isSessionExpired(session.expiresAt)
        );
        const activeScheduledSessions = prev.scheduledSessions.filter(
          session => !isSessionExpired(session.expiresAt)
        );
        
        if (expiredSessions.length > 0) {
          // 从计时器管理器中移除过期的会话
          expiredSessions.forEach(session => {
            scheduleTimerManager.removeSchedule(session.chainId);
          });
          
          storage.saveScheduledSessions(activeScheduledSessions);
          return { ...prev, scheduledSessions: activeScheduledSessions };
        }
        
        return prev;
      });
    }, 10000); // Check every 10 seconds for better responsiveness

    return () => {
      clearInterval(interval);
      // 清理计时器管理器中的所有预约
      state.scheduledSessions.forEach(session => {
        scheduleTimerManager.removeSchedule(session.chainId);
      });
    };
  }, [storage, isInitialized, state.scheduledSessions, state.chains]);

  const handleCreateChain = (parentId?: string) => {
    setState(prev => ({
      ...prev,
      currentView: 'editor',
      editingChain: null,
      // Store the parentId for the chain editor
      viewingChainId: parentId || null,
    }));
  };

  // 辅助函数：安全保存链条数据，保持回收箱完整
  const safelySaveChains = async (updatedActiveChains: Chain[]): Promise<void> => {
    try {
      console.log('开始安全保存，活跃链数量:', updatedActiveChains.length);
      
      // 清理可能的循环引用和不可序列化的对象
      const cleanActiveChains = updatedActiveChains.map(chain => {
        const cleanChain: any = {};
        
        // 只复制可序列化的属性
        for (const [key, value] of Object.entries(chain)) {
          // 跳过可能包含循环引用的属性
          if (key === 'window' || key === 'document' || key === 'element') {
            continue;
          }
          
          // 检查值是否可序列化
          if (value !== null && value !== undefined) {
            try {
              // 尝试序列化单个属性来检测循环引用
              JSON.stringify(value);
              cleanChain[key] = value;
            } catch (error) {
              console.warn(`跳过链条 ${chain.name} 中不可序列化的属性 ${key}:`, error);
              // 对于Date对象，特殊处理
              if (value instanceof Date) {
                cleanChain[key] = value;
              }
            }
          } else {
            cleanChain[key] = value;
          }
        }
        
        return cleanChain as Chain;
      });
      
      // 获取所有现有链条（包括已删除的）
      const allExistingChains = await storage.getChains();
      console.log('获取到所有现有链条（包括已删除的）:', allExistingChains.length);
      
      const activeIds = new Set(cleanActiveChains.map(chain => chain.id));
      const deletedChains = allExistingChains.filter(chain => chain.deletedAt != null && !activeIds.has(chain.id));
      
      // 合并活跃链条和已删除链条
      const allUpdatedChains = [...cleanActiveChains, ...deletedChains];
      
      // 保存合并后的数据
      await storage.saveChains(allUpdatedChains);
      console.log('✅ 安全保存完成，回收箱数据已保留');
    } catch (error) {
      console.error('❌ 安全保存失败:', error);
      throw error;
    }
  };

  const handleEditChain = (chainId: string) => {
    const chain = state.chains.find(c => c.id === chainId);
    if (chain) {
      setState(prev => ({
        ...prev,
        currentView: 'editor',
        editingChain: chain,
      }));
    }
  };

  const handleSaveChain = async (chainData: Omit<Chain, 'id' | 'currentStreak' | 'auxiliaryStreak' | 'totalCompletions' | 'totalFailures' | 'auxiliaryFailures' | 'createdAt' | 'lastCompletedAt'>) => {
    console.log('开始保存链数据...', chainData);
    console.log('当前编辑的链:', state.editingChain);
    console.log('当前所有链条:', state.chains.map(c => ({ id: c.id, name: c.name })));
    
    try {
      // CRITICAL FIX: 获取所有链条（包括已删除的）以避免覆盖回收箱数据
      const allExistingChains = await storage.getChains();
      console.log('获取到所有现有链条（包括已删除的）:', allExistingChains.length);
      
      // 分离活跃链条和已删除链条
      const activeChains = allExistingChains.filter(chain => chain.deletedAt == null);
      const deletedChains = allExistingChains.filter(chain => chain.deletedAt != null);
      console.log('活跃链条数量:', activeChains.length, '已删除链条数量:', deletedChains.length);
      
      let updatedActiveChains: Chain[];
      
      if (state.editingChain) {
        // Editing existing chain
        console.log('编辑模式 - 原始链条数据:', state.editingChain);
        console.log('新的链条数据:', chainData);
        
        updatedActiveChains = state.chains.map(chain =>
          chain.id === state.editingChain!.id
            ? { ...chain, ...chainData }
            : chain
        );
        console.log('编辑现有链，更新后的活跃链数组长度:', updatedActiveChains.length);
        const editedChain = updatedActiveChains.find(c => c.id === state.editingChain!.id);
        console.log('编辑后的链数据:', editedChain);
      } else {
        // Creating new chain
        const newChain: Chain = {
          id: crypto.randomUUID(),
          ...chainData,
          currentStreak: 0,
          auxiliaryStreak: 0,
          totalCompletions: 0,
          totalFailures: 0,
          auxiliaryFailures: 0,
          createdAt: new Date(),
        };
        console.log('创建新链:', newChain);
        updatedActiveChains = [...state.chains, newChain];
        console.log('添加新链后的活跃链数组长度:', updatedActiveChains.length);
      }
      
      // 确保所有活跃链都有必需的字段
      updatedActiveChains = updatedActiveChains.map(chain => ({
        ...chain,
        type: chain.type || 'unit',
        sortOrder: chain.sortOrder || Math.floor(Date.now() / 1000),
        parentId: chain.parentId || undefined,
      }));
      
        console.log('准备安全保存到存储（包含回收箱数据）...');
        // 使用安全保存方法
        await safelySaveChains(updatedActiveChains);
        console.log('数据保存成功（包含回收箱数据），更新UI状态');
        
        // 记录操作历史
        if (state.editingChain) {
          // 编辑操作：记录原始状态和新状态
          recordChainOperation(
            'UPDATE_CHAIN',
            state.editingChain,
            updatedActiveChains.find(c => c.id === state.editingChain!.id) || null,
            state.editingChain.id,
            `更新链条: ${state.editingChain.name}`
          );
        } else {
          // 创建操作：记录新创建的链条
          const newChain = updatedActiveChains[updatedActiveChains.length - 1];
          recordChainOperation(
            'CREATE_CHAIN',
            null,
            newChain,
            newChain.id,
            `创建链条: ${newChain.name}`
          );
        }
        
        // Only update state after successful save (only with active chains)
        setState(prev => ({
          ...prev,
          chains: updatedActiveChains,
          currentView: 'dashboard',
          editingChain: null,
        }));
        console.log('UI状态更新完成');
    } catch (error) {
      console.error('Failed to save chain:', error);
      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      dialog.showAlert({
        message: `保存失败: ${errorMessage}\n\n请查看控制台了解详细信息，然后重试`,
        type: 'error',
        title: '保存失败'
      });
      
      // 如果保存失败，重新加载数据以确保状态一致性
      try {
        const currentChains = await storage.getActiveChains();
        setState(prev => ({
          ...prev,
          chains: currentChains,
        }));
      } catch (reloadError) {
        console.error('重新加载数据也失败了:', reloadError);
      }
    }
  };

  const handleScheduleChain = (chainId: string) => {
    // 检查是否已有该链的预约
    const existingSchedule = state.scheduledSessions.find(s => s.chainId === chainId);
    if (existingSchedule) return;

    const chain = state.chains.find(c => c.id === chainId);
    if (!chain) return;

    const scheduledSession: ScheduledSession = {
      chainId,
      scheduledAt: new Date(),
      expiresAt: new Date(Date.now() + chain.auxiliaryDuration * 60 * 1000), // Use chain's auxiliary duration
      auxiliarySignal: chain.auxiliarySignal,
    };

    const updateStateAndSave = async () => {
      try {
        const updatedSessions = [...state.scheduledSessions, scheduledSession];
        
        // 增加辅助链记录
        const updatedChains = state.chains.map(chain =>
          chain.id === chainId
            ? { ...chain, auxiliaryStreak: chain.auxiliaryStreak + 1 }
            : chain
        );
        
        // Save to storage first
        await Promise.all([
          storage.saveScheduledSessions(updatedSessions),
          safelySaveChains(updatedChains)
        ]);
        
        // Add to schedule timer manager
        scheduleTimerManager.addSchedule(
          chainId,
          chain.name,
          scheduledSession.expiresAt
        );

        // Update state after successful save
        setState(prev => ({ 
          ...prev,
          scheduledSessions: updatedSessions,
          chains: updatedChains
        }));
      } catch (error) {
        console.error('Failed to schedule chain:', error);
        dialog.showAlert({
          message: '预约失败，请重试',
          type: 'error',
          title: '预约失败'
        });
      }
    };

    updateStateAndSave();
  };

  const handleStartChain = (chainId: string) => {
    const chain = state.chains.find(c => c.id === chainId);
    if (!chain) return;

    // 如果是任务群，检查时间限定
    if (chain.type === 'group') {
      // 检查是否已过期
      if (isGroupExpired(chain)) {
        // 清空任务群进度
        const updatedChains = state.chains.map(c =>
          c.id === chainId ? resetGroupProgress(c) : c
        );
        
        setState(prev => ({
          ...prev,
          chains: updatedChains,
        }));
        
        // 显示过期通知
        notificationManager.notifyTaskFailed(chain.name, '任务群已超时');
        return;
      }

      // 如果任务群还没有开始计时，启动计时器
      if (chain.timeLimitHours && !chain.groupStartedAt) {
        const updatedChains = state.chains.map(c =>
          c.id === chainId ? startGroupTimer(c) : c
        );
        
        setState(prev => ({
          ...prev,
          chains: updatedChains,
        }));
      }

      const chainTree = buildChainTree(state.chains);
      const groupNode = chainTree.find(node => node.id === chainId);
      if (groupNode) {
        const nextUnit = getNextUnitInGroup(groupNode);
        if (nextUnit) {
          console.log(`任务群 ${chain.name} 开始下一个任务: ${nextUnit.name}`);
          handleStartChain(nextUnit.id);
          return;
        } else {
          // No next unit available - all tasks completed or no tasks in group
          console.log(`任务群 ${chain.name} 没有可用的下一个任务`);
          notificationManager.notifyTaskCompleted(chain.name, 0);
          return;
        }
      } else {
        console.error(`无法找到任务群节点: ${chainId}`);
        return;
      }
    }

    const activeSession: ActiveSession = {
      chainId,
      startedAt: new Date(),
      duration: chain.isDurationless ? 0 : chain.duration,
      isPaused: false,
      totalPausedTime: 0,
    };

    // Remove any scheduled session for this chain
    const updatedScheduledSessions = state.scheduledSessions.filter(
      session => session.chainId !== chainId
    );

    // Remove from schedule timer manager
    scheduleTimerManager.removeSchedule(chainId);

    setState(prev => {
      storage.saveActiveSession(activeSession);
      storage.saveScheduledSessions(updatedScheduledSessions);
      
      return {
        ...prev,
        activeSession,
        scheduledSessions: updatedScheduledSessions,
        currentView: 'focus',
      };
    });
  };

  const handleCompleteSession = (description?: string, notes?: string) => {
    if (!state.activeSession) return;

    const chain = state.chains.find(c => c.id === state.activeSession!.chainId);
    if (!chain) return;

    // 计算实际用时
    let actualDuration = state.activeSession.duration; // 默认使用计划时长
    
    if (chain.isDurationless) {
      // 对于无时长任务，从正向计时器获取实际用时
      const sessionId = `${state.activeSession.chainId}_${state.activeSession.startedAt.getTime()}`;
      const elapsedSeconds = forwardTimerManager.stopTimer(sessionId);
      actualDuration = Math.ceil(elapsedSeconds / 60); // 转换为分钟并向上取整
    }

    // 显示任务完成通知
    const newStreak = chain.currentStreak + 1;
    notificationManager.notifyTaskCompleted(chain.name, newStreak);

    const completionRecord: CompletionHistory = {
      chainId: chain.id,
      completedAt: new Date(),
      duration: state.activeSession.duration,
      wasSuccessful: true,
      actualDuration: actualDuration,
      isForwardTimed: !!chain.isDurationless,
      description: description,
      notes: notes,
    };

    setState(prev => {
      let updatedChains = prev.chains.map(c =>
        c.id === chain.id
          ? {
              ...c,
              currentStreak: c.currentStreak + 1,
              totalCompletions: c.totalCompletions + 1,
              lastCompletedAt: new Date(),
            }
          : c
      );
      
      // 如果完成的是单元任务，且该单元属于某个任务群，也要更新任务群的完成次数
      if (chain.parentId && chain.type !== 'group') {
        updatedChains = updateGroupCompletions(updatedChains, chain.parentId);
      }

      const updatedHistory = [...prev.completionHistory, completionRecord];
      
      // 保存数据到 storage
      storage.saveActiveSession(null);
      storage.saveCompletionHistory(updatedHistory);
      
      // 更新用时统计（仅对成功完成的任务）
      if (completionRecord.actualDuration) {
        storage.updateTaskTimeStats(chain.id, completionRecord.actualDuration);
      }

      return {
        ...prev,
        chains: updatedChains,
        activeSession: null,
        completionHistory: updatedHistory,
        currentView: 'dashboard',
      };
    });
    
    // 异步保存链条数据（在 setState 外部执行）
    safelySaveChains(state.chains).catch((error: unknown) => {
      console.error('完成任务时保存链条数据失败:', error);
    });
  };

  const handleInterruptSession = (reason?: string) => {
    if (!state.activeSession) return;

    const chain = state.chains.find(c => c.id === state.activeSession!.chainId);
    if (!chain) return;

    // 清理正向计时器（如果是无时长任务）
    if (chain.isDurationless) {
      const sessionId = `${state.activeSession.chainId}_${state.activeSession.startedAt.getTime()}`;
      forwardTimerManager.clearTimer(sessionId);
    }

    const completionRecord: CompletionHistory = {
      chainId: chain.id,
      completedAt: new Date(),
      duration: state.activeSession.duration,
      wasSuccessful: false,
      reasonForFailure: reason || '用户主动中断',
      actualDuration: state.activeSession.duration, // 中断时使用计划时长
      isForwardTimed: !!chain.isDurationless,
    };

    setState(prev => {
      const updatedChains = prev.chains.map(c =>
        c.id === chain.id
          ? {
              ...c,
              currentStreak: 0, // Reset streak
              totalFailures: c.totalFailures + 1,
            }
          : c
      );

      const updatedHistory = [...prev.completionHistory, completionRecord];
      
      // 保存数据到 storage
      storage.saveActiveSession(null);
      storage.saveCompletionHistory(updatedHistory);

      return {
        ...prev,
        chains: updatedChains,
        activeSession: null,
        completionHistory: updatedHistory,
        currentView: 'dashboard',
      };
    });
    
    // 异步保存链条数据（在 setState 外部执行）
    safelySaveChains(state.chains).catch((error: unknown) => {
      console.error('中断任务时保存链条数据失败:', error);
    });
  };

  const handlePauseSession = () => {
    if (!state.activeSession) return;

    setState(prev => {
      const updatedSession = {
        ...prev.activeSession!,
        isPaused: true,
        pausedAt: new Date(),
      };
      
      storage.saveActiveSession(updatedSession);
      
      return {
        ...prev,
        activeSession: updatedSession,
      };
    });
  };

  const handleResumeSession = () => {
    if (!state.activeSession || !state.activeSession.pausedAt) return;

    setState(prev => {
      const pauseDuration = Date.now() - prev.activeSession!.pausedAt!.getTime();
      const updatedSession = {
        ...prev.activeSession!,
        isPaused: false,
        pausedAt: undefined,
        totalPausedTime: prev.activeSession!.totalPausedTime + pauseDuration,
      };
      
      storage.saveActiveSession(updatedSession);
      
      return {
        ...prev,
        activeSession: updatedSession,
      };
    });
  };

  const handleAuxiliaryJudgmentFailure = (chainId: string) => {
    // Remove from schedule timer manager
    scheduleTimerManager.removeSchedule(chainId);
    
    setState(prev => {
      // Remove the scheduled session
      const updatedScheduledSessions = prev.scheduledSessions.filter(
        session => session.chainId !== chainId
      );
      
      const updatedChains = prev.chains.map(chain =>
        chain.id === chainId
          ? {
              ...chain,
              auxiliaryStreak: 0, // Reset auxiliary streak
              auxiliaryFailures: chain.auxiliaryFailures + 1
            }
          : chain
      );
      
      storage.saveScheduledSessions(updatedScheduledSessions);
      
      return {
        ...prev,
        chains: updatedChains,
        scheduledSessions: updatedScheduledSessions,
      };
    });
    
    // 异步保存链条数据
    safelySaveChains(state.chains.map(chain =>
      chain.id === chainId
        ? {
            ...chain,
            auxiliaryStreak: 0,
            auxiliaryFailures: chain.auxiliaryFailures + 1
          }
        : chain
    )).catch(error => {
      console.error('辅助判断失败时保存链条数据失败:', error);
    });
    
    setShowAuxiliaryJudgment(null);
  };

  const handleAuxiliaryJudgmentAllow = (chainId: string, exceptionRule: string) => {
    // Remove from schedule timer manager
    scheduleTimerManager.removeSchedule(chainId);
    
    setState(prev => {
      // Remove the scheduled session
      const updatedScheduledSessions = prev.scheduledSessions.filter(
        session => session.chainId !== chainId
      );
      
      const updatedChains = prev.chains.map(chain =>
        chain.id === chainId
          ? {
              ...chain,
              auxiliaryExceptions: [...(chain.auxiliaryExceptions || []), exceptionRule]
            }
          : chain
      );
      
      storage.saveScheduledSessions(updatedScheduledSessions);
      
      return {
        ...prev,
        chains: updatedChains,
        scheduledSessions: updatedScheduledSessions,
      };
    });
    
    // 异步保存链条数据
    safelySaveChains(state.chains.map(chain =>
      chain.id === chainId
        ? {
            ...chain,
            auxiliaryExceptions: [...(chain.auxiliaryExceptions || []), exceptionRule]
          }
        : chain
    )).catch(error => {
      console.error('辅助判断允许时保存链条数据失败:', error);
    });
    
    setShowAuxiliaryJudgment(null);
  };

  const handleCancelScheduledSession = (chainId: string) => {
    setShowAuxiliaryJudgment(chainId);
  };



  const handleViewChainDetail = (chainId: string) => {
    const chain = state.chains.find(c => c.id === chainId);
    if (!chain) return;
    
    const viewType = chain.type === 'group' ? 'group' : 'detail';
    
    setState(prev => ({
      ...prev,
      currentView: viewType,
      viewingChainId: chainId,
    }));
  };

  const handleBackToDashboard = () => {
    setState(prev => ({
      ...prev,
      currentView: 'dashboard',
      editingChain: null,
      viewingChainId: null,
    }));
  };

  const handleDeleteChain = async (chainId: string) => {
    try {
      // 获取要删除的链条的当前状态（用于操作历史）
      const chainToDelete = state.chains.find(c => c.id === chainId);
      
      // Use soft deletion instead of permanent deletion
      await storage.softDeleteChain(chainId);
      
      // Reload chains to reflect the soft deletion
      const updatedChains = await storage.getActiveChains();
      
      // Remove from schedule timer manager
      scheduleTimerManager.removeSchedule(chainId);
      
      setState(prev => {
        // Remove any scheduled sessions for this chain
        const updatedScheduledSessions = prev.scheduledSessions.filter(
          session => session.chainId !== chainId
        );
        
        // If currently active session belongs to this chain, clear it
        const updatedActiveSession = prev.activeSession?.chainId === chainId 
          ? null 
          : prev.activeSession;
        
        // Save updated sessions to storage
        storage.saveScheduledSessions(updatedScheduledSessions);
        if (!updatedActiveSession) {
          storage.saveActiveSession(null);
        }
        
        return {
          ...prev,
          chains: updatedChains,
          scheduledSessions: updatedScheduledSessions,
          activeSession: updatedActiveSession,
          currentView: updatedActiveSession ? prev.currentView : 'dashboard',
          viewingChainId: prev.viewingChainId === chainId ? null : prev.viewingChainId,
        };
      });
      
      console.log(`链条 ${chainId} 已移动到回收箱`);
      
      // 记录删除操作历史
      if (chainToDelete) {
        recordChainOperation(
          'DELETE_CHAIN',
          chainToDelete,
          null,
          chainId,
          `删除链条: ${chainToDelete.name}`
        );
      }
    } catch (error) {
      console.error('删除链条失败:', error);
      dialog.showAlert({
          message: '删除失败，请重试',
          type: 'error',
          title: '删除失败'
        });
    }
  };

  const handleRestoreChains = async (chainIds: string[]) => {
    try {
      console.log('恢复链条:', chainIds);
      
      // 获取要恢复的链条信息（用于操作历史）
      const allChains = await storage.getChains();
      const chainsToRestore = allChains.filter(c => chainIds.includes(c.id) && c.deletedAt);
      
      // 批量恢复链条
      for (const chainId of chainIds) {
        await storage.restoreChain(chainId);
      }
      
      // 重新加载活跃链条
      const updatedChains = await storage.getActiveChains();
      setState(prev => ({
        ...prev,
        chains: updatedChains,
      }));
      
      console.log(`成功恢复 ${chainIds.length} 条链条`);
      
      // 记录恢复操作历史
      chainsToRestore.forEach(chain => {
        recordChainOperation(
          'RESTORE_CHAIN',
          null,
          chain,
          chain.id,
          `恢复链条: ${chain.name}`
        );
      });
    } catch (error) {
      console.error('恢复链条失败:', error);
      dialog.showAlert({
          message: '恢复失败，请重试',
          type: 'error',
          title: '恢复失败'
        });
    }
  };

  const handlePermanentDeleteChains = async (chainIds: string[]) => {
    try {
      console.log('永久删除链条:', chainIds);
      
      // 批量永久删除链条
      for (const chainId of chainIds) {
        await storage.permanentlyDeleteChain(chainId);
      }
      
      console.log(`成功永久删除 ${chainIds.length} 条链条`);
    } catch (error) {
      console.error('永久删除链条失败:', error);
      dialog.showAlert({
          message: '永久删除失败，请重试',
          type: 'error',
          title: '永久删除失败'
        });
    }
  };

  const handleImportChains = async (importedChains: Chain[], importedHistory: CompletionHistory[]) => {
    console.log('开始导入链数据...', importedChains);
    
    try {
      // 合并导入的链条到现有链条中
      const updatedChains = [...state.chains, ...importedChains];
      
      console.log('准备保存导入的数据到存储...');
      // Wait for data to be saved before updating UI - 使用安全保存方法
      await safelySaveChains(updatedChains);
      if (Array.isArray(importedHistory) && importedHistory.length > 0) {
        const existing = await storage.getCompletionHistory();
        const merged = [
          ...existing,
          ...importedHistory,
        ];
        await storage.saveCompletionHistory(merged);
      }
      console.log('导入数据保存成功，更新UI状态');
      
      // Only update state after successful save
      setState(prev => ({
        ...prev,
        chains: updatedChains,
        completionHistory: Array.isArray(importedHistory) && importedHistory.length > 0
          ? [...prev.completionHistory, ...importedHistory]
          : prev.completionHistory,
      }));
      console.log('导入完成，UI状态更新完成');
    } catch (error) {
      console.error('Failed to import chains:', error);
      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : '未知错误';

      dialog.showAlert({
        message: `导入失败: ${errorMessage}\n\n请查看控制台了解详细信息，然后重试`,
        type: 'error',
        title: '导入失败'
      });
      
      // 如果导入失败，重新加载数据以确保状态一致性
      try {
        const currentChains = await storage.getChains();
        setState(prev => ({
          ...prev,
          chains: currentChains,
        }));
      } catch (reloadError) {
        console.error('重新加载数据也失败了:', reloadError);
      }
    }
  };

  const handleRSIPImport = async (importedRSIPNodes: RSIPNode[]) => {
    try {
      console.log('开始导入 RSIP 节点数据...', importedRSIPNodes);
      const updatedRSIPNodes = [...state.rsipNodes, ...importedRSIPNodes];
      await storage.saveRSIPNodes(updatedRSIPNodes);
      setState(prev => ({
        ...prev,
        rsipNodes: updatedRSIPNodes,
      }));
      console.log('RSIP 节点导入完成');
    } catch (error) {
      console.error('Failed to import RSIP nodes:', error);
      dialog.showAlert({
        message: `RSIP 节点导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
        type: 'error',
        title: '导入失败'
      });
    }
  };

  const handleRSIPMetaImport = async (importedRSIPMeta: RSIPMeta) => {
    try {
      console.log('开始导入 RSIP 元数据...', importedRSIPMeta);
      await storage.saveRSIPMeta(importedRSIPMeta);
      setState(prev => ({
        ...prev,
        rsipMeta: importedRSIPMeta,
      }));
      console.log('RSIP 元数据导入完成');
    } catch (error) {
      console.error('Failed to import RSIP meta:', error);
      dialog.showAlert({
        message: `RSIP 元数据导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
        type: 'error',
        title: '导入失败'
      });
    }
  };

  const handleUserPrefsImport = async (importedUserPrefs: UserPreferences) => {
    try {
      console.log('开始导入用户偏好设置...', importedUserPrefs);
      userPreferences.updatePreferences(importedUserPrefs);
      console.log('用户偏好设置导入完成');
    } catch (error) {
      console.error('Failed to import user preferences:', error);
      dialog.showAlert({
        message: `用户偏好设置导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
        type: 'error',
        title: '导入失败'
      });
    }
  };

  const handleImportUnits = async (unitIds: string[], groupId: string, mode: 'move' | 'copy' = 'copy') => {
    console.log('开始导入单元到任务群...', { unitIds, groupId, mode });
    
    try {
      let updatedChains: Chain[];
      
      if (mode === 'copy') {
        // 复制模式：创建副本并加入任务群，原单元保持独立
        const copiesToAdd: Chain[] = [];
        
        state.chains.forEach(chain => {
          if (unitIds.includes(chain.id)) {
            const copy: Chain = {
              ...chain,
              id: crypto.randomUUID(), // 生成新的ID
              name: `${chain.name} (副本)`, // 添加副本标识
              parentId: groupId,
              currentStreak: 0, // 重置记录
              auxiliaryStreak: 0,
              totalCompletions: 0,
              totalFailures: 0,
              auxiliaryFailures: 0,
              createdAt: new Date(),
              lastCompletedAt: undefined,
            };
            copiesToAdd.push(copy);
          }
        });
        
        updatedChains = [...state.chains, ...copiesToAdd];
      } else {
        // 移动模式：更新选中单元的 parentId 为目标任务群的 ID
        updatedChains = state.chains.map(chain => {
          if (unitIds.includes(chain.id)) {
            return { ...chain, parentId: groupId };
          }
          return chain;
        });
      }
      
      console.log('准备保存导入后的数据到存储...');
      // Wait for data to be saved before updating UI - 使用安全保存方法
      await safelySaveChains(updatedChains);
      console.log('导入数据保存成功，更新UI状态');
      
      // Only update state after successful save
      setState(prev => ({
        ...prev,
        chains: updatedChains,
      }));
      console.log('导入完成，UI状态更新完成');
    } catch (error) {
      console.error('Failed to import units:', error);
      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      dialog.showAlert({
        message: `导入失败: ${errorMessage}\n\n请查看控制台了解详细信息，然后重试`,
        type: 'error',
        title: '导入失败'
      });
      
      // 如果导入失败，重新加载数据以确保状态一致性
      try {
        const currentChains = await storage.getChains();
        setState(prev => ({
          ...prev,
          chains: currentChains,
        }));
      } catch (reloadError) {
        console.error('重新加载数据也失败了:', reloadError);
      }
    }
  };

  return (
    <div className={`min-h-screen ${!isMiniMode ? 'pt-10' : ''} bg-[#FDFDFD] dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900`}>
      {!isMiniMode && <WindowControls />}
      {renderContent()}
      <AppContextMenu
        canUndo={historyState.canUndo}
        canRedo={historyState.canRedo}
        onUndo={undo}
        onRedo={redo}
        onOpenHistory={() => setIsHistoryPanelOpen(true)}
      />
      <OperationHistoryPanel
        isOpen={isHistoryPanelOpen}
        onClose={() => {
          setIsHistoryPanelOpen(false);
          updateHistoryState();
        }}
        onHistoryChanged={updateHistoryState}
      />
      <UpdateAnnouncementModal
        isOpen={showUpdateAnnouncement}
        version={appVersion}
        notes={getUpdateNotes()}
        onClose={handleCloseUpdateAnnouncement}
      />
    </div>
  );
}

function App() {
  return (
    <DialogProvider>
      <AppContent />
    </DialogProvider>
  );
}

export default App;
