import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import { join } from 'node:path'
import { initDb, closeDb } from './db'
import { initMedia, registerMediaProtocol, registerMediaScheme } from './media'
import { registerIpc } from './ipc'
import { onModelStatus } from './modelManager'
import { broadcastModelStatus, broadcastHarnessState } from './events'
import { onHarnessState, stopHarness } from './dshRunner'

// 单实例
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

registerMediaScheme()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: true
    }
  })

  win.on('ready-to-show', () => win.show())

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建页面', accelerator: 'CmdOrCtrl+N', click: () => void sendAction('new-page') },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize', label: '最小化' }, { role: 'zoom', label: '缩放' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** 菜单/快捷键 → 渲染进程动作 */
function sendAction(action: string): void {
  const win = BrowserWindow.getAllWindows()[0]
  win?.webContents.send('app:action', action)
}

app.whenReady().then(() => {
  // 允许渲染进程使用系统定位(Geolocation API)
  const { session } = require('electron')
  session.defaultSession.setPermissionRequestHandler((_wc: Electron.WebContents, permission: string, callback: (allowed: boolean) => void) => {
    if (permission === 'geolocation') {
      callback(true) // 允许定位,macOS 会弹系统权限框
    } else {
      callback(true) // 其他权限也允许(麦克风、通知等)
    }
  })

  initDb()
  initMedia()
  registerMediaProtocol()
  registerIpc()
  onModelStatus(broadcastModelStatus)
  onHarnessState(broadcastHarnessState)
  setupMenu()
  createWindow()

  // 崩溃诊断日志
  app.on('child-process-gone', (_e, details) => {
    console.error(`[crash] 子进程退出 type=${details.type} reason=${details.reason} code=${details.exitCode}`)
  })
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error(`[crash] 渲染进程崩溃 reason=${details.reason} code=${details.exitCode}`)
    })
    win.webContents.on('unresponsive', () => console.error('[crash] 页面无响应'))
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) console.error('[renderer]', String(message).slice(0, 300))
    })
    win.webContents.on('did-attach-webview', (_e, contents) => {
      contents.on('render-process-gone', (_e2, details) => {
        console.error(`[crash] webview 渲染崩溃 reason=${details.reason} code=${details.exitCode}`)
      })
      contents.on('console-message', (_e2, level, message) => {
        if (level >= 2) console.error('[dsh-webview]', String(message).slice(0, 300))
      })
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopHarness()
  closeDb()
})
