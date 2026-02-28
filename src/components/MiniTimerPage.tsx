import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, X, Minimize2 } from 'lucide-react';

interface TimerState {
  chainName: string;
  timeRemaining: number;
  isPaused: boolean;
  progress: number;
  isDurationless: boolean;
  elapsedSeconds?: number;
}

export const MiniTimerPage: React.FC = () => {
  const [timerState, setTimerState] = useState<TimerState>({
    chainName: '',
    timeRemaining: 0,
    isPaused: false,
    progress: 0,
    isDurationless: false,
    elapsedSeconds: 0,
  });
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTogglePause = useCallback(() => {
    if (window.electron?.ipcRenderer?.send) {
      window.electron.ipcRenderer.send('mini-timer:toggle-pause');
    }
  }, []);

  const handleRestore = useCallback(() => {
    if (window.electron?.ipcRenderer?.send) {
      window.electron.ipcRenderer.send('mini-timer:restore');
    }
  }, []);

  const handleClose = useCallback(() => {
    if (window.electron?.ipcRenderer?.send) {
      window.electron.ipcRenderer.send('mini-timer:close');
    }
  }, []);

  const toggleAlwaysOnTop = useCallback(() => {
    const newState = !isAlwaysOnTop;
    setIsAlwaysOnTop(newState);
    if (window.electron?.ipcRenderer?.send) {
      window.electron.ipcRenderer.send('mini-timer:set-always-on-top', newState);
    }
  }, [isAlwaysOnTop]);

  useEffect(() => {
    if (window.electron?.ipcRenderer?.on) {
      const updateStateListener = (...args: unknown[]) => {
        const state = args[1] as TimerState;
        setTimerState(state);
      };

      window.electron.ipcRenderer.on('mini-timer:update-state', updateStateListener);

      return () => {
        if (window.electron?.ipcRenderer?.removeListener) {
          window.electron.ipcRenderer.removeListener('mini-timer:update-state', updateStateListener);
        }
      };
    }
  }, []);

  return (
    <div className="w-full h-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden select-none">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate flex-1 mr-2">
          {timerState.chainName}
        </span>
        <div className="flex items-center space-x-1">
          <button
            onClick={toggleAlwaysOnTop}
            className={`p-1 rounded transition-colors ${
              isAlwaysOnTop
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}
            title={isAlwaysOnTop ? '取消置顶' : '置顶窗口'}
          >
            <Minimize2 size={12} />
          </button>
          <button
            onClick={handleRestore}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors"
            title="恢复大窗口"
          >
            <Minimize2 size={12} />
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="关闭"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 text-center">
        {timerState.isDurationless ? (
          <div className="space-y-1">
            <div className="text-4xl font-bold text-gray-800 dark:text-gray-100 font-mono tracking-tight">
              {formatTime(timerState.elapsedSeconds || 0)}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              正在进行中
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div
              className={`text-4xl font-bold font-mono tracking-tight transition-colors ${
                timerState.timeRemaining <= 60 && timerState.timeRemaining > 0
                  ? 'text-red-500'
                  : 'text-gray-800 dark:text-gray-100'
              }`}
            >
              {formatTime(timerState.timeRemaining)}
            </div>
            {timerState.isPaused && (
              <div className="text-xs text-amber-500 font-medium">
                已暂停
              </div>
            )}
          </div>
        )}
      </div>

      {!timerState.isDurationless && (
        <div className="px-4 pb-4">
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${timerState.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <div className="flex items-center justify-center space-x-3">
          {!timerState.isDurationless && (
            <button
              onClick={handleTogglePause}
              className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                timerState.isPaused
                  ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30'
                  : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30'
              }`}
            >
              {timerState.isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
