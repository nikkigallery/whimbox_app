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
let suppressAutoShowAfterManualClose = false

function bringOverlayToFront(win: BrowserWindow) {
  win.setAlwaysOnTop(true, 'normal')
  // win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.showInactive()
  win.moveTop()
}

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
    if (win && !win.isDestroyed()) {
      suppressAutoShowAfterManualClose = true
      win.hide()
    }
  })
  ipcMain.handle('overlay:show', () => {
    const win = overlayWindowRef
    if (!win || win.isDestroyed()) return
    suppressAutoShowAfterManualClose = false
    bringOverlayToFront(win)
  })
}

registerOverlayIpc()

export function getOverlayWindow() {
  return overlayWindowRef
}

/** 工具启动时自动显示小窗；若用户手动关闭过则不自动显示。 */
export function showOverlayOnToolStart() {
  const win = overlayWindowRef
  if (!win || win.isDestroyed()) return
  if (suppressAutoShowAfterManualClose) return
  bringOverlayToFront(win)
}

/** 手动停止工具时强制显示小窗，不受“手动关闭后不自动显示”策略限制。 */
export function forceShowOverlay() {
  const win = overlayWindowRef
  if (!win || win.isDestroyed()) return
  suppressAutoShowAfterManualClose = false
  bringOverlayToFront(win)
}

export function setOverlayIgnoreMouseEvents(ignore: boolean) {
  const win = overlayWindowRef
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(ignore, { forward: true })
}

/** 半透明小窗，用于展示消息和发送消息（与主窗口共享同一 RPC 会话）。 */
export async function OverlayWindow() {
  const overlayState = windowStateKeeper({
    defaultWidth: PANEL_DEFAULT_WIDTH,
    defaultHeight: PANEL_DEFAULT_HEIGHT,
    file: 'overlay-window-state.json',
    maximize: false,
    fullScreen: false,
  })

  const workArea = screen.getPrimaryDisplay().workArea
  const width = overlayState.width ?? PANEL_DEFAULT_WIDTH
  const height = overlayState.height ?? PANEL_DEFAULT_HEIGHT
  const x =
    overlayState.x !== undefined
      ? overlayState.x
      : workArea.x + MARGIN
  const y =
    overlayState.y !== undefined
      ? overlayState.y
      : workArea.y + workArea.height - height - MARGIN

  const window = createWindow({
    id: 'overlay',
    title: '奇想盒 - 小窗',
    x,
    y,
    width,
    height,
    minWidth: 200,
    minHeight: 250,
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

  // 关闭时只隐藏不销毁；视为手动关闭并抑制后续自动弹窗
  window.on('close', (e) => {
    e.preventDefault()
    suppressAutoShowAfterManualClose = true
    window.hide()
  })

  window.on('closed', () => {
    overlayWindowRef = null
  })

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 不在此处 show()，由用户手动打开或工具启动事件触发显示

  return window
}
