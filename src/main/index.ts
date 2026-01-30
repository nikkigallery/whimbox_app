import { BrowserWindow, app, ipcMain } from 'electron'

import { makeAppWithSingleInstanceLock } from 'lib/electron-app/factories/app/instance'
import { makeAppSetup } from 'lib/electron-app/factories/app/setup'
import { loadReactDevtools } from 'lib/electron-app/utils'
import { ENVIRONMENT } from 'shared/constants'
import { waitFor } from 'shared/utils'
import { startAuthServer, stopAuthServer } from './services/auth-server'
import { registerLauncherIpc } from './services/launcher-ipc'
import { MainWindow } from './windows/main'

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
  const window = await makeAppSetup(MainWindow)
  registerLauncherIpc(window)
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
  stopAuthServer()
})
