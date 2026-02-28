// 使用ES模块import语法替换require
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import url from 'url'; // 添加url模块导入
import fs from 'fs/promises';
import os from 'os';
import archiver from 'archiver';
import { createWriteStream, createReadStream } from 'fs';
import StreamZip from 'node-stream-zip';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

// 定义__dirname变量（ES模块中没有内置）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 自动更新配置
let updateAvailable = false;
let updateInfo = null;
let downloadProgress = { percent: 0, bytesPerSecond: 0, total: 0, transferred: 0 };
let isDownloading = false;
let autoCheckEnabled = false; // 默认关闭自动检查，等待渲染进程初始化设置

// 保持对主窗口和系统托盘的全局引用
let mainWindow;
let tray = null;
let mainWindowBounds = null; // 主窗口原始大小和位置
let isMiniMode = false; // 画中画模式标志

// 保存窗口状态到文件
async function saveWindowState(isMini, bounds, isAlwaysOnTop) {
  try {
    const userDataPath = app.getPath('userData');
    const statePath = path.join(userDataPath, 'window-state.json');
    
    // 先尝试加载现有状态
    let allState = {
      normalBounds: null,
      miniBounds: null,
      lastMode: isMini ? 'mini' : 'normal',
      isAlwaysOnTop: true, // 默认置顶
      timestamp: Date.now()
    };
    
    try {
      const existingData = await fs.readFile(statePath, 'utf8');
      if (existingData) {
        allState = JSON.parse(existingData);
      }
    } catch (e) {
      // 文件不存在或读取失败，使用默认值
      console.log('窗口状态文件不存在或读取失败，使用默认值');
    }
    
    // 更新当前模式的状态
    const currentBounds = bounds || (mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null);
    if (isMini) {
      allState.miniBounds = currentBounds;
      allState.lastMode = 'mini';
      if (isAlwaysOnTop !== undefined) {
        allState.isAlwaysOnTop = isAlwaysOnTop;
      }
    } else {
      allState.normalBounds = currentBounds;
      allState.lastMode = 'normal';
    }
    allState.timestamp = Date.now();
    
    // 保存所有状态
    await fs.writeFile(statePath, JSON.stringify(allState, null, 2));
    console.log('✅ 窗口状态已保存:', { isMini, bounds: currentBounds, isAlwaysOnTop: allState.isAlwaysOnTop });
  } catch (error) {
    console.error('❌ 保存窗口状态失败:', error);
  }
}

// 从文件加载窗口状态
async function loadWindowState() {
  try {
    const userDataPath = app.getPath('userData');
    const statePath = path.join(userDataPath, 'window-state.json');
    
    try {
      const data = await fs.readFile(statePath, 'utf8');
      if (!data) {
        console.log('窗口状态文件为空');
        return {
          normalBounds: null,
          miniBounds: null,
          lastMode: 'normal',
          isAlwaysOnTop: true
        };
      }
      
      const state = JSON.parse(data);
      console.log('✅ 窗口状态已加载:', state);
      return state;
    } catch (error) {
      console.log('窗口状态文件不存在或读取失败:', error.message);
      return {
        normalBounds: null,
        miniBounds: null,
        lastMode: 'normal',
        isAlwaysOnTop: true
      };
    }
  } catch (error) {
    console.error('❌ 加载窗口状态失败:', error);
    return {
      normalBounds: null,
      miniBounds: null,
      lastMode: 'normal',
      isAlwaysOnTop: true
    };
  }
}

