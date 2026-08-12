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
}

type NativeWindowLookupResult = {
  found?: boolean
  x?: number
  y?: number
  width?: number
  height?: number
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
        this.currentBounds = {
          x: Math.round(found.x),
          y: Math.round(found.y),
          width: Math.round(found.width),
          height: Math.round(found.height),
          isGameWindowFound: true,
          isForeground: Boolean(found.isForeground),
          isMinimized: Boolean(found.isMinimized),
        }
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
    this.currentBounds = {
      ...this.currentBounds,
      isGameWindowFound: false,
      isForeground: false,
      isMinimized: false,
    }
    return this.currentBounds
  }
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
