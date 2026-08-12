import { join } from 'node:path'

import { type BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log/main.js'

import { createWindow } from 'lib/electron-app/factories/windows/create'
import { gameWindowTracker, type GameWindowBounds } from '../services/game-window-tracker'

let mapMaskOverlayWindowRef: BrowserWindow | null = null
let creatingMapMaskOverlayWindowPromise: Promise<BrowserWindow> | null = null
let followGameWindowTimer: ReturnType<typeof setInterval> | null = null
let mapMaskOverlayVisibleRequested = false
let hiddenBecauseGameMinimized = false
let hiddenBecauseGameUnfocused = false
let allowMapMaskOverlayClose = false

const WINDOW_BOUNDS_TOLERANCE_PX = 1

function isHiddenBecauseGameInactive() {
  return hiddenBecauseGameMinimized || hiddenBecauseGameUnfocused
}

function getTrackedBounds(): GameWindowBounds {
  return gameWindowTracker.getBounds()
}

async function refreshTrackedBounds(): Promise<GameWindowBounds> {
  return gameWindowTracker.refresh()
}

async function applyTrackedBounds(win: BrowserWindow) {
  const bounds = await refreshTrackedBounds()

  const shouldHideBecauseMinimized = bounds.isGameWindowFound && bounds.isMinimized
  const shouldHideBecauseUnfocused = !bounds.isGameWindowFound || !bounds.isForeground
  if (shouldHideBecauseMinimized || shouldHideBecauseUnfocused) {
    hiddenBecauseGameMinimized = shouldHideBecauseMinimized
    hiddenBecauseGameUnfocused = shouldHideBecauseUnfocused
    if (win.isVisible()) {
      win.hide()
    }
    return bounds
  }

  const wasHiddenBecauseGameInactive = isHiddenBecauseGameInactive()
  hiddenBecauseGameMinimized = false
  hiddenBecauseGameUnfocused = false
  const nextBounds = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
  const currentBounds = win.getBounds()
  if (
    Math.abs(currentBounds.x - nextBounds.x) > WINDOW_BOUNDS_TOLERANCE_PX ||
    Math.abs(currentBounds.y - nextBounds.y) > WINDOW_BOUNDS_TOLERANCE_PX ||
    Math.abs(currentBounds.width - nextBounds.width) > WINDOW_BOUNDS_TOLERANCE_PX ||
    Math.abs(currentBounds.height - nextBounds.height) > WINDOW_BOUNDS_TOLERANCE_PX
  ) {
    win.setBounds(nextBounds)
  }

  if (wasHiddenBecauseGameInactive && mapMaskOverlayVisibleRequested && !win.isVisible()) {
    win.showInactive()
  }

  return bounds
}

async function bringMapMaskOverlayToFront(win: BrowserWindow) {
  await applyTrackedBounds(win)
  win.setAlwaysOnTop(true, 'normal')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (!isHiddenBecauseGameInactive()) {
    win.showInactive()
  }
}

function startFollowGameWindow() {
  if (followGameWindowTimer) return
  followGameWindowTimer = setInterval(() => {
    const win = mapMaskOverlayWindowRef
    if (!win || win.isDestroyed()) return
    void applyTrackedBounds(win).catch((error) => {
      log.warn(`[map-mask-overlay] failed to follow game window: ${error instanceof Error ? error.message : String(error)}`)
    })
  }, gameWindowTracker.getIntervalMs())
}

function stopFollowGameWindow() {
  if (followGameWindowTimer) {
    clearInterval(followGameWindowTimer)
    followGameWindowTimer = null
  }
}

function setMapMaskOverlayIgnoreMouseEvents(
  ignore: boolean,
) {
  const win = mapMaskOverlayWindowRef
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(ignore)
}

async function ensureMapMaskOverlayWindow() {
  if (mapMaskOverlayWindowRef && !mapMaskOverlayWindowRef.isDestroyed()) {
    return mapMaskOverlayWindowRef
  }
  if (creatingMapMaskOverlayWindowPromise) {
    return creatingMapMaskOverlayWindowPromise
  }
  creatingMapMaskOverlayWindowPromise = createMapMaskOverlayWindow().finally(() => {
    creatingMapMaskOverlayWindowPromise = null
  })
  return creatingMapMaskOverlayWindowPromise
}

function registerMapMaskOverlayIpc() {
  ipcMain.handle('map-mask-overlay:show', async () => {
    const win = await ensureMapMaskOverlayWindow()
    mapMaskOverlayVisibleRequested = true
    setMapMaskOverlayIgnoreMouseEvents(true)
    await bringMapMaskOverlayToFront(win)
    startFollowGameWindow()
    return true
  })

  ipcMain.handle('map-mask-overlay:hide', () => {
    const win = mapMaskOverlayWindowRef
    if (!win || win.isDestroyed()) return false
    mapMaskOverlayVisibleRequested = false
    hiddenBecauseGameMinimized = false
    win.hide()
    hiddenBecauseGameUnfocused = false
    stopFollowGameWindow()
    return true
  })

  ipcMain.handle('map-mask-overlay:get-state', () => ({
    active: mapMaskOverlayVisibleRequested,
  }))

  ipcMain.handle(
    'map-mask-overlay:set-ignore-mouse-events',
    (_event, ignore: boolean) => {
      setMapMaskOverlayIgnoreMouseEvents(ignore)
    },
  )
}

registerMapMaskOverlayIpc()

async function createMapMaskOverlayWindow() {
  const bounds = getTrackedBounds()
  const window = createWindow({
    id: 'map-mask-overlay',
    title: 'Whimbox Map Mask',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 640,
    minHeight: 360,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
    },
  })

  mapMaskOverlayWindowRef = window
  mapMaskOverlayVisibleRequested = false
  hiddenBecauseGameMinimized = false
  allowMapMaskOverlayClose = false
  hiddenBecauseGameUnfocused = false
  window.setIgnoreMouseEvents(true)
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  window.on('show', () => {
    if (!isHiddenBecauseGameInactive()) {
      mapMaskOverlayVisibleRequested = true
    }
    startFollowGameWindow()
  })

  window.on('hide', () => {
    if (!mapMaskOverlayVisibleRequested || !isHiddenBecauseGameInactive()) {
      stopFollowGameWindow()
    }
  })

  window.on('close', (event) => {
    if (allowMapMaskOverlayClose) return
    event.preventDefault()
    window.hide()
  })

  window.on('closed', () => {
    stopFollowGameWindow()
    mapMaskOverlayWindowRef = null
  })

  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve())
  })

  return window
}

export function persistMapMaskOverlayState() {
  allowMapMaskOverlayClose = true
  mapMaskOverlayVisibleRequested = false
  stopFollowGameWindow()
  const win = mapMaskOverlayWindowRef
  if (win && !win.isDestroyed()) {
    win.destroy()
  }
  mapMaskOverlayWindowRef = null
}
