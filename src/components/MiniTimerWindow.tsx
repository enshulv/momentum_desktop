import React, { useState, useEffect } from 'react';
import { Play, Pause, X, Maximize2, Minimize2 } from 'lucide-react';

interface MiniTimerWindowProps {
  isOpen: boolean;
  chainName: string;
  timeRemaining: number;
  isPaused: boolean;
  progress: number;
  isDurationless?: boolean;
  elapsedSeconds?: number;
  onClose: () => void;
  onTogglePause: () => void;
  onRestore: () => void;
  onAlwaysOnTopChange?: (alwaysOnTop: boolean) => void;
}

export const MiniTimerWindow: React.FC<MiniTimerWindowProps> = ({
  isOpen,
  chainName,
  timeRemaining,
  isPaused,
  progress,
  isDurationless = false,
  elapsedSeconds = 0,
  onClose,
  onTogglePause,
  onRestore,
  onAlwaysOnTopChange,
}) => {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 格式化时间显示
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // 切换置顶状态
  const toggleAlwaysOnTop = () => {
    const newValue = !isAlwaysOnTop;
    setIsAlwaysOnTop(newValue);
    onAlwaysOnTopChange?.(newValue);
  };

  // 处理鼠标拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-50 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        left: position.x || 'auto',
        right: position.x ? 'auto' : '20px',
        top: position.y || 'auto',
        bottom: position.y ? 'auto' : '20px',
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 ${
          isAlwaysOnTop ? 'ring-2 ring-blue-500' : ''
        }`}
        style={{ width: '280px' }}
      >
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate flex-1 mr-2">
            {chainName}
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
              <Maximize2 size={12} />
            </button>
            <button
              onClick={onRestore}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors"
              title="恢复大窗口"
            >
              <Minimize2 size={12} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title="关闭"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* 倒计时显示区域 */}
        <div className="px-4 py-6 text-center">
          {isDurationless ? (
            <div className="space-y-1">
              <div className="text-5xl font-bold text-gray-800 dark:text-gray-100 font-mono tracking-tight">
                {formatTime(elapsedSeconds)}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                正在进行中
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div
                className={`text-5xl font-bold font-mono tracking-tight transition-colors ${
                  timeRemaining <= 60 && timeRemaining > 0
                    ? 'text-red-500'
                    : 'text-gray-800 dark:text-gray-100'
                }`}
              >
                {formatTime(timeRemaining)}
              </div>
              {isPaused && (
                <div className="text-xs text-amber-500 font-medium">
                  已暂停
                </div>
              )}
            </div>
          )}
        </div>

        {/* 进度条 */}
        {!isDurationless && (
          <div className="px-4 pb-4">
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 控制按钮 */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-center space-x-3">
            {!isDurationless && (
              <button
                onClick={onTogglePause}
                className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                  isPaused
                    ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30'
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30'
                }`}
              >
                {isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