async function createWindow() {
  // 创建浏览器窗口
  const defaultWidth = 1500;
  const defaultHeight = 920;
  
  // 加载保存的窗口状态
  const savedState = await loadWindowState();
  
  let windowOptions = {
    width: defaultWidth,
    height: defaultHeight,
    frame: false, // 无边框窗口
    icon: path.join(__dirname, '../public/app-icon.ico'), // 窗口图标
    titleBarStyle: 'hiddenInset', // 隐藏标题栏但保留窗口控制按钮
    trafficLightPosition: { x: 15, y: 15 }, // macOS窗口按钮位置
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // 使用 CommonJS 版本
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  };
  
  // 如果有保存的大窗口状态，使用保存的位置和大小
  if (savedState.normalBounds) {
    windowOptions.x = savedState.normalBounds.x;
    windowOptions.y = savedState.normalBounds.y;
    windowOptions.width = savedState.normalBounds.width;
    windowOptions.height = savedState.normalBounds.height;
  }
  
  mainWindow = new BrowserWindow(windowOptions);
  
  // 判断是否处于开发模式
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // 开发模式下加载Vite服务器
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式下加载本地HTML文件
    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, '../dist/index.html'),
        protocol: 'file:',
        slashes: true,
      })
    );
  }

  // 窗口关闭时触发（防止程序完全退出，除非明确要求退出）
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      // 保存窗口状态
      saveWindowState(isMiniMode);
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 监听窗口移动和大小变化，自动保存状态
  let resizeTimeout;
  const saveWindowStateDebounced = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      saveWindowState(isMiniMode);
    }, 500); // 500ms 防抖
  };
  
  mainWindow.on('resize', saveWindowStateDebounced);
  mainWindow.on('move', saveWindowStateDebounced);

  // 将窗口状态变化通知渲染进程（用于切换最大化图标等）
  mainWindow.on('maximize', () => {
    if (mainWindow) {
      mainWindow.webContents.send('window:state', { isMaximized: true });
    }
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow) {
      mainWindow.webContents.send('window:state', { isMaximized: false });
    }
  });

  // 完全禁用右键上下文菜单
  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });
}

// 创建系统托盘
function createTray() {
  // 创建托盘图标
  let trayIconPath = path.join(__dirname, '../public/app-icon.ico');

  tray = new Tray(trayIconPath);
  
  // 设置托盘提示文本
  tray.setToolTip('Momentum - 自控力提升工具');
  
  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '设置',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
          // 通知渲染进程打开设置
          mainWindow.webContents.send('open-window-settings');
        } else {
          createWindow();
          // 延迟发送消息，确保窗口完全加载
          setTimeout(() => {
            if (mainWindow) {
              mainWindow.webContents.send('open-window-settings');
            }
          }, 1000);
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  // 设置右键菜单
  tray.setContextMenu(contextMenu);
  
  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// electron-updater自动更新配置
function setupAutoUpdater() {
  // 开发环境也配置自动更新以便测试
  if (process.env.NODE_ENV === 'development') {
    console.log('开发环境，配置自动更新用于测试');
    // 强制启用开发环境更新
    autoUpdater.forceDevUpdateConfig = true;
    // 设置开发环境配置文件路径
    const devConfigPath = path.join(__dirname, '..', 'dev-app-update.yml');
    console.log('开发环境配置文件路径:', devConfigPath);
  }

  // 配置GitHub发布
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'enshulv',
    repo: 'momentum_desktop'
  });

  // 监听更新可用事件
  autoUpdater.on('update-available', (info) => {
    console.log('🎉 electron-updater 发现更新:', info.version);
    console.log('📝 更新信息:', {
      version: info.version,
      releaseDate: info.releaseDate,
      size: info.files?.[0]?.size || 'unknown'
    });
    
    updateAvailable = true;
    updateInfo = {
      version: info.version,
      releaseNotes: info.releaseNotes || '新版本可用',
      downloadUrl: `https://github.com/enshulv/momentum_desktop/releases/tag/v${info.version}`,
      assets: []
    };

    // 检查用户的自动更新设置
      if (autoCheckEnabled) {
        console.log('⚡ 自动更新已开启，开始静默下载...');
        isDownloading = true;
        autoUpdater.downloadUpdate();
        // 通知渲染进程显示下载进度
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('update-available', updateInfo);
        }
      }
      // 当自动更新关闭时，不通知渲染进程
  });

  // 监听更新不可用事件
  autoUpdater.on('update-not-available', (info) => {
    console.log('✅ electron-updater 确认当前已是最新版本');
    console.log('📱 当前版本:', app.getVersion());
    updateAvailable = false;
  });

  // 监听下载进度
  autoUpdater.on('download-progress', (progress) => {
    downloadProgress = {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred
    };
    
    console.log(`📥 下载进度: ${downloadProgress.percent}% (${(progress.transferred / 1024 / 1024).toFixed(1)}MB / ${(progress.total / 1024 / 1024).toFixed(1)}MB)`);
    
    // 通知渲染进程下载进度
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('download-progress', downloadProgress);
    }
  });

  // 监听下载完成
  autoUpdater.on('update-downloaded', (info) => {
    console.log('✅ 更新下载完成!');
    console.log('📦 下载的版本:', info.version);
    isDownloading = false;
    
    // 更新updateInfo为下载完成的信息
    updateInfo = {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      downloadUrl: '',
      assets: []
    };
    
    // 下载完成后，发送update-downloaded事件
    if (mainWindow && mainWindow.webContents) {
      console.log('下载完成，通知渲染进程更新已下载，版本:', info.version);
      mainWindow.webContents.send('update-downloaded', updateInfo);
    }
  });

  // 监听错误
  autoUpdater.on('error', (error) => {
    console.error('❌ electron-updater 错误:', error);
    console.error('🔍 错误详情:', {
      message: error.message,
      stack: error.stack?.split('\n')[0] || 'No stack trace'
    });
    isDownloading = false;
    
    // 通知渲染进程错误
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('update-error', error.message);
    }
  });
}

