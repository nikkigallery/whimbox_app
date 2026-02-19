import { join } from 'node:path'

import { BrowserWindow, ipcMain, screen } from 'electron'
import windowStateKeeper from 'electron-window-state'

import { createWindow } from 'lib/electron-app/factories/windows/create'

const BALL_SIZE = 48
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
      return { x: 0, y: 0, width: BALL_SIZE, height: BALL_SIZE }
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
    const b = win.getBounds()
    const ballX = b.x + b.width - BALL_SIZE
    const ballY = b.y + b.height - BALL_SIZE
    win.setBounds({ x: ballX, y: ballY, width: BALL_SIZE, height: BALL_SIZE })
    scheduleSaveOverlayState(win)
    win.show()
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('overlay:shown-as-ball')
    }
  })
}

registerOverlayIpc()

/** 半透明小窗，用于展示消息和发送消息（与主窗口共享同一 RPC 会话） */
export async function OverlayWindow() {
  const overlayState = windowStateKeeper({
    defaultWidth: BALL_SIZE,
    defaultHeight: BALL_SIZE,
    file: 'overlay-window-state.json',
    maximize: false,
    fullScreen: false,
  })

  const workArea = screen.getPrimaryDisplay().workArea
  const x =
    overlayState.x !== undefined
      ? overlayState.x
      : workArea.x + workArea.width - BALL_SIZE - MARGIN
  const y =
    overlayState.y !== undefined
      ? overlayState.y
      : workArea.y + workArea.height * 0.65
  const width = overlayState.width
  const height = overlayState.height

  const window = createWindow({
    id: 'overlay',
    title: '奇想盒 - 悬浮窗',
    x,
    y,
    width,
    height,
    minWidth: BALL_SIZE,
    minHeight: BALL_SIZE,
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

  // 关闭时只隐藏不销毁，便于主界面「重新显示悬浮球」再次显示
  window.on('close', (e) => {
    e.preventDefault()
    window.hide()
  })

  window.on('closed', () => {
    overlayWindowRef = null
  })

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  window.webContents.on('did-finish-load', () => {
    window.show()
  })

  return window
}
