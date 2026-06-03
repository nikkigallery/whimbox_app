import { join } from 'node:path'

import { BrowserWindow, globalShortcut, ipcMain } from 'electron'
import log from 'electron-log/main.js'
import windowStateKeeper from 'electron-window-state'

import { createWindow } from 'lib/electron-app/factories/windows/create'
import {
  getVideoOverlayState,
  setVideoOverlayState,
  type VideoOverlayPlaybackCommand,
} from '../services/video-overlay-store'
import { getMonitorService } from '../services/platform/monitorServiceFactory'

const PANEL_DEFAULT_WIDTH = 520
const PANEL_DEFAULT_HEIGHT = 320
const PANEL_MIN_WIDTH = 320
const PANEL_MIN_HEIGHT = 180
const MARGIN = 20

let videoOverlayWindowRef: BrowserWindow | null = null
let videoOverlayWindowState: ReturnType<typeof windowStateKeeper> | null = null
let videoOverlaySaveTimer: ReturnType<typeof setTimeout> | null = null
let videoOverlayShortcutsRegistered = false
let registeredAccelerators: string[] = []
let creatingVideoOverlayWindowPromise: Promise<BrowserWindow> | null = null

function logStateSaved(win: BrowserWindow, reason: string) {
  const { x, y, width, height } = win.getBounds()
  log.info(`[video-overlay] state saved reason=${reason} x=${x} y=${y} width=${width} height=${height}`)
}

function scheduleSaveState(win: BrowserWindow) {
  if (videoOverlaySaveTimer) clearTimeout(videoOverlaySaveTimer)
  videoOverlaySaveTimer = setTimeout(() => {
    videoOverlaySaveTimer = null
    if (videoOverlayWindowState && !win.isDestroyed()) {
      videoOverlayWindowState.saveState(win)
      logStateSaved(win, 'debounced')
    }
  }, 300)
}

function saveStateNow(reason: string, win?: BrowserWindow | null) {
  if (videoOverlaySaveTimer) {
    clearTimeout(videoOverlaySaveTimer)
    videoOverlaySaveTimer = null
  }
  const target = win ?? videoOverlayWindowRef
  if (videoOverlayWindowState && target && !target.isDestroyed()) {
    videoOverlayWindowState.saveState(target)
    logStateSaved(target, reason)
  }
}

function getAllReceivers(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())
}

function broadcastState() {
  const state = getVideoOverlayState()
  for (const window of getAllReceivers()) {
    window.webContents.send('video-overlay:state', state)
  }
}

function showVideoOverlayWindow() {
  const win = videoOverlayWindowRef
  if (!win || win.isDestroyed()) return
  win.setOpacity(getVideoOverlayState().opacity)
  win.setAlwaysOnTop(true, 'normal')
  setVideoOverlayState({ visible: true })
  broadcastState()
  win.showInactive()
}

function destroyVideoOverlayWindow(win?: BrowserWindow | null) {
  const target = win ?? videoOverlayWindowRef
  if (!target || target.isDestroyed()) return
  saveStateNow('destroy', target)
  setVideoOverlayState({ visible: false })
  broadcastState()
  target.destroy()
}

function executePlaybackCommand(command: VideoOverlayPlaybackCommand) {
  const win = videoOverlayWindowRef
  if (!win || win.isDestroyed()) return
  win.webContents.send('video-overlay:playback-command', command)
}

export function setVideoOverlayIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }) {
  const win = videoOverlayWindowRef
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(ignore, options)
}

function registerPlaybackShortcuts() {
  if (videoOverlayShortcutsRegistered) {
    for (const accelerator of registeredAccelerators) {
      globalShortcut.unregister(accelerator)
    }
    registeredAccelerators = []
    videoOverlayShortcutsRegistered = false
  }

  const state = getVideoOverlayState()
  const mappings: Array<[string, VideoOverlayPlaybackCommand]> = [
    [state.playPauseKey, 'toggle_play'],
    [state.seekForwardKey, 'seek_forward'],
    [state.seekBackwardKey, 'seek_backward'],
  ]

  const seen = new Set<string>()
  for (const [accelerator, command] of mappings) {
    if (!accelerator || seen.has(accelerator)) continue
    seen.add(accelerator)
    const ok = globalShortcut.register(accelerator, () => {
      executePlaybackCommand(command)
    })
    if (!ok) {
      log.warn(`[video-overlay] failed to register shortcut: ${accelerator}`)
      continue
    }
    registeredAccelerators.push(accelerator)
  }
  videoOverlayShortcutsRegistered = true
}