// 检查更新
async function checkForUpdates() {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 开发环境，启用更新检查用于测试');
      // 开发环境也允许检查更新，但使用特殊配置
    }

    console.log('🔍 开始自动检查更新...');
    console.log('📱 当前应用版本:', app.getVersion());
    console.log('🌐 检查仓库: enshulv/momentum_desktop');
    
    // 添加超时机制，防止网络请求阻塞
    const updateCheckPromise = autoUpdater.checkForUpdates();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('更新检查超时')), 15000); // 15秒超时
    });
    
    await Promise.race([updateCheckPromise, timeoutPromise]);
  } catch (error) {
    console.error('❌ 自动检查更新失败:', error);
    
    // 如果 electron-updater 失败，尝试 GitHub API 作为备用
    try {
      console.log('🔄 尝试使用 GitHub API 作为备用方案...');
      
      // 为GitHub API也添加超时机制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      const response = await fetch('https://api.github.com/repos/enshulv/momentum_desktop/releases/latest', {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Momentum-Desktop-App'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const releaseData = await response.json();
        const latestVersion = releaseData.tag_name.replace('v', '');
        const currentVersion = app.getVersion();
        
        console.log(`📊 版本比较: 当前 v${currentVersion} vs 最新 v${latestVersion}`);
        
        if (isNewerVersion(latestVersion, currentVersion)) {
          console.log('✅ GitHub API 发现新版本:', latestVersion);
          
          updateAvailable = true;
          updateInfo = {
            version: latestVersion,
            releaseNotes: releaseData.body || '新版本可用',
            downloadUrl: releaseData.html_url,
            assets: releaseData.assets || []
          };
          
          // 检查用户的自动更新设置
          if (autoCheckEnabled) {
            console.log('⚡ 自动检查发现更新，开始静默下载...');
            isDownloading = true;
            // 对于GitHub API检测到的更新，我们需要使用electron-updater来下载
            try {
              await autoUpdater.downloadUpdate();
            } catch (error) {
              console.error('下载更新失败:', error);
              isDownloading = false;
            }
            // 通知渲染进程显示下载进度
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('update-available', updateInfo);
            }
          }
          // 当自动更新关闭时，不通知渲染进程
        } else {
          console.log('✅ GitHub API 确认当前已是最新版本');
        }
      }
    } catch (apiError) {
      console.error('❌ GitHub API 备用方案也失败:', apiError);
      // 静默失败，不影响应用正常运行
    }
  }
}

function isNewerVersion(latest, current) {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;
    
    if (latestPart > currentPart) {
      return true;
    } else if (latestPart < currentPart) {
      return false;
    }
  }
  
  return false;
}

