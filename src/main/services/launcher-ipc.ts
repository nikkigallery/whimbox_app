import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'

import { backendManager } from './backend-manager'
import { downloader } from './downloader'
import type { DownloadProgress } from './downloader'
import { getAuthPort } from './auth-server'
import { clearAuth, getAuthState as getStoredAuthState, getRefreshToken } from './auth-store'
import { apiRequest, completeLogin, getAnnouncements } from './launcher-api'
import { pythonManager } from './python-manager'
import { scriptManager } from './script-manager'

type TaskProgressPayload = {
  status: string
  title?: string
  message?: string
  progress?: number
  error?: string
}

let initialized = false

function sendTaskProgress(win: BrowserWindow, payload: TaskProgressPayload) {
  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send('launcher:task-progress', payload)
  }
}

function lastLine(output: string | undefined): string {
  if (!output || !output.trim()) return '正在安装…'
  const line = output.trim().split(/\r?\n/).pop()?.trim()
  return line || '正在安装…'
}

/**
 * 统一执行 whl 安装流程并向前端发送进度（下载阶段可选，安装阶段按输出次数累加 0.25，超过 100 归零）。
 */
async function runWhlInstallWithProgress(
  win: BrowserWindow,
  title: string,
  options: {
    initialMessage: string
    withDownload: boolean
    work: () => Promise<unknown>
  },
): Promise<unknown> {
  const { initialMessage, withDownload, work } = options
  let installProgress = 0

  sendTaskProgress(win, {
    status: 'running',
    title,
    message: initialMessage,
    progress: withDownload ? undefined : 0,
  })

  const onDownloadProgress = (p: DownloadProgress) =>
    sendTaskProgress(win, { status: 'running', title, message: '正在下载…', progress: p.progress })

  const onInstallStart = () => {
    installProgress = 0
    sendTaskProgress(win, { status: 'running', title, message: '正在安装…', progress: 0 })
  }

  const onInstallProgress = (data: { output?: string }) => {
    installProgress += 0.25
    if (installProgress > 100) installProgress = 0
    sendTaskProgress(win, {
      status: 'running',
      title,
      message: lastLine(data.output),
      progress: installProgress,
    })
  }

  if (withDownload) {
    downloader.on('progress', onDownloadProgress)
  }
  pythonManager.once('install-start', onInstallStart)
  pythonManager.on('install-progress', onInstallProgress)

  try {
    const result = await work()
    sendTaskProgress(win, { status: 'success', title, message: '安装完成' })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendTaskProgress(win, { status: 'error', title, error: message })
    throw err
  } finally {
    if (withDownload) {
      downloader.off('progress', onDownloadProgress)
    }
    pythonManager.off('install-start', onInstallStart)
    pythonManager.off('install-progress', onInstallProgress)
  }
}

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

  ipcMain.handle('launcher:refresh-auth', async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      window.webContents.send('launcher:auth-state', null)
      return
    }
    try {
      await completeLogin(refreshToken, window)
    } catch {
      window.webContents.send('launcher:auth-state', null)
    }
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

  ipcMain.handle('launcher:install-whl', async (_, wheelPath: string, deleteWheel = true) =>
    runWhlInstallWithProgress(window, '安装后端', {
      initialMessage: '正在安装…',
      withDownload: false,
      work: () => backendManager.installWhl(wheelPath, deleteWheel),
    }),
  )

  ipcMain.handle('launcher:download-and-install-whl', async (_, url: string, md5?: string) =>
    runWhlInstallWithProgress(window, '更新后端', {
      initialMessage: '准备下载…',
      withDownload: true,
      work: () => backendManager.downloadAndInstallWhl(url, md5),
    }),
  )

  ipcMain.handle('launcher:download-and-install-latest-whl', async () => {
    const data = await apiRequest<{ version: string; url: string; md5?: string }>('/whimbox/latest/backend', {
      method: 'GET',
      requireAuth: true,
    })
    if (!data?.url) {
      throw new Error('未获取到更新地址')
    }
    return runWhlInstallWithProgress(window, '更新后端', {
      initialMessage: '准备下载…',
      withDownload: true,
      work: () => backendManager.downloadAndInstallWhl(data.url, data.md5),
    })
  })

  ipcMain.handle('launcher:get-backend-status', () => backendManager.getBackendStatus())
  ipcMain.handle('launcher:launch-backend', () => backendManager.launchBackend())
  ipcMain.handle('launcher:stop-backend', () => backendManager.stopBackend())
  ipcMain.handle('launcher:get-app-version', () => app.getVersion())
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

  backendManager.on('launch-backend-status', (data) => {
    window.webContents.send('launcher:launch-backend-status', data)
  })

  backendManager.on('launch-backend-end', (data) => {
    window.webContents.send('launcher:launch-backend-end', data)
  })

  // 主窗口不再在此做 Python 环境准备，由启动屏在显示主窗口前完成
}

/**
 * 确保 Python 环境存在：先检测，未安装则自动搭建。
 * 不向任何窗口发送消息，进度由调用方通过 pythonManager 事件或本函数返回值处理。
 */
export async function ensurePythonEnvironment(): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await pythonManager.detectPythonEnvironment()
    if (result.installed) {
      return { ok: true, message: 'Python 环境已就绪' }
    }
    await pythonManager.setupEmbeddedPython()
    return { ok: true, message: 'Python 环境准备完成' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message }
  }
}
