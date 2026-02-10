import { ipcMain, type BrowserWindow } from 'electron'
import pkg from 'electron-updater'

const { autoUpdater } = pkg

import { ENVIRONMENT } from 'shared/constants'

export type AppUpdateState = {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'installing'
    | 'up-to-date'
    | 'error'
  message: string
  version?: string
  /** 用于「手动更新」时打开的下载/发布页 */
  url?: string
  /** 下载进度：已下载字节数（仅 downloading 时有） */
  transferred?: number
  /** 下载进度：总字节数（仅 downloading 时有） */
  total?: number
}

const IPC_CHANNEL_STATE = 'app:update-state'

function sendState(window: BrowserWindow | null, state: AppUpdateState) {
  if (window && !window.isDestroyed() && window.webContents) {
    window.webContents.send(IPC_CHANNEL_STATE, state)
  }
}

let mainWindow: BrowserWindow | null = null
/** 最近一次检测到的更新信息，用于「手动更新」打开下载页 */
let lastUpdateDownloadUrl: string | null = null

export function registerAppUpdater(window: BrowserWindow) {
  mainWindow = window

  if (ENVIRONMENT.IS_DEV) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
  }

  autoUpdater.on('checking-for-update', () => {
    sendState(mainWindow, { status: 'checking', message: '正在检查更新…' })
  })

  autoUpdater.on('update-available', (info) => {
    const raw = info as unknown as { download?: string }
    const downloadUrl = typeof raw.download === 'string' ? raw.download : null
    if (downloadUrl) lastUpdateDownloadUrl = downloadUrl
    sendState(mainWindow, {
      status: 'available',
      message: `发现新版本 ${info.version}，可点击「立即更新」下载。`,
      version: info.version,
      url: downloadUrl ?? undefined,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    sendState(mainWindow, {
      status: 'up-to-date',
      message: info.version ? `当前已是最新版本（${info.version}）` : '当前已是最新版本',
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent)
    const { transferred = 0, total = 0 } = progress
    sendState(mainWindow, {
      status: 'downloading',
      message: total > 0 ? `正在下载… ${percent}%` : '正在下载…',
      transferred,
      total,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    sendState(mainWindow, {
      status: 'installing',
      message: '新版本已下载，请点击「重启并安装」完成更新。',
    })
  })

  autoUpdater.on('error', (err) => {
    sendState(mainWindow, {
      status: 'error',
      message: err?.message ?? String(err) ?? '检查更新时出错',
    })
  })

  ipcMain.handle('app:check-for-updates', async () => {
    if (ENVIRONMENT.IS_DEV) {
      sendState(mainWindow, {
        status: 'up-to-date',
        message: '开发环境下不检查应用更新。',
      })
      return
    }
    try {
      sendState(mainWindow, { status: 'checking', message: '正在检查更新…' })
      const result = await autoUpdater.checkForUpdates()
      if (result == null) {
        sendState(mainWindow, { status: 'up-to-date', message: '当前已是最新版本' })
      }
    } catch (e) {
      sendState(mainWindow, {
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

  ipcMain.handle('app:download-and-install-update', async () => {
    if (ENVIRONMENT.IS_DEV) {
      sendState(mainWindow, { status: 'error', message: '开发环境下无法安装更新。' })
      return
    }
    try {
      await autoUpdater.downloadUpdate()
    } catch (e) {
      sendState(mainWindow, {
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })

  ipcMain.handle('app:quit-and-install', () => {
    if (ENVIRONMENT.IS_DEV) return
    autoUpdater.quitAndInstall(false, true)
  })

  ipcMain.handle('app:get-manual-update-url', () => {
    return lastUpdateDownloadUrl
  })
}

export function unregisterAppUpdater() {
  mainWindow = null
}
