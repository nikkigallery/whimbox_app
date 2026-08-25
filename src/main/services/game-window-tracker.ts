import { screen } from 'electron'
import log from 'electron-log/main.js'

import { sendRpcRequest } from './rpc-bridge'

export type GameWindowBounds = {
  x: number
  y: number
  width: number
  height: number
  isGameWindowFound: boolean
  isForeground: boolean
  isMinimized: boolean
  coordinateSource?: 'physical-screen-to-dip' | 'legacy-dip'
  physicalBounds?: WindowRectangle
  gameDpi?: number
  gameDpiScale?: number
  displayId?: number
  displayScaleFactor?: number
  displayBounds?: WindowRectangle
}

type WindowRectangle = {
  x: number
  y: number
  width: number
  height: number
}

type NativeWindowLookupResult = {
  found?: boolean
  coordinateSpace?: 'physical' | 'dip' | string
  x?: number
  y?: number
  width?: number
  height?: number
  dpi?: number
  dpiScale?: number
  isForeground?: boolean
  isMinimized?: boolean
}

const DEFAULT_TRACKER_INTERVAL_MS = 100
const INITIAL_BOUNDS: GameWindowBounds = {
  x: 0,
  y: 0,
  width: 1280,
  height: 720,
  isGameWindowFound: false,
  isForeground: false,
  isMinimized: false,
}

class GameWindowTracker {
  private currentBounds = INITIAL_BOUNDS
  private refreshPromise: Promise<GameWindowBounds> | null = null
  private lastLookupWarning: string | null = null
  private lastGeometryLogSignature: string | null = null

  getBounds(): GameWindowBounds {
    return this.currentBounds
  }

  getIntervalMs(): number {
    return DEFAULT_TRACKER_INTERVAL_MS
  }

  async refresh(): Promise<GameWindowBounds> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.refreshNow().finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  private async refreshNow(): Promise<GameWindowBounds> {
    if (process.platform !== 'win32') {
      return this.markUnavailable()
    }

    try {
      const found = await sendRpcRequest<NativeWindowLookupResult>(
        'map_mask.get_game_window_state',
      )
      if (found?.found && isUsableWindowBounds(found)) {
        this.lastLookupWarning = null
        const sourceBounds = {
          x: found.x,
          y: found.y,
          width: found.width,
          height: found.height,
        }
        const usesPhysicalCoordinates = found.coordinateSpace === 'physical'
        const convertedBounds = usesPhysicalCoordinates
          ? screen.screenToDipRect(null, sourceBounds)
          : sourceBounds
        const dipBounds = roundRectangle(convertedBounds)
        const display = screen.getDisplayMatching(dipBounds)
        this.currentBounds = {
          ...dipBounds,
          isGameWindowFound: true,
          isForeground: Boolean(found.isForeground),
          isMinimized: Boolean(found.isMinimized),
          coordinateSource: usesPhysicalCoordinates
            ? 'physical-screen-to-dip'
            : 'legacy-dip',
          physicalBounds: usesPhysicalCoordinates
            ? roundRectangle(sourceBounds)
            : undefined,
          gameDpi: finiteNumberOrUndefined(found.dpi),
          gameDpiScale: finiteNumberOrUndefined(found.dpiScale),
          displayId: display.id,
          displayScaleFactor: display.scaleFactor,
          displayBounds: roundRectangle(display.bounds),
        }
        this.logGeometryIfChanged(this.currentBounds)
        return this.currentBounds
      }

      return this.markUnavailable()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message !== this.lastLookupWarning) {
        log.warn(`[game-window-tracker] backend lookup failed: ${message}`)
        this.lastLookupWarning = message
      }
      return this.markUnavailable()
    }
  }

  private markUnavailable(): GameWindowBounds {
    this.lastGeometryLogSignature = null
    this.currentBounds = {
      ...this.currentBounds,
      isGameWindowFound: false,
      isForeground: false,
      isMinimized: false,
    }
    return this.currentBounds
  }

  private logGeometryIfChanged(bounds: GameWindowBounds) {
    const signature = JSON.stringify({
      physicalBounds: bounds.physicalBounds,
      dipBounds: pickRectangle(bounds),
      gameDpi: bounds.gameDpi,
      gameDpiScale: bounds.gameDpiScale,
      displayId: bounds.displayId,
      displayScaleFactor: bounds.displayScaleFactor,
      displayBounds: bounds.displayBounds,
      coordinateSource: bounds.coordinateSource,
    })
    if (signature === this.lastGeometryLogSignature) return
    this.lastGeometryLogSignature = signature
    log.info(
      '[game-window-tracker] geometry ' +
        `source=${bounds.coordinateSource ?? 'unknown'} ` +
        `game_physical=${formatRectangle(bounds.physicalBounds)} ` +
        `game_dpi=${formatNumber(bounds.gameDpi)} ` +
        `game_dpi_scale=${formatNumber(bounds.gameDpiScale)} ` +
        `display_id=${bounds.displayId ?? 'n/a'} ` +
        `display_scale=${formatNumber(bounds.displayScaleFactor)} ` +
        `display_dip=${formatRectangle(bounds.displayBounds)} ` +
        `target_dip=${formatRectangle(bounds)}`,
    )
  }
}

function roundRectangle(rectangle: WindowRectangle): WindowRectangle {
  return {
    x: Math.round(rectangle.x),
    y: Math.round(rectangle.y),
    width: Math.round(rectangle.width),
    height: Math.round(rectangle.height),
  }
}

function pickRectangle(rectangle: WindowRectangle): WindowRectangle {
  return {
    x: rectangle.x,
    y: rectangle.y,
    width: rectangle.width,
    height: rectangle.height,
  }
}

function finiteNumberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function formatNumber(value: number | undefined) {
  return value === undefined ? 'n/a' : String(value)
}

function formatRectangle(rectangle: WindowRectangle | undefined) {
  if (!rectangle) return 'n/a'
  return `${rectangle.x},${rectangle.y},${rectangle.width}x${rectangle.height}`
}

function isUsableWindowBounds(
  value: NativeWindowLookupResult,
): value is Required<Pick<NativeWindowLookupResult, 'x' | 'y' | 'width' | 'height'>> &
  NativeWindowLookupResult {
  return (
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    value.width > 0 &&
    value.height > 0
  )
}

export const gameWindowTracker = new GameWindowTracker()
