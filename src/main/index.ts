import { BrowserWindow, app, ipcMain } from 'electron'

import { makeAppWithSingleInstanceLock } from 'lib/electron-app/factories/app/instance'
import { makeAppSetup } from 'lib/electron-app/factories/app/setup'
import { loadReactDevtools } from 'lib/electron-app/utils'
import { ENVIRONMENT } from 'shared/constants'
import { waitFor } from 'shared/utils'
import { startAuthServer, stopAuthServer } from './services/auth-server'
import { registerAppLogger } from './services/app-logger'
import { ensurePythonEnvironment, registerLauncherIpc } from './services/launcher-ipc'
import { registerAppUpdater, unregisterAppUpdater } from './services/updater'
import { pythonManager } from './services/python-manager'
import { registerRpcBridge, stopRpcBridge } from './services/rpc-bridge'
import { createTray, destroyTray } from './services/tray'
import { MainWindow } from './windows/main'
import { OverlayWindow } from './windows/overlay'
import { SplashWindow } from './windows/splash'

function forwardPythonProgressTo(splashWindow: BrowserWindow) {
  const send = (stage: string, message: string) => {
    if (!splashWindow.isDestroyed() && splashWindow.webContents) {
      splashWindow.webContents.send('splash:python-progress', { stage, message })
    }
  }
  const onSetupStart = (data: { message: string }) => send('setup-start', data.message)
  const onExtractProgress = (data: { message: string }) => send('extract-progress', data.message)
  const onExtractComplete = (data: { message: string }) => send('extract-complete', data.message)
  const onSetupComplete = (data: { message: string }) => send('setup-complete', data.message)
  const onSpeedTestProgress = (data: { message: string }) =>
    send('speed-test-progress', data.message)
  const onSpeedTestComplete = (data: { message: string }) =>
    send('speed-test-complete', data.message)

  pythonManager.on('setup-start', onSetupStart)
  pythonManager.on('extract-progress', onExtractProgress)
  pythonManager.on('extract-complete', onExtractComplete)
  pythonManager.on('setup-complete', onSetupComplete)
  pythonManager.on('speed-test-progress', onSpeedTestProgress)
  pythonManager.on('speed-test-complete', onSpeedTestComplete)

  return () => {
    pythonManager.off('setup-start', onSetupStart)
    pythonManager.off('extract-progress', onExtractProgress)
    pythonManager.off('extract-complete', onExtractComplete)
    pythonManager.off('setup-complete', onSetupComplete)
    pythonManager.off('speed-test-progress', onSpeedTestProgress)
    pythonManager.off('speed-test-complete', onSpeedTestComplete)
  }
}

makeAppWithSingleInstanceLock(async () => {
  ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return false

    if (window.isMaximized()) {
      window.unmaximize()
      return false
    }

    window.maximize()
    return true
  })

  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  await app.whenReady()

  const splashWindow = await SplashWindow()
  await new Promise<void>((resolve) => {
    splashWindow.webContents.once('did-finish-load', () => resolve())
  })

  splashWindow.webContents.send('splash:python-progress', {
    stage: 'detecting',
    message: '正在检测 Python 环境…',
  })

  const removeForward = forwardPythonProgressTo(splashWindow)
  const result = await ensurePythonEnvironment()
  removeForward()

  if (result.ok) {
    splashWindow.webContents.send('splash:python-progress', {
      stage: 'ensure-done',
      message: result.message,
    })
  } else {
    splashWindow.webContents.send('splash:python-progress', {
      stage: 'ensure-error',
      message: result.message,
    })
  }

  await waitFor(600)
  splashWindow.close()

  const window = await makeAppSetup(MainWindow)
  await OverlayWindow()

  createTray(window)
  ipcMain.handle('window:minimize-to-tray', () => {
    if (window && !window.isDestroyed()) {
      window.hide()
    }
  })

  registerAppLogger()
  registerLauncherIpc(window)
  registerAppUpdater(window)
  registerRpcBridge()
  try {
    await startAuthServer(window)
  } catch (error) {
    console.error('启动认证服务器失败:', error)
  }

  if (ENVIRONMENT.IS_DEV) {
    await loadReactDevtools()
    /* This trick is necessary to get the new
      React Developer Tools working at app initial load.
      Otherwise, it only works on manual reload.
    */
    window.webContents.once('devtools-opened', async () => {
      await waitFor(1000)
      window.webContents.reload()
    })
  }
})

app.on('before-quit', () => {
  destroyTray()
  stopAuthServer()
  stopRpcBridge()
  unregisterAppUpdater()
})
