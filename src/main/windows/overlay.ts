import { join } from 'node:path'

import { createWindow } from 'lib/electron-app/factories/windows/create'
import { registerRoute } from 'lib/electron-router-dom'

/** 半透明小窗，用于展示消息和发送消息（与主窗口共享同一 RPC 会话） */
export async function OverlayWindow() {
  const window = createWindow({
    id: 'overlay',
    title: '奇想盒 - 悬浮窗',
    width: 420,
    height: 360,
    minWidth: 320,
    minHeight: 280,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
    },
  })

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  window.webContents.on('did-finish-load', () => {
    window.show()
  })

  return window
}
