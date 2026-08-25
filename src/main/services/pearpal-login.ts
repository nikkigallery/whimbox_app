import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  type WebContents,
} from 'electron'
import log from 'electron-log/main.js'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { sendRpcRequest } from './rpc-bridge'

const LOGIN_URL = 'https://myl.nuanpaper.com/tools/map'
const LOGIN_HOST = 'myl.nuanpaper.com'
const LOGIN_PARTITION = 'persist:whimbox-pearpal-login'
const STORAGE_POLL_INTERVAL_MS = 400

const READ_LOGIN_STORAGE_SCRIPT = `
(() => {
  if (location.hostname !== '${LOGIN_HOST}') return null
  return {
    momoToken: localStorage.getItem('momoToken') || '',
    momoNid: localStorage.getItem('momoNid') || ''
  }
})()
`

type PearPalLoginStorage = {
  momoToken: string
  momoNid: string
}

let loginWindowRef: BrowserWindow | null = null
let loginPromise: Promise<unknown> | null = null

function isAllowedNavigation(url: string) {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function isLoginPage(contents: WebContents) {
  try {
    return new URL(contents.getURL()).hostname === LOGIN_HOST
  } catch {
    return false
  }
}

function loginWebPreferences() {
  return {
    partition: LOGIN_PARTITION,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  }
}

function configureNavigation(contents: WebContents, owner: BrowserWindow) {
  contents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedNavigation(url)) return { action: 'deny' }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: owner,
        autoHideMenuBar: true,
        webPreferences: loginWebPreferences(),
      },
    }
  })
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  })
  contents.on('did-create-window', childWindow => {
    configureNavigation(childWindow.webContents, childWindow)
  })
}

function createLoginWindow(
  parent: BrowserWindow
): Promise<PearPalLoginStorage> {
  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({
      title: '奇想盒 - 美鸭梨登录',
      width: 1100,
      height: 760,
      minWidth: 800,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      parent: parent.isDestroyed() ? undefined : parent,
      webPreferences: loginWebPreferences(),
    })
    loginWindowRef = window

    let settled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const cleanup = () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    const finish = (credentials: PearPalLoginStorage) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(credentials)
      if (!window.isDestroyed()) window.destroy()
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
      if (!window.isDestroyed()) window.destroy()
    }

    const readLoginStorage = async () => {
      if (settled || window.isDestroyed() || !isLoginPage(window.webContents))
        return
      try {
        const value = (await window.webContents.executeJavaScript(
          READ_LOGIN_STORAGE_SCRIPT,
          true
        )) as Partial<PearPalLoginStorage> | null
        if (
          typeof value?.momoToken === 'string' &&
          value.momoToken.length > 0 &&
          typeof value.momoNid === 'string' &&
          value.momoNid.length > 0
        ) {
          finish({ momoToken: value.momoToken, momoNid: value.momoNid })
        }
      } catch (error) {
        log.debug(
          `[pearpal-login] local storage is not ready: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    configureNavigation(window.webContents, window)
    window.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return
        fail(
          new Error(
            `美鸭梨登录页面加载失败：${errorDescription} (${errorCode})`
          )
        )
      }
    )
    window.webContents.on('did-finish-load', () => {
      void readLoginStorage()
    })
    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) window.show()
    })
    window.once('closed', () => {
      cleanup()
      if (loginWindowRef === window) loginWindowRef = null
      if (!settled) {
        settled = true
        reject(new Error('用户关闭了美鸭梨登录窗口'))
      }
    })

    pollTimer = setInterval(
      () => void readLoginStorage(),
      STORAGE_POLL_INTERVAL_MS
    )
    void window.loadURL(LOGIN_URL).catch(error => {
      fail(
        new Error(
          `无法打开美鸭梨登录页面：${error instanceof Error ? error.message : String(error)}`
        )
      )
    })
  })
}

async function openAndAuthenticate(parent: BrowserWindow) {
  if (loginPromise) {
    const window = loginWindowRef
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
    return loginPromise
  }

  loginPromise = (async () => {
    const credentials = await createLoginWindow(parent)
    return sendRpcRequest('map_mask.submit_pearpal_login', {
      momo_token: credentials.momoToken,
      momo_nid: credentials.momoNid,
    })
  })().finally(() => {
    loginPromise = null
  })
  return loginPromise
}

async function clearLoginInformation() {
  const window = loginWindowRef
  if (window && !window.isDestroyed()) window.destroy()

  const loginSession = session.fromPartition(LOGIN_PARTITION)
  await loginSession.clearStorageData()
  await loginSession.clearCache()

  // Remove the profile used by the retired Python WebView implementation.
  const localAppData =
    process.env.LOCALAPPDATA || join(app.getPath('home'), 'AppData', 'Local')
  const legacyStoragePath = join(localAppData, 'Whimbox', 'pearpal-webview')
  await rm(legacyStoragePath, { recursive: true, force: true }).catch(error => {
    log.warn(
      `[pearpal-login] failed to remove legacy storage: ${error instanceof Error ? error.message : String(error)}`
    )
  })

  return sendRpcRequest('map_mask.clear_pearpal_login')
}

export function registerPearPalLoginIpc(parent: BrowserWindow) {
  ipcMain.handle('pearpal-login:open', () => openAndAuthenticate(parent))
  ipcMain.handle('pearpal-login:clear', () => clearLoginInformation())
}

export function unregisterPearPalLoginIpc() {
  ipcMain.removeHandler('pearpal-login:open')
  ipcMain.removeHandler('pearpal-login:clear')
  const window = loginWindowRef
  if (window && !window.isDestroyed()) window.destroy()
  loginWindowRef = null
}
