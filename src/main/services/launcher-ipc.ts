import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'

import { appManager } from './app-manager'
import { downloader } from './downloader'
import { getAuthPort } from './auth-server'
import { apiRequest, getAnnouncements } from './launcher-api'
import { pythonManager } from './python-manager'

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
    (_, endpoint: string, options: { method?: string; data?: Record<string, unknown>; accessToken?: string }) =>
      apiRequest(endpoint, options),
  )

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
