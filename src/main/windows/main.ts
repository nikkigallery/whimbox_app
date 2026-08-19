import { BrowserWindow } from 'electron'
import windowStateKeeper from 'electron-window-state'
import { join } from 'node:path'

import { createWindow } from 'lib/electron-app/factories/windows/create'
import { ENVIRONMENT } from 'shared/constants'
import { displayName } from '~/package.json'

export async function MainWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1100,
    defaultHeight: 750,
    file: 'main-window-state.json',
    maximize: true,
    fullScreen: false,
  })

  const window = createWindow({
    id: 'main',
    title: displayName,
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    center: false,
    movable: true,
    resizable: true,
    frame: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,

    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  mainWindowState.manage(window)

  window.webContents.on('did-finish-load', () => {
    if (ENVIRONMENT.IS_DEV) {
      window.webContents.openDevTools({ mode: 'detach' })
    }

    window.show()
  })

  window.on('close', () => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.destroy()
    }
  })

  return window
}