// 当Electron完成初始化并准备创建浏览器窗口时调用
app.on('ready', async () => {
  await createWindow();
  createTray();
  
  // 配置自动更新
  setupAutoUpdater();
  
  // 应用启动后根据自动更新设置决定是否检查更新
  setTimeout(() => {
    // 使用Promise.resolve确保异步执行，避免阻塞
    Promise.resolve().then(() => {
      if (autoCheckEnabled) {
        console.log('自动更新已启用，开始启动时的更新检查');
        checkForUpdates().catch(error => {
          console.error('更新检查失败，但不影响应用启动:', error);
        });
      } else {
        console.log('自动更新已关闭，跳过启动时的更新检查');
      }
    });
  }, 15000); // 延长到15秒，确保应用完全启动
  
  console.log('应用启动完成，自动更新配置已启用');
});

// 所有窗口关闭时的处理（因为有系统托盘，所以不自动退出）
app.on('window-all-closed', () => {
  // 除非明确要求退出，否则保持应用运行（因为有系统托盘）
  if (app.isQuiting) {
    app.quit();
  }
  // 在macOS上保持应用活动，在其他平台上也保持运行（托盘模式）
});

app.on('activate', () => {
  // 在macOS上，当点击dock图标且没有其他窗口打开时，通常会再创建一个窗口
  if (mainWindow === null) {
    createWindow();
  }
});

// 可以在这里添加IPC通信处理
ipcMain.on('message', (event, arg) => {
  console.log(arg);
  event.reply('reply', 'Message received');
});

// 添加窗口控制IPC事件处理
ipcMain.on('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) {
    app.isQuiting = true;
    mainWindow.close();
  }
});

// 隐藏到系统托盘
ipcMain.on('window:hide-to-tray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

// 查询窗口当前状态（渲染进程启动时请求一次）
ipcMain.on('window:query-state', (event) => {
  if (mainWindow) {
    event.sender.send('window:state', { isMaximized: mainWindow.isMaximized() });
  }
});

// ========== 画中画模式相关 IPC ==========

// 切换置顶状态
ipcMain.on('window:toggle-always-on-top', async (event, isOnTop) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('🟢 切换置顶状态:', isOnTop);
      mainWindow.setAlwaysOnTop(isOnTop);
      // 保存状态
      const currentBounds = mainWindow.getBounds();
      await saveWindowState(isMiniMode, currentBounds, isOnTop);
    }
  } catch (error) {
    console.error('❌ 切换置顶状态失败:', error);
  }
});

// 进入画中画模式
ipcMain.on('window:enter-mini-mode', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('🟢 进入画中画模式');
      
      // 保存主窗口原始位置和大小（只保存到内存，不保存到文件）
      mainWindowBounds = mainWindow.getBounds();
      console.log('当前大窗口状态:', mainWindowBounds);
      
      isMiniMode = true;
      
      // 加载保存的所有窗口状态
      const savedState = await loadWindowState();
      console.log('加载到的保存状态:', savedState);
      
      let miniWidth = 240;
      let miniHeight = 180;
      let x, y;
      
      // 如果有保存的小窗口状态，使用保存的
      if (savedState.miniBounds) {
        x = savedState.miniBounds.x;
        y = savedState.miniBounds.y;
        miniWidth = savedState.miniBounds.width;
        miniHeight = savedState.miniBounds.height;
        console.log('✅ 使用保存的小窗口状态:', { x, y, width: miniWidth, height: miniHeight });
      } else {
        // 否则计算右下角位置
        x = mainWindowBounds.x + mainWindowBounds.width - miniWidth - 20;
        y = mainWindowBounds.y + 20;
        console.log('使用默认小窗口状态:', { x, y, width: miniWidth, height: miniHeight });
      }
      
      // 设置窗口为画中画大小
      mainWindow.setBounds({
        x,
        y,
        width: miniWidth,
        height: miniHeight
      });
      
      // 设置窗口置顶状态
      const shouldBeOnTop = savedState.isAlwaysOnTop !== undefined ? savedState.isAlwaysOnTop : true;
      mainWindow.setAlwaysOnTop(shouldBeOnTop);
      console.log('置顶状态:', shouldBeOnTop);
      
      console.log('✅ 已进入画中画模式');
      console.log('当前窗口实际大小:', mainWindow.getBounds());
    }
  } catch (error) {
    console.error('❌ 进入画中画模式失败:', error);
  }
});