function registerVideoOverlayIpc() {
  ipcMain.handle('video-overlay:get-bounds', () => {
    const win = videoOverlayWindowRef
    if (!win || win.isDestroyed()) {
      return { x: 0, y: 0, width: PANEL_DEFAULT_WIDTH, height: PANEL_DEFAULT_HEIGHT }
    }
    return win.getBounds()
  })

  ipcMain.handle(
    'video-overlay:set-ignore-mouse-events',
    (_event, ignore: boolean, options?: { forward?: boolean }) => {
      setVideoOverlayIgnoreMouseEvents(ignore, options)
    },
  )

  ipcMain.handle('video-overlay:set-bounds', (_event, x: number, y: number, width: number, height: number) => {
    const win = videoOverlayWindowRef
    if (!win || win.isDestroyed()) return
    win.setBounds({ x, y, width, height })
    scheduleSaveState(win)
  })

  ipcMain.handle('video-overlay:show', async () => {
    const win = await ensureVideoOverlayWindow()
    showVideoOverlayWindow()
    return Boolean(win && !win.isDestroyed())
  })

  ipcMain.handle('video-overlay:hide', () => {
    destroyVideoOverlayWindow()
  })

  ipcMain.handle('video-overlay:get-state', () => {
    return getVideoOverlayState()
  })

  ipcMain.handle('video-overlay:set-state', (_event, patch: Record<string, unknown>) => {
    const win = videoOverlayWindowRef
    const next = setVideoOverlayState(patch)
    if (win && !win.isDestroyed()) {
      win.setOpacity(next.opacity)
      if (typeof patch.visible === 'boolean') {
        if (patch.visible) showVideoOverlayWindow()
        else destroyVideoOverlayWindow(win)
      }
    }
    if (win && !win.isDestroyed()) {
      registerPlaybackShortcuts()
    }
    broadcastState()
    return getVideoOverlayState()
  })

  ipcMain.handle('video-overlay:navigate', (_event, url: string) => {
    const next = setVideoOverlayState({ url })
    const win = videoOverlayWindowRef
    if (win && !win.isDestroyed()) {
      win.webContents.send('video-overlay:navigate', next.url)
    }
    broadcastState()
    return next
  })

  ipcMain.handle('video-overlay:execute-playback-command', (_event, command: VideoOverlayPlaybackCommand) => {
    executePlaybackCommand(command)
  })

  ipcMain.handle('video-overlay:focus-input', () => {
    const win = videoOverlayWindowRef
    if (!win || win.isDestroyed()) return
    win.focus()
    win.webContents.send('video-overlay:focus-input')
  })
}

registerVideoOverlayIpc()

export function persistVideoOverlayState() {
  saveStateNow('before-quit')
}

export function unregisterVideoOverlayShortcuts() {
  for (const accelerator of registeredAccelerators) {
    globalShortcut.unregister(accelerator)
  }
  registeredAccelerators = []
  videoOverlayShortcutsRegistered = false
}

async function ensureVideoOverlayWindow() {
  if (videoOverlayWindowRef && !videoOverlayWindowRef.isDestroyed()) {
    return videoOverlayWindowRef
  }
  if (creatingVideoOverlayWindowPromise) {
    return creatingVideoOverlayWindowPromise
  }
  creatingVideoOverlayWindowPromise = createVideoOverlayWindow().finally(() => {
    creatingVideoOverlayWindowPromise = null
  })
  return creatingVideoOverlayWindowPromise
}

async function createVideoOverlayWindow() {
  const overlayState = windowStateKeeper({
    defaultWidth: PANEL_DEFAULT_WIDTH,
    defaultHeight: PANEL_DEFAULT_HEIGHT,
    file: 'video-overlay-window-state.json',
    maximize: false,
    fullScreen: false,
  })

  const workArea = getMonitorService().getActiveDisplayWorkArea()
  const width = overlayState.width ?? PANEL_DEFAULT_WIDTH
  const height = overlayState.height ?? PANEL_DEFAULT_HEIGHT
  const x = overlayState.x ?? (workArea.x + workArea.width - width - MARGIN)
  const y = overlayState.y ?? (workArea.y + MARGIN)

  const window = createWindow({
    id: 'video-overlay',
    title: '奇想盒 - 视频悬浮窗',
    x,
    y,
    width,
    height,
    minWidth: PANEL_MIN_WIDTH,
    minHeight: PANEL_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: process.platform !== 'darwin',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
      webviewTag: true,
    },
  })

  overlayState.manage(window)
  videoOverlayWindowState = overlayState
  videoOverlayWindowRef = window

  const state = getVideoOverlayState()
  window.setOpacity(state.opacity)

  window.on('move', () => {
    scheduleSaveState(window)
  })

  window.on('resize', () => {
    scheduleSaveState(window)
  })

  window.on('show', () => {
    setVideoOverlayState({ visible: true })
    broadcastState()
  })

  window.on('hide', () => {
    setVideoOverlayState({ visible: false })
    broadcastState()
  })

  window.on('close', (event) => {
    event.preventDefault()
    destroyVideoOverlayWindow(window)
  })

  window.on('closed', () => {
    if (videoOverlaySaveTimer) {
      clearTimeout(videoOverlaySaveTimer)
      videoOverlaySaveTimer = null
    }
    unregisterVideoOverlayShortcuts()
    videoOverlayWindowState = null
    videoOverlayWindowRef = null
  })

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  registerPlaybackShortcuts()

  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => {
      resolve()
    })
  })

  broadcastState()
  if (state.url) {
    window.webContents.send('video-overlay:navigate', state.url)
  }

  return window
}

export async function VideoOverlayWindow() {
  return ensureVideoOverlayWindow()
}
