import React, { useState, useEffect, useCallback } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { formatDuration, formatElapsedTime } from '../utils/time';
import { storage as localStorageUtils } from '../utils/storage';
import { forwardTimerManager } from '../utils/forwardTimer';

interface TimerState {
  chain: any;
  session: any;
  timeRemaining: number;
  forwardElapsedSeconds: number;
  isPaused: boolean;
  progress: number;
  isDurationless: boolean;
}

export const MiniTimerWindowApp: React.FC = () => {
  console.log('[MiniTimerWindowApp] 组件已渲染！');
  
  const [timerState, setTimerState] = useState<TimerState>({
    chain: null,
    session: null,
    timeRemaining: 0,
    forwardElapsedSeconds: 0,
    isPaused: false,
    progress: 0,
    isDurationless: false,
  });

  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);

  useEffect(() => {
    const loadInitialState = async () => {
      try {
        console.log('[MiniTimerWindowApp] 开始加载初始状态...');
        const chains = await localStorageUtils.getActiveChains();
        const session = await localStorageUtils.getActiveSession();
        
        console.log('[MiniTimerWindowApp] 加载到的链条数量:', chains.length);
        console.log('[MiniTimerWindowApp] 加载到的会话:', session);
        
        if (session) {
          const chain = chains.find(c => c.id === session.chainId);
          console.log('[MiniTimerWindowApp] 找到的链条:', chain);
          if (chain) {
            const isDurationless = !!chain.isDurationless || session.duration === 0;
            
            setTimerState({
              chain,
              session,
              timeRemaining: 0,
              forwardElapsedSeconds: 0,
              isPaused: session.isPaused,
              progress: 0,
              isDurationless,
            });
            console.log('[MiniTimerWindowApp] 初始状态设置完成');
          } else {
            console.error('[MiniTimerWindowApp] 未找到匹配的链条！');
          }
        } else {
          console.error('[MiniTimerWindowApp] 未找到活动会话！');
        }
      } catch (error) {
        console.error('[MiniTimerWindowApp] 加载初始状态失败:', error);
      }
    };

    loadInitialState();
  }, []);

  useEffect(() => {
    if (!timerState.session || !timerState.chain) return;

    const updateTimer = () => {
      const now = Date.now();
      const isDurationless = timerState.isDurationless;
      
      if (isDurationless) {
        const sessionId = `${timerState.session!.chainId}_${new Date(timerState.session!.startedAt).getTime()}`;
        if (forwardTimerManager.hasTimer(sessionId)) {
          const elapsed = forwardTimerManager.getCurrentElapsed(sessionId);
          setTimerState(prev => ({
            ...prev,
            forwardElapsedSeconds: elapsed,
          }));
        }
      } else {
        const sessionDurationMs = timerState.session!.duration * 60 * 1000;
        const elapsedTime = timerState.session!.isPaused 
          ? (new Date(timerState.session!.pausedAt || now).getTime() - new Date(timerState.session!.startedAt).getTime())
          : (now - new Date(timerState.session!.startedAt).getTime());
        const adjustedElapsedTime = elapsedTime - (timerState.session!.totalPausedTime || 0);
        const remaining = Math.max(0, sessionDurationMs - adjustedElapsedTime);
        const timeRemaining = Math.ceil(remaining / 1000);
        const progress = ((timerState.session!.duration * 60 - timeRemaining) / (timerState.session!.duration * 60)) * 100;
        
        setTimerState(prev => ({
          ...prev,
          timeRemaining,
          progress,
        }));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [timerState.session, timerState.chain, timerState.isDurationless]);

  useEffect(() => {
    if (window.electron?.ipcRenderer?.on) {
      const handleStateUpdate = (...args: unknown[]) => {
        const state = args[1] as any;
        console.log('[MiniTimerWindowApp] 从主窗口收到状态更新:', state);
        if (state) {
          setTimerState(prev => ({
            ...prev,
            ...state,
          }));
        }
      };

      window.electron.ipcRenderer.on('mini-timer:update-state', handleStateUpdate);

      return () => {
        if (window.electron?.ipcRenderer?.removeListener) {
          window.electron.ipcRenderer.removeListener('mini-timer:update-state', handleStateUpdate);
        }
      };
    }
  }, []);

  const handleRestore = useCallback(() => {
    if (window.electron?.ipcRenderer?.send) {
      window.electron.ipcRenderer.send('mini-timer:restore');
    }
  }, []);

  const toggleAlwaysOnTop = useCallback(() => {
    const newState = !isAlwaysOnTop;
    setIsAlwaysOnTop(newState);
    if (window.electron?.ipcRenderer?.send) {
      window.electron.ipcRenderer.send('mini-timer:set-always-on-top', newState);
    }
  }, [isAlwaysOnTop]);

  if (!timerState.chain || !timerState.session) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-gray-400 text-sm">加载中...</p>
          <p className="text-gray-500 text-xs mt-2">等待主窗口数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-white select-none overflow-hidden">
      <div 
        className="absolute inset-0 flex flex-col items-center justify-center p-4">
        <div className="text-center mb-2">
          <p className="text-gray-400 text-xs mb-1 truncate max-w-[150px]">
            {timerState.chain?.name || '未知任务'}
          </p>
        </div>

        <div className="text-center mb-4">
          <div
            className={`text-3xl font-bold font-mono tracking-tight ${
              !timerState.isDurationless && timerState.timeRemaining <= 60 && timerState.timeRemaining > 0
                ? 'text-red-400'
                : 'text-white'
            }`}
          >
            {timerState.isDurationless
              ? formatElapsedTime(timerState.forwardElapsedSeconds)
              : formatDuration(timerState.timeRemaining)}
          </div>
          {timerState.isPaused && (
            <div className="text-xs text-amber-400 font-medium mt-1">
              已暂停
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={toggleAlwaysOnTop}
            className={`p-2 rounded-full transition-all ${
              isAlwaysOnTop
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
            title={isAlwaysOnTop ? '取消置顶' : '置顶窗口'}
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={handleRestore}
            className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-all"
            title="恢复大窗口"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
