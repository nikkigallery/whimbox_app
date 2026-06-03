import { BrowserWindow, app, ipcMain, dialog, systemPreferences, desktopCapturer } from 'electron'

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
import { OverlayWindow, persistOverlayState } from './windows/overlay'
import { SplashWindow } from './windows/splash'
import { persistVideoOverlayState, unregisterVideoOverlayShortcuts } from './windows/video-overlay'
import { getPythonEnvironmentService } from './services/platform/pythonEnvironmentServiceFactory'
import log from 'electron-log/main.js'

if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('disable-features', 'RendererCodeIntegrity')
}

async function checkMacPermissions() {
  if (process.platform !== 'darwin') return true

  const needsAccessibility = !systemPreferences.isTrustedAccessibilityClient(false)
  const needsScreen = systemPreferences.getMediaAccessStatus('screen') !== 'granted'

  if (!needsAccessibility && !needsScreen) {
    return true
  }

  let msg = '奇想盒需要以下 macOS 系统权限才能正常运行：\n\n'
  if (needsAccessibility) msg += '• 辅助功能 (监听游戏内全局快捷键和鼠标点击)\n'
  if (needsScreen) msg += '• 屏幕录制 (识别游戏画面并执行任务)\n'
  msg += '\n请在接下来弹出的系统设置中，允许奇想盒控制您的电脑并录制屏幕。\n(授权完成后，系统会提示您“退出并重新打开”应用)'

  await dialog.showMessageBox({
    type: 'warning',
    title: '需要系统权限',
    message: msg,
    buttons: ['去授权']
  })

  if (needsAccessibility) {
    systemPreferences.isTrustedAccessibilityClient(true)
  }
  if (needsScreen) {
    try {
      await desktopCapturer.getSources({ types: ['screen'] })
    } catch (e) {}
  }

  await dialog.showMessageBox({
    type: 'info',
    title: '等待授权',
    message: '正在等待您在系统设置中完成授权...\n\n授权完成后，请在系统弹窗中点击“退出并重新打开”。',
    buttons: ['退出奇想盒']
  }).then(() => {
    app.exit(0)
  })

  await new Promise(() => {}) 
  return false
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
  await checkMacPermissions()

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
    const skipLaunchInDev = ENVIRONMENT.IS_DEV && getPythonEnvironmentService().shouldSkipLaunchInDev()
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
      waitForRpcConnected(120_000),
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
  persistOverlayState()
  persistVideoOverlayState()
  unregisterVideoOverlayShortcuts()
  primaryWindow = null
  destroyTray()
  stopAuthServer()
  stopRpcBridge()
  unregisterAppUpdater()
})