// 退出画中画模式
ipcMain.on('window:exit-mini-mode', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindowBounds) {
      console.log('🟢 退出画中画模式');
      
      // 先保存当前小窗口的状态到文件
      const currentMiniBounds = mainWindow.getBounds();
      const isOnTop = mainWindow.isAlwaysOnTop();
      console.log('当前小窗口状态:', currentMiniBounds, '置顶:', isOnTop);
      await saveWindowState(true, currentMiniBounds, isOnTop);
      
      // 恢复主窗口原始大小和位置
      console.log('恢复大窗口状态:', mainWindowBounds);
      mainWindow.setBounds(mainWindowBounds);
      
      // 取消置顶
      mainWindow.setAlwaysOnTop(false);
      
      isMiniMode = false;
      
      // 保存大窗口的状态到文件
      await saveWindowState(false, mainWindowBounds, false);
      
      mainWindowBounds = null;
      
      console.log('✅ 已退出画中画模式');
    }
  } catch (error) {
    console.error('❌ 退出画中画模式失败:', error);
  }
});

// 本地数据存储相关IPC处理程序

// 获取默认数据目录路径
ipcMain.handle('storage:get-default-data-path', async () => {
  const documentsPath = path.join(os.homedir(), 'Documents');
  return path.join(documentsPath, 'momentum_data');
});

// 选择数据存储目录
ipcMain.handle('storage:select-data-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择数据存储目录'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 检查目录是否存在
ipcMain.handle('storage:directory-exists', async (event, dirPath) => {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
});

// 创建目录
ipcMain.handle('storage:create-directory', async (event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error('创建目录失败:', error);
    return false;
  }
});

// 读取文件
ipcMain.handle('storage:read-file', async (event, filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // 文件不存在
    }
    throw error;
  }
});

// 写入文件
ipcMain.handle('storage:write-file', async (event, filePath, data) => {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('写入文件失败:', error);
    return false;
  }
});

// 删除文件
ipcMain.handle('storage:delete-file', async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return true; // 文件不存在，视为删除成功
    }
    console.error('删除文件失败:', error);
    return false;
  }
});

// 列出目录内容
ipcMain.handle('storage:list-directory', async (event, dirPath) => {
  try {
    const files = await fs.readdir(dirPath);
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtime
        };
      })
    );
    return fileDetails;
  } catch (error) {
    console.error('读取目录失败:', error);
    return [];
  }
});

// 复制文件
ipcMain.handle('storage:copy-file', async (event, sourcePath, destPath) => {
  try {
    const dir = path.dirname(destPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(sourcePath, destPath);
    return true;
  } catch (error) {
    console.error('复制文件失败:', error);
    return false;
  }
});

// 获取文件统计信息
ipcMain.handle('storage:get-file-stats', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile()
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
});

// 备份和压缩相关IPC处理程序

// 创建ZIP压缩文件
ipcMain.handle('backup:create-zip', async (event, sourceDir, outputPath, excludeFiles = []) => {
  return new Promise((resolve, reject) => {
    try {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // 设置压缩级别
      });

      output.on('close', () => {
        console.log(`ZIP创建完成: ${archive.pointer()} bytes`);
        resolve(true);
      });

      archive.on('error', (err) => {
        console.error('ZIP创建失败:', err);
        reject(false);
      });

      archive.pipe(output);

      // 添加整个目录，但排除指定文件
      archive.glob('**/*', {
        cwd: sourceDir,
        ignore: excludeFiles
      });

      archive.finalize();
    } catch (error) {
      console.error('ZIP创建异常:', error);
      resolve(false);
    }
  });
});

// 解压ZIP文件
ipcMain.handle('backup:extract-zip', async (event, zipPath, outputDir) => {
  try {
    // 确保输出目录存在
    await fs.mkdir(outputDir, { recursive: true });
    
    return new Promise((resolve, reject) => {
      const zip = new StreamZip.async({ file: zipPath });

      zip.extract(null, outputDir)
        .then(() => {
          console.log('ZIP解压完成');
          zip.close();
          resolve(true);
        })
        .catch((err) => {
          console.error('ZIP解压失败:', err);
          zip.close();
          resolve(false);
        });
    });
  } catch (error) {
    console.error('ZIP解压异常:', error);
    return false;
  }
});

