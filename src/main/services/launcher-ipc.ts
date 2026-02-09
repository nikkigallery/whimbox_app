import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'

import { appManager } from './app-manager'
import { downloader } from './downloader'
import { getAuthPort } from './auth-server'
import { clearAuth, getAuthState as getStoredAuthState } from './auth-store'
import { apiRequest, getAnnouncements } from './launcher-api'
import { pythonManager } from './python-manager'
import { scriptManager } from './script-manager'

let initialized = false

export function registerLauncherIpc(window: BrowserWindow) {
  if (initialized) return
  initialized = true

  ipcMain.on('launcher:open-external', (_, url: string) => {
    if (url) {
      shell.openExternal(url)
    }
  })

  ipcMain.handle('launcher:get-auth-port', () => getAuthPort())

  ipcMain.handle('launcher:get-auth-state', () => {
    const state = getStoredAuthState()
    return state ? { user: state.user } : null
  })

  ipcMain.handle('launcher:logout', () => {
    clearAuth()
    window.webContents.send('launcher:auth-state', null)
  })

  ipcMain.handle('launcher:detect-python', () => pythonManager.detectPythonEnvironment())
  ipcMain.handle('launcher:setup-python', () => pythonManager.setupEmbeddedPython())

  ipcMain.handle('launcher:select-whl-file', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: '选择 whl 安装包',
      filters: [
        { name: 'Python Wheel 包', extensions: ['whl'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('launcher:install-whl', async (_, wheelPath: string, deleteWheel = true) => {
    return appManager.installWhl(wheelPath, deleteWheel)
  })

  ipcMain.handle('launcher:download-and-install-whl', async (_, url: string, md5?: string) => {
    return appManager.downloadAndInstallWhl(url, md5)
  })

  ipcMain.handle('launcher:get-app-status', () => appManager.getAppStatus())
  ipcMain.handle('launcher:launch-app', () => appManager.launchApp())
  ipcMain.handle('launcher:stop-app', () => appManager.stopApp())
  ipcMain.handle('launcher:get-app-version', () => app.getVersion())
  ipcMain.handle('launcher:open-logs-folder', () => appManager.openLogsFolder())
  ipcMain.handle('launcher:get-announcements', () => getAnnouncements())
  ipcMain.handle(
    'launcher:api-request',
    (
      _,
      endpoint: string,
      options: {
        method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
        data?: Record<string, unknown>
        requireAuth?: boolean
      },
    ) => apiRequest(endpoint, options),
  )

  scriptManager.on('progress', (payload: { status: string; title?: string; message?: string; progress?: number; error?: string }) => {
    window.webContents.send('launcher:task-progress', payload)
  })

  ipcMain.handle('launcher:sync-subscribed-scripts', async (_, scriptsData: { scripts: Array<{ name: string; md5: string }> }) => {
    try {
      return await scriptManager.updateSubscribedScripts(scriptsData)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.webContents.send('launcher:task-progress', { status: 'error', title: '同步订阅脚本', error: message })
      throw err
    }
  })

  ipcMain.handle('launcher:download-script', async (_, item: { name: string; md5: string }) => {
    try {
      await scriptManager.downloadScript(item)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.webContents.send('launcher:task-progress', { status: 'error', title: '下载脚本', error: message })
      throw err
    }
  })

  ipcMain.handle('launcher:delete-script', (_, md5: string) => {
    scriptManager.deleteScript(md5)
  })

  downloader.on('progress', (progress) => {
    window.webContents.send('launcher:download-progress', progress)
  })

  pythonManager.on('install-progress', (data) => {
    window.webContents.send('launcher:install-progress', data)
  })

  pythonManager.on('setup-start', (data) => {
    window.webContents.send('launcher:python-setup', { stage: 'setup-start', message: data.message })
  })

  pythonManager.on('extract-progress', (data) => {
    window.webContents.send('launcher:python-setup', { stage: 'extract-progress', message: data.message })
  })

  pythonManager.on('extract-complete', (data) => {
    window.webContents.send('launcher:python-setup', { stage: 'extract-complete', message: data.message })
  })

  pythonManager.on('setup-complete', (data) => {
    window.webContents.send('launcher:python-setup', { stage: 'setup-complete', message: data.message })
  })

  pythonManager.on('speed-test-progress', (data) => {
    window.webContents.send('launcher:python-setup', {
      stage: 'speed-test-progress',
      message: data.message,
    })
  })

  pythonManager.on('speed-test-complete', (data) => {
    window.webContents.send('launcher:python-setup', {
      stage: 'speed-test-complete',
      message: data.message,
    })
  })

  appManager.on('launch-app-status', (data) => {
    window.webContents.send('launcher:launch-app-status', data)
  })

  appManager.on('launch-app-end', (data) => {
    window.webContents.send('launcher:launch-app-end', data)
  })
}
