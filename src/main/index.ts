import { BrowserWindow, app, ipcMain } from 'electron'

import { makeAppWithSingleInstanceLock } from 'lib/electron-app/factories/app/instance'
import { makeAppSetup } from 'lib/electron-app/factories/app/setup'
import { loadReactDevtools } from 'lib/electron-app/utils'
import { ENVIRONMENT } from 'shared/constants'
import { waitFor } from 'shared/utils'
import { startAuthServer, stopAuthServer } from './services/auth-server'
import { configureLogFile, registerAppLogger } from './services/app-logger'
import { backendManager } from './services/backend-manager'
import { ensurePythonEnvironment, registerLauncherIpc } from './services/launcher-ipc'
import { registerAppUpdater, unregisterAppUpdater } from './services/updater'
import { pythonManager } from './services/python-manager'
import { registerRpcBridge, stopRpcBridge, waitForRpcConnected } from './services/rpc-bridge'
import { createTray, destroyTray } from './services/tray'
import { registerConversationBridge } from './services/conversation-bridge'
import { MainWindow } from './windows/main'
import { OverlayWindow } from './windows/overlay'
import { SplashWindow } from './windows/splash'
import log from 'electron-log/main.js'

if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('disable-features', 'RendererCodeIntegrity')
}

let primaryWindow: BrowserWindow | null = null

app.on('second-instance', () => {
  const targetWindow =
    (primaryWindow && !primaryWindow.isDestroyed() ? primaryWindow : BrowserWindow.getAllWindows()[0]) ??
    null

  if (!targetWindow) return
  if (targetWindow.isMinimized()) targetWindow.restore()
  if (!targetWindow.isVisible()) targetWindow.show()
  targetWindow.focus()
})

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
  configureLogFile()
  log.info(`[startup] Whimbox App version=${app.getVersion()} mode=${ENVIRONMENT.IS_DEV ? 'dev' : 'prod'}`,)

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

  let backendStarted = false
  if (result.ok) {
    splashWindow.webContents.send('splash:python-progress', {
      stage: 'ensure-done',
      message: result.message,
    })

    const backendStatus = backendManager.getBackendStatus()
    const skipLaunchInDev = ENVIRONMENT.IS_DEV
    if (skipLaunchInDev && !splashWindow.isDestroyed() && splashWindow.webContents) {
      splashWindow.webContents.send('splash:python-progress', {
        stage: 'ensure-done',
        message: '开发模式：请手动启动后端',
      })
    }
    if (
      backendStatus.installed &&
      backendStatus.entryPoint &&
      !skipLaunchInDev
    ) {
      try {
        if (!splashWindow.isDestroyed() && splashWindow.webContents) {
          splashWindow.webContents.send('splash:python-progress', {
            stage: 'starting-backend',
            message: '正在启动奇想盒…',
          })
        }
        await backendManager.launchBackend()
        backendStarted = true
      } catch (err) {
        console.error('启动奇想盒失败:', err)
        const message = err instanceof Error ? err.message : '奇想盒启动失败'
        if (!splashWindow.isDestroyed() && splashWindow.webContents) {
          splashWindow.webContents.send('splash:python-progress', {
            stage: 'backend-start-error',
            message,
          })
        }
      }
    }
  } else {
    splashWindow.webContents.send('splash:python-progress', {
      stage: 'ensure-error',
      message: result.message,
    })
  }

  // 提前注册 RPC 并连接；若已启动后台则等待 RPC 连接成功后再进主界面
  registerRpcBridge()
  if (backendStarted) {
    if (!splashWindow.isDestroyed() && splashWindow.webContents) {
      splashWindow.webContents.send('splash:python-progress', {
        stage: 'waiting-rpc',
        message: '奇想盒启动中…',
      })
    }
    // 方案 A：后端进程提前退出时立即结束等待，不卡满 30 秒
    const backendExitPromise = new Promise<boolean>((resolve) => {
      backendManager.once('launch-backend-end', () => resolve(false))
    })
    const connected = await Promise.race([
      waitForRpcConnected(30_000),
      backendExitPromise,
    ])
    if (connected && !splashWindow.isDestroyed() && splashWindow.webContents) {
      splashWindow.webContents.send('splash:python-progress', {
        stage: 'setup-complete',
        message: '奇想盒启动完成',
      })
    } else if (!splashWindow.isDestroyed() && splashWindow.webContents) {
      // 方案 B：RPC 超时或后端提前退出时明确提示失败
      splashWindow.webContents.send('splash:python-progress', {
        stage: 'backend-unavailable',
        message: '奇想盒未能启动，请稍后重试',
      })
    }
  }

  await waitFor(600)
  splashWindow.close()

  const window = await makeAppSetup(MainWindow)
  primaryWindow = window
  const overlayWindow = await OverlayWindow()
  void overlayWindow

  registerConversationBridge(window)
  createTray(window)
  ipcMain.handle('window:minimize-to-tray', () => {
    if (window && !window.isDestroyed()) {
      window.hide()
    }
  })

  registerAppLogger()
  registerLauncherIpc(window)
  registerAppUpdater(window)
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
  primaryWindow = null
  destroyTray()
  stopAuthServer()
  stopRpcBridge()
  unregisterAppUpdater()
})