// 递归删除目录
async function removeDirectory(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        await removeDirectory(filePath);
      } else {
        await fs.unlink(filePath);
      }
    }
    
    await fs.rmdir(dirPath);
    return true;
  } catch (error) {
    console.error('删除目录失败:', error);
    return false;
  }
}

// 删除目录及其内容
ipcMain.handle('storage:remove-directory', async (event, dirPath) => {
  return await removeDirectory(dirPath);
});

// 更新相关IPC处理程序

// 检查更新状态
ipcMain.handle('update:check-status', () => {
  return {
    updateAvailable,
    updateInfo
  };
});

// 手动检查更新
ipcMain.handle('update:check-manual', async () => {
  try {
    console.log('开始手动检查更新...');
    
    // 首先尝试使用 electron-updater
    if (process.env.NODE_ENV !== 'development') {
      console.log('使用 electron-updater 检查更新...');
      
      // 创建一个 Promise 来等待更新检查结果
      const updateCheckPromise = new Promise((resolve) => {
        let resolved = false;
        
        const onUpdateAvailable = (info) => {
          if (!resolved) {
            resolved = true;
            console.log('electron-updater 发现更新:', info.version);
            if (autoCheckEnabled) {
              console.log('⚡ 手动检查发现更新，开始下载...');
              // 手动检查时总是开始下载
            }
            resolve({ updateAvailable: true, updateInfo });
          }
        };
        
        const onUpdateNotAvailable = () => {
          if (!resolved) {
            resolved = true;
            console.log('electron-updater 未发现更新');
            resolve({ updateAvailable: false, updateInfo: null });
          }
        };
        
        const onError = (error) => {
          if (!resolved) {
            resolved = true;
            console.error('electron-updater 检查失败:', error);
            resolve({ updateAvailable: false, updateInfo: null, error: error.message });
          }
        };
        
        // 临时监听事件
        autoUpdater.once('update-available', onUpdateAvailable);
        autoUpdater.once('update-not-available', onUpdateNotAvailable);
        autoUpdater.once('error', onError);
        
        // 设置超时
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            autoUpdater.removeListener('update-available', onUpdateAvailable);
            autoUpdater.removeListener('update-not-available', onUpdateNotAvailable);
            autoUpdater.removeListener('error', onError);
            console.log('electron-updater 检查超时，尝试备用方案');
            resolve({ updateAvailable: false, updateInfo: null, timeout: true });
          }
        }, 10000); // 10秒超时
        
        // 开始检查
        autoUpdater.checkForUpdates().catch(onError);
      });
      
      const result = await updateCheckPromise;
      
      // 如果 electron-updater 成功，直接返回结果
      if (result.updateAvailable || (!result.timeout && !result.error)) {
        return result;
      }
    }
    
    // 备用方案：直接调用 GitHub API
    console.log('使用 GitHub API 检查更新...');
    const response = await fetch('https://api.github.com/repos/enshulv/momentum_desktop/releases/latest');
    
    if (!response.ok) {
      throw new Error(`GitHub API 请求失败: ${response.status}`);
    }
    
    const releaseData = await response.json();
    const latestVersion = releaseData.tag_name.replace('v', '');
    const currentVersion = app.getVersion();
    
    console.log(`当前版本: v${currentVersion}, 最新版本: v${latestVersion}`);
    
    const hasUpdate = isNewerVersion(latestVersion, currentVersion);
    
    if (hasUpdate) {
      // 更新全局状态
      updateAvailable = true;
      updateInfo = {
        version: latestVersion,
        releaseNotes: releaseData.body || '新版本可用',
        downloadUrl: releaseData.html_url,
        assets: releaseData.assets || []
      };
      
      console.log('GitHub API 发现更新:', latestVersion);
      
      console.log('⚡ 手动检查发现更新，开始下载...');
      
      // 手动检查时总是开始下载
      try {
        await autoUpdater.checkForUpdates();
        // electron-updater会自动处理下载逻辑
      } catch (error) {
        console.error('electron-updater检查更新失败:', error);
        // 如果electron-updater失败，直接通知渲染进程
        if (mainWindow) {
          mainWindow.webContents.send('update-available', updateInfo);
        }
      }
    } else {
      updateAvailable = false;
      updateInfo = null;
      console.log('GitHub API 确认当前已是最新版本');
    }
    
    return {
      updateAvailable: hasUpdate,
      updateInfo: hasUpdate ? updateInfo : null,
      source: 'github-api',
      currentVersion,
      latestVersion
    };
    
  } catch (error) {
    console.error('手动检查更新失败:', error);
    return {
      updateAvailable: false,
      updateInfo: null,
      error: error.message
    };
  }
});

