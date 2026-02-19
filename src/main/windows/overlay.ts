import { join } from 'node:path'

import { BrowserWindow, ipcMain, screen } from 'electron'
import windowStateKeeper from 'electron-window-state'

import { createWindow } from 'lib/electron-app/factories/windows/create'

const PANEL_DEFAULT_WIDTH = 420
const PANEL_DEFAULT_HEIGHT = 360
const MARGIN = 16

let overlayWindowRef: BrowserWindow | null = null
let overlayWindowState: ReturnType<typeof windowStateKeeper> | null = null
let overlaySaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSaveOverlayState(win: BrowserWindow) {
  if (overlaySaveTimer) clearTimeout(overlaySaveTimer)
  overlaySaveTimer = setTimeout(() => {
    overlaySaveTimer = null
    if (overlayWindowState && win && !win.isDestroyed()) {
      overlayWindowState.saveState(win)
    }
  }, 300)
}

function registerOverlayIpc() {
  ipcMain.handle(
    'overlay:set-ignore-mouse-events',
    (event, ignore: boolean) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.setIgnoreMouseEvents(ignore, { forward: true })
      }
    },
  )
  ipcMain.handle('overlay:set-position', (event, x: number, y: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.setPosition(x, y)
      scheduleSaveOverlayState(win)
    }
  })
  ipcMain.handle('overlay:get-bounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed())
      return { x: 0, y: 0, width: PANEL_DEFAULT_WIDTH, height: PANEL_DEFAULT_HEIGHT }
    return win.getBounds() as { x: number; y: number; width: number; height: number }
  })
  ipcMain.handle(
    'overlay:set-bounds',
    (event, x: number, y: number, width: number, height: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.setBounds({ x, y, width, height })
        scheduleSaveOverlayState(win)
      }
    },
  )
  ipcMain.handle(
    'overlay:set-bounds-no-save',
    (event: Electron.IpcMainInvokeEvent, x: number, y: number, width: number, height: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.setBounds({ x, y, width, height })
      }
    },
  )
  ipcMain.handle('overlay:hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) win.hide()
  })
  ipcMain.handle('overlay:show', () => {
    const win = overlayWindowRef
    if (!win || win.isDestroyed()) return
    win.show()
  })
}

registerOverlayIpc()

export function getOverlayWindow() {
  return overlayWindowRef
}

/** 半透明小窗，用于展示消息和发送消息（与主窗口共享同一 RPC 会话）；仅当游戏窗口出现时由后端通知显示。 */
export async function OverlayWindow() {
  const overlayState = windowStateKeeper({
    defaultWidth: PANEL_DEFAULT_WIDTH,
    defaultHeight: PANEL_DEFAULT_HEIGHT,
    file: 'overlay-window-state.json',
    maximize: false,
    fullScreen: false,
  })

  const workArea = screen.getPrimaryDisplay().workArea
  const x =
    overlayState.x !== undefined
      ? overlayState.x
      : workArea.x + workArea.width - PANEL_DEFAULT_WIDTH - MARGIN
  const y =
    overlayState.y !== undefined
      ? overlayState.y
      : workArea.y + workArea.height * 0.65
  const width = overlayState.width ?? PANEL_DEFAULT_WIDTH
  const height = overlayState.height ?? PANEL_DEFAULT_HEIGHT

  const window = createWindow({
    id: 'overlay',
    title: '奇想盒 - 悬浮窗',
    x,
    y,
    width,
    height,
    minWidth: 260,
    minHeight: 330,
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

  overlayState.manage(window)
  overlayWindowState = overlayState
  overlayWindowRef = window

  // 关闭时只隐藏不销毁，由 event.game_window.visible 或用户操作再次显示
  window.on('close', (e) => {
    e.preventDefault()
    window.hide()
  })

  window.on('closed', () => {
    overlayWindowRef = null
  })

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 不在此处 show()，仅当后端通知游戏窗口出现时由 rpc-bridge 显示

  return window
}
