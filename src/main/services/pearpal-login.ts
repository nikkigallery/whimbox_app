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

const STORAGE_POLL_INTERVAL_MS = 400

type PearPalRegion = 'cn' | 'oversea'

type PearPalLoginConfig = {
  label: string
  url: string
  host: string
  partition: string
}

const LOGIN_CONFIGS: Record<PearPalRegion, PearPalLoginConfig> = {
  cn: {
    label: '国服/B服',
    url: 'https://myl.nuanpaper.com/tools/map',
    host: 'myl.nuanpaper.com',
    // Keep the existing partition so current users stay signed in.
    partition: 'persist:whimbox-pearpal-login',
  },
  oversea: {
    label: '国际服',
    url: 'https://pearpal.infoldgames.com/tools/map',
    host: 'pearpal.infoldgames.com',
    partition: 'persist:whimbox-pearpal-login-oversea',
  },
}

type PearPalLoginStorage = {
  momoToken: string
  momoNid: string
}

let loginWindowRef: BrowserWindow | null = null
let loginPromise: Promise<unknown> | null = null
let loginRegion: PearPalRegion | null = null

function parseRegion(value: unknown): PearPalRegion {
  if (value === 'cn' || value === 'oversea') return value
  throw new Error('不支持的美鸭梨区服')
}

function readLoginStorageScript(host: string) {
  return `
(() => {
  if (location.hostname !== ${JSON.stringify(host)}) return null
  return {
    momoToken: localStorage.getItem('momoToken') || '',
    momoNid: localStorage.getItem('momoNid') || ''
  }
})()
`
}

function isAllowedNavigation(url: string) {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function isLoginPage(contents: WebContents, host: string) {
  try {
    return new URL(contents.getURL()).hostname === host
  } catch {
    return false
  }
}

function loginWebPreferences(partition: string) {
  return {
    partition,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  }
}

function configureNavigation(
  contents: WebContents,
  owner: BrowserWindow,
  partition: string
) {
  contents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedNavigation(url)) return { action: 'deny' }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: owner,
        autoHideMenuBar: true,
        webPreferences: loginWebPreferences(partition),
      },
    }
  })
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  })
  contents.on('did-create-window', childWindow => {
    configureNavigation(childWindow.webContents, childWindow, partition)
  })
}

function createLoginWindow(
  parent: BrowserWindow,
  config: PearPalLoginConfig
): Promise<PearPalLoginStorage> {
  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({
      title: `奇想盒 - 美鸭梨${config.label}登录`,
      width: 1100,
      height: 760,
      minWidth: 800,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      parent: parent.isDestroyed() ? undefined : parent,
      webPreferences: loginWebPreferences(config.partition),
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
      if (
        settled ||
        window.isDestroyed() ||
        !isLoginPage(window.webContents, config.host)
      )
        return
      try {
        const value = (await window.webContents.executeJavaScript(
          readLoginStorageScript(config.host),
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

    configureNavigation(window.webContents, window, config.partition)
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
    void window.loadURL(config.url).catch(error => {
      fail(
        new Error(
          `无法打开美鸭梨登录页面：${error instanceof Error ? error.message : String(error)}`
        )
      )
    })
  })
}

async function openAndAuthenticate(
  parent: BrowserWindow,
  regionValue: unknown
) {
  const region = parseRegion(regionValue)
  if (loginPromise) {
    if (loginRegion !== region) {
      throw new Error('请先完成或关闭当前区服的美鸭梨登录窗口')
    }
    const window = loginWindowRef
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
    return loginPromise
  }

  loginRegion = region
  loginPromise = (async () => {
    const credentials = await createLoginWindow(parent, LOGIN_CONFIGS[region])
    return sendRpcRequest('map_mask.submit_pearpal_login', {
      region,
      momo_token: credentials.momoToken,
      momo_nid: credentials.momoNid,
    })
  })().finally(() => {
    loginPromise = null
    loginRegion = null
  })
  return loginPromise
}

async function clearLoginInformation(regionValue: unknown) {
  const region = parseRegion(regionValue)
  const window = loginWindowRef
  if (loginRegion === region && window && !window.isDestroyed()) window.destroy()

  const loginSession = session.fromPartition(LOGIN_CONFIGS[region].partition)
  await loginSession.clearStorageData()
  await loginSession.clearCache()

  // Remove the profile used by the retired Python WebView implementation.
  if (region === 'cn') {
    const localAppData =
      process.env.LOCALAPPDATA || join(app.getPath('home'), 'AppData', 'Local')
    const legacyStoragePath = join(localAppData, 'Whimbox', 'pearpal-webview')
    await rm(legacyStoragePath, { recursive: true, force: true }).catch(error => {
      log.warn(
        `[pearpal-login] failed to remove legacy storage: ${error instanceof Error ? error.message : String(error)}`
      )
    })
  }

  return sendRpcRequest('map_mask.clear_pearpal_login', { region })
}

export function registerPearPalLoginIpc(parent: BrowserWindow) {
  ipcMain.handle('pearpal-login:open', (_event, region) =>
    openAndAuthenticate(parent, region)
  )
  ipcMain.handle('pearpal-login:clear', (_event, region) =>
    clearLoginInformation(region)
  )
}

export function unregisterPearPalLoginIpc() {
  ipcMain.removeHandler('pearpal-login:open')
  ipcMain.removeHandler('pearpal-login:clear')
  const window = loginWindowRef
  if (window && !window.isDestroyed()) window.destroy()
  loginWindowRef = null
  loginRegion = null
}