// 开始下载更新
ipcMain.handle('update:download', async () => {
  if (!updateAvailable || !updateInfo) {
    return { success: false, error: '没有可用的更新' };
  }
  
  try {
    if (process.env.NODE_ENV === 'development') {
      // 开发环境模拟下载
      console.log('开发环境，模拟下载更新');
      return { success: true, message: '开发环境模拟下载' };
    }

    console.log('开始下载更新...');
    isDownloading = true;
    await autoUpdater.downloadUpdate();
    
    return { success: true };
  } catch (error) {
    console.error('下载更新失败:', error);
    isDownloading = false;
    return { success: false, error: error.message };
  }
});

// 获取下载状态
ipcMain.handle('update:get-download-status', () => {
  return {
    isDownloading,
    progress: downloadProgress
  };
});

// 安装更新
ipcMain.handle('update:install', () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('开发环境，跳过安装更新');
    return { success: false, error: '开发环境不支持自动安装' };
  }

  try {
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (error) {
    console.error('安装更新失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取应用版本
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// 设置自动检查更新开关
// 获取自动更新设置
ipcMain.handle('update:get-auto-check', () => {
  return autoCheckEnabled;
});

// 设置自动更新
ipcMain.handle('update:set-auto-check', (event, enabled) => {
  autoCheckEnabled = enabled;
  console.log('自动检查更新设置:', enabled ? '开启' : '关闭');
  return { success: true };
});

// 初始化自动更新设置（从渲染进程获取用户偏好）
ipcMain.handle('update:init-auto-check', (event, enabled) => {
  autoCheckEnabled = enabled;
  console.log('初始化自动检查更新设置:', enabled ? '开启' : '关闭');
  return { success: true };
});

// shell 外部链接打开
ipcMain.handle('shell:open-external', async (_event, targetUrl) => {
  try {
    const { shell } = await import('electron');
    await shell.openExternal(targetUrl);
    return true;
  } catch (error) {
    console.error('打开外部链接失败:', error);
    return false;
  }
});

// ===== 测试函数 =====

// 模拟发现更新
ipcMain.handle('test:simulate-update-available', () => {
  console.log('🧪 测试: 模拟发现更新');
  updateAvailable = true;
  updateInfo = {
    version: '1.1.0',
    releaseNotes: '测试版本 - 包含新功能和性能优化\n\n- 添加了自动更新功能\n- 优化了用户界面\n- 修复了若干bug',
    downloadUrl: 'https://github.com/enshulv/momentum_desktop/releases/latest',
    assets: []
  };
  
  // 通知渲染进程
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-available', updateInfo);
  }
  
  return { success: true, message: '已模拟发现更新' };
});

// 模拟下载进度
ipcMain.handle('test:simulate-download-progress', async () => {
  console.log('🧪 测试: 模拟下载进度');
  isDownloading = true;
  
  // 模拟下载进度从0到100%
  for (let percent = 0; percent <= 100; percent += 10) {
    downloadProgress = {
      percent,
      bytesPerSecond: 1024 * 1024 * 2, // 2MB/s
      total: 1024 * 1024 * 50, // 50MB
      transferred: (1024 * 1024 * 50 * percent) / 100
    };
    
    console.log(`📥 下载进度: ${percent}%`);
    
    // 通知渲染进程下载进度
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('download-progress', downloadProgress);
    }
    
    // 等待500ms模拟下载时间
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 下载完成
  isDownloading = false;
  console.log('✅ 模拟下载完成');
  
  // 通知渲染进程下载完成
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-downloaded', updateInfo);
  }
  
  return { success: true, message: '下载模拟完成' };
});

// 模拟下载错误
ipcMain.handle('test:simulate-download-error', () => {
  console.log('🧪 测试: 模拟下载错误');
  isDownloading = false;
  
  // 通知渲染进程错误
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-error', '模拟的下载错误 - 网络连接失败');
  }
  
  return { success: true, message: '已模拟下载错误' };
});

