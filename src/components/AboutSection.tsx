import React, { useState, useEffect } from 'react';
import { Info, RefreshCw, Settings2, ExternalLink } from 'lucide-react';
import { userPreferences } from '../utils/userPreferences';
import { useDialog } from './DialogManager';

interface AboutSectionProps {
  className?: string;
  autoCheckUpdates?: boolean;
  onAutoCheckUpdatesChange?: (enabled: boolean) => void;
}

export const AboutSection: React.FC<AboutSectionProps> = ({ 
  className = '', 
  autoCheckUpdates: externalAutoCheckUpdates,
  onAutoCheckUpdatesChange 
}) => {
  const dialog = useDialog();
  const [currentVersion, setCurrentVersion] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [internalAutoCheckUpdates, setInternalAutoCheckUpdates] = useState(true);
  
  // 使用外部传入的状态或内部状态
  const autoCheckUpdates = externalAutoCheckUpdates !== undefined ? externalAutoCheckUpdates : internalAutoCheckUpdates;
  const setAutoCheckUpdates = onAutoCheckUpdatesChange || setInternalAutoCheckUpdates;
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{
    isDownloading: boolean;
    progress: { percent: number; bytesPerSecond: number; total: number; transferred: number };
  }>({
    isDownloading: false,
    progress: { percent: 0, bytesPerSecond: 0, total: 0, transferred: 0 }
  });

  useEffect(() => {
    // 获取当前版本
    getCurrentVersion();
    
    // 获取自动更新偏好并同步到主进程（仅在没有外部状态管理时）
    let currentAutoCheckValue = autoCheckUpdates;
    if (externalAutoCheckUpdates === undefined) {
      const autoCheckEnabled = userPreferences.getAutoCheckUpdates();
      setInternalAutoCheckUpdates(autoCheckEnabled);
      currentAutoCheckValue = autoCheckEnabled;
    }
    
    // 同步设置到主进程
    if (window.electronAPI?.update?.setAutoCheck) {
      window.electronAPI.update.setAutoCheck(currentAutoCheckValue);
    }
    
    // 监听下载进度
    if (window.electron?.ipcRenderer) {
      const handleDownloadProgress = (progress: any) => {
        setDownloadStatus(prev => ({
          ...prev,
          isDownloading: true,
          progress
        }));
      };

      const handleUpdateDownloaded = () => {
        setDownloadStatus(prev => ({
          ...prev,
          isDownloading: false
        }));
      };

      const handleUpdateError = () => {
        setDownloadStatus(prev => ({
          ...prev,
          isDownloading: false
        }));
      };

      window.electron.ipcRenderer.on('download-progress', handleDownloadProgress);
      window.electron.ipcRenderer.on('update-downloaded', handleUpdateDownloaded);
      window.electron.ipcRenderer.on('update-error', handleUpdateError);

      return () => {
        window.electron.ipcRenderer.removeListener('download-progress', handleDownloadProgress);
        window.electron.ipcRenderer.removeListener('update-downloaded', handleUpdateDownloaded);
        window.electron.ipcRenderer.removeListener('update-error', handleUpdateError);
      };
    }
  }, []);

  const getCurrentVersion = async () => {
    try {
      if (window.electronAPI?.app?.getVersion) {
        const version = await window.electronAPI.app.getVersion();
        setCurrentVersion(version);
      } else {
        // Web环境中从package.json获取版本
        setCurrentVersion('1.0.0');
      }
    } catch (error) {
      console.error('获取版本信息失败:', error);
      setCurrentVersion('未知');
    }
  };

  const handleManualCheck = async () => {
    try {
      setIsChecking(true);
      setLastCheckTime(new Date());
      
      if (window.electronAPI?.update?.checkManual) {
        const result = await window.electronAPI.update.checkManual();
        
        // 如果没有可用更新，提示用户
        if (!result.updateAvailable) {
          dialog.showAlert({
            message: '目前已是最新版本！',
            type: 'success',
            title: '检查更新'
          });
        }
        // 如果有更新，顶部横幅会处理显示
      } else {
        // Web环境模拟检查
        dialog.showAlert({
          message: '目前已是最新版本！',
          type: 'success',
          title: '检查更新'
        });
      }
    } catch (error) {
      console.error('手动检查更新失败:', error);
      dialog.showAlert({
        message: '检查更新失败，请稍后重试',
        type: 'error',
        title: '检查更新失败'
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleAutoUpdateToggle = async (enabled: boolean) => {
    setAutoCheckUpdates(enabled);
    await userPreferences.setAutoCheckUpdates(enabled);
    
    // 通知主进程自动检查设置的变化
    if (window.electronAPI?.update?.setAutoCheck) {
      await window.electronAPI.update.setAutoCheck(enabled);
    }
  };

  const handleOpenGitHub = () => {
    const githubUrl = 'https://github.com/enshulv/momentum_desktop';
    if (window.electronAPI?.shell?.openExternal) {
      window.electronAPI.shell.openExternal(githubUrl);
    } else {
      window.open(githubUrl, '_blank');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 应用信息 */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Info className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Momentum Desktop
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              基于链式时延协议的自控力提升工具
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">当前版本：</span>
            <span className="font-mono text-gray-900 dark:text-white ml-2">
              v{currentVersion}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">开发者：</span>
            <span className="text-gray-900 dark:text-white ml-2">enshulv 基于 KenXiao1</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">许可证：</span>
            <span className="text-gray-900 dark:text-white ml-2">GPL-3.0</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">技术栈：</span>
            <span className="text-gray-900 dark:text-white ml-2">Electron + React + TypeScript</span>
          </div>
        </div>

        {/* 下载进度条 */}
        {downloadStatus.isDownloading && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">正在下载最新安装包...</span>
                <span className="font-mono text-gray-900 dark:text-white">
                  {downloadStatus.progress.percent}%
                </span>
              </div>
              
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${downloadStatus.progress.percent}%` }}
                />
              </div>
              
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {formatBytes(downloadStatus.progress.transferred)} / {formatBytes(downloadStatus.progress.total)}
                </span>
                <span>
                  {formatSpeed(downloadStatus.progress.bytesPerSecond)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <button
            onClick={handleOpenGitHub}
            className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>查看项目主页</span>
          </button>
        </div>
      </div>

      {/* 更新设置 */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Settings2 className="w-5 h-5 mr-2" />
          更新设置
        </h4>

        <div className="space-y-4">
          {/* 自动检查更新开关 */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                自动检查更新
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                应用启动时自动检查是否有新版本可用
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoCheckUpdates}
                onChange={(e) => handleAutoUpdateToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* 手动检查更新 */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  手动检查更新
                </h5>
                {lastCheckTime && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    上次检查：{lastCheckTime.toLocaleString('zh-CN')}
                  </p>
                )}
              </div>
              <button
                onClick={handleManualCheck}
                disabled={isChecking}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{isChecking ? '检查中...' : '检查更新'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 功能说明 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <h4 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
          关于自控力提升
        </h4>
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <p>
            • <strong>链式时延协议：</strong>通过设定任务链和时间延迟，帮助您建立持续的专注习惯
          </p>
          <p>
            • <strong>任务群组：</strong>将相关任务组织成群组，提高执行效率
          </p>
          <p>
            • <strong>辅助判断：</strong>智能的中断检测和异常处理机制
          </p>
          <p>
            • <strong>数据追踪：</strong>完整的任务完成历史和统计分析
          </p>
        </div>
      </div>
    </div>
  );
};
