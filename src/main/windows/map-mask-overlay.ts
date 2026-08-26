import { join } from 'node:path'

import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log/main.js'

import { createWindow } from 'lib/electron-app/factories/windows/create'
import { gameWindowTracker, type GameWindowBounds } from '../services/game-window-tracker'
import { sendRpcRequest } from '../services/rpc-bridge'

let mapMaskOverlayWindowRef: BrowserWindow | null = null
let creatingMapMaskOverlayWindowPromise: Promise<BrowserWindow> | null = null
let followGameWindowTimer: ReturnType<typeof setInterval> | null = null
let mapMaskOverlayVisibleRequested = false
let hiddenBecauseGameMinimized = false
let hiddenBecauseGameUnfocused = false
let allowMapMaskOverlayClose = false
let lastOverlayGeometryLogSignature: string | null = null

const WINDOW_BOUNDS_TOLERANCE_PX = 1

function setMapMaskOverlayActive(active: boolean) {
  if (mapMaskOverlayVisibleRequested === active) return
  mapMaskOverlayVisibleRequested = active
  const state = { active }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('map-mask-overlay:state-changed', state)
    }
  }
}

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
  logOverlayGeometryIfChanged(win, bounds, nextBounds)

  if (wasHiddenBecauseGameInactive && mapMaskOverlayVisibleRequested && !win.isVisible()) {
    win.showInactive()
  }

  return bounds
}

function logOverlayGeometryIfChanged(
  win: BrowserWindow,
  tracked: GameWindowBounds,
  targetBounds: { x: number; y: number; width: number; height: number },
) {
  const overlayBounds = win.getBounds()
  const contentBounds = win.getContentBounds()
  const signature = JSON.stringify({
    targetBounds,
    overlayBounds,
    contentBounds,
    physicalBounds: tracked.physicalBounds,
    gameDpi: tracked.gameDpi,
    gameDpiScale: tracked.gameDpiScale,
    displayId: tracked.displayId,
    displayScaleFactor: tracked.displayScaleFactor,
  })
  if (signature === lastOverlayGeometryLogSignature) return
  lastOverlayGeometryLogSignature = signature
  log.info(
    '[map-mask-overlay] geometry ' +
      `game_physical=${formatBounds(tracked.physicalBounds)} ` +
      `game_dpi=${formatNumber(tracked.gameDpi)} ` +
      `game_dpi_scale=${formatNumber(tracked.gameDpiScale)} ` +
      `display_id=${tracked.displayId ?? 'n/a'} ` +
      `display_scale=${formatNumber(tracked.displayScaleFactor)} ` +
      `target_dip=${formatBounds(targetBounds)} ` +
      `overlay_dip=${formatBounds(overlayBounds)} ` +
      `content_dip=${formatBounds(contentBounds)}`,
  )
}

function formatNumber(value: number | undefined) {
  return value === undefined ? 'n/a' : String(value)
}

function formatBounds(
  bounds: { x: number; y: number; width: number; height: number } | undefined,
) {
  if (!bounds) return 'n/a'
  return `${bounds.x},${bounds.y},${bounds.width}x${bounds.height}`
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
    const state = await sendRpcRequest<{ enabled: boolean }>(
      'map_mask.set_enabled',
      { enabled: true },
    )
    if (!state.enabled) {
      throw new Error('前台自动化任务运行期间无法打开地图遮罩')
    }
    try {
      const win = await ensureMapMaskOverlayWindow()
      setMapMaskOverlayActive(true)
      setMapMaskOverlayIgnoreMouseEvents(true)
      await bringMapMaskOverlayToFront(win)
      startFollowGameWindow()
      return true
    } catch (error) {
      await sendRpcRequest('map_mask.set_enabled', { enabled: false }).catch(() => {})
      throw error
    }
  })

  ipcMain.handle('map-mask-overlay:hide', async () => {
    await sendRpcRequest('map_mask.set_enabled', { enabled: false })
    const win = mapMaskOverlayWindowRef
    if (!win || win.isDestroyed()) return false
    setMapMaskOverlayActive(false)
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
  lastOverlayGeometryLogSignature = null
  setMapMaskOverlayActive(false)
  hiddenBecauseGameMinimized = false
  allowMapMaskOverlayClose = false
  hiddenBecauseGameUnfocused = false
  window.setIgnoreMouseEvents(true)
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  window.on('show', () => {
    if (!isHiddenBecauseGameInactive()) {
      setMapMaskOverlayActive(true)
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
    setMapMaskOverlayActive(false)
    stopFollowGameWindow()
    lastOverlayGeometryLogSignature = null
    mapMaskOverlayWindowRef = null
  })

  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve())
  })

  return window
}

export function persistMapMaskOverlayState() {
  allowMapMaskOverlayClose = true
  setMapMaskOverlayActive(false)
  stopFollowGameWindow()
  const win = mapMaskOverlayWindowRef
  if (win && !win.isDestroyed()) {
    win.destroy()
  }
  mapMaskOverlayWindowRef = null
  lastOverlayGeometryLogSignature = null
}