// 强制下载最新版本（模拟低版本触发真实更新逻辑）
ipcMain.handle('test:force-download-latest', async () => {
  console.log('🧪 测试: 强制模拟低版本触发真实更新逻辑');
  
  try {
    // 从GitHub API获取最新版本信息
    const response = await fetch('https://api.github.com/repos/enshulv/momentum_desktop/releases/latest');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const releaseData = await response.json();
    const latestVersion = releaseData.tag_name.replace('v', '');
    
    console.log(`📋 GitHub最新版本: v${latestVersion}`);
    console.log(`🔄 模拟本机版本降级到: v0.0.9`);
    
    // 临时修改app.getVersion()的返回值
    const originalGetVersion = app.getVersion;
    app.getVersion = () => '0.0.9';
    
    // 强制设置为有更新可用
    updateAvailable = true;
    updateInfo = {
      version: latestVersion,
      releaseNotes: releaseData.body || `测试更新: 从 v0.0.9 升级到 v${latestVersion}`,
      downloadUrl: releaseData.html_url,
      assets: releaseData.assets
    };
    
    console.log(`🚀 触发真实更新逻辑: v0.0.9 → v${latestVersion}`);
    
    // 模拟autoUpdater的update-available事件
    if (autoCheckEnabled) {
      console.log('🔽 自动更新已开启，开始静默下载...');
      isDownloading = true;
      
      // 模拟下载过程（使用真实的进度更新）
      setTimeout(async () => {
        console.log('📥 开始模拟真实下载流程...');
        
        // 模拟下载进度
        for (let percent = 0; percent <= 100; percent += 10) {
          downloadProgress = {
            percent,
            bytesPerSecond: 1024 * 1024 * 3, // 3MB/s
            total: 1024 * 1024 * 80, // 80MB
            transferred: (1024 * 1024 * 80 * percent) / 100
          };
          
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('download-progress', downloadProgress);
          }
          
          await new Promise(resolve => setTimeout(resolve, 400));
        }
        
        // 下载完成
        isDownloading = false;
        console.log('✅ 模拟下载完成，现在显示更新横幅');
        
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('update-downloaded', updateInfo);
        }
      }, 1000);
    } else {
      // 如果自动更新关闭，立即显示横幅
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-available', updateInfo);
      }
    }
    
    // 5分钟后恢复原始版本号
    setTimeout(() => {
      app.getVersion = originalGetVersion;
      console.log('🔄 已恢复原始版本号');
    }, 5 * 60 * 1000);
    
    return { 
      success: true, 
      message: `模拟从 v0.0.9 更新到 v${latestVersion}`,
      currentVersion: '0.0.9',
      latestVersion: latestVersion,
      autoDownload: autoCheckEnabled
    };
  } catch (error) {
    console.error('模拟更新失败:', error);
    return { success: false, error: error.message };
  }
});

// 重置更新状态
ipcMain.handle('test:reset-update-state', () => {
  console.log('🧪 测试: 重置更新状态');
  updateAvailable = false;
  updateInfo = null;
  isDownloading = false;
  downloadProgress = { percent: 0, bytesPerSecond: 0, total: 0, transferred: 0 };
  
  return { success: true, message: '更新状态已重置' };
});

// 获取当前测试状态
ipcMain.handle('test:get-status', () => {
  return {
    updateAvailable,
    updateInfo,
    isDownloading,
    downloadProgress
  };
});