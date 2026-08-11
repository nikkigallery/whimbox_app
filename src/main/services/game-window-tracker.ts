import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import log from 'electron-log/main.js'

import { sendRpcRequest } from './rpc-bridge'

export type GameWindowTrackerMode = 'debug' | 'real-window'

export type GameWindowRect = {
  left: number
  top: number
  right: number
  bottom: number
  x: number
  y: number
  width: number
  height: number
}

export type GameWindowBounds = {
  x: number
  y: number
  width: number
  height: number
  source: 'debug-fixed' | 'game-window'
  appliedBoundsSource: 'debug-fixed' | 'client-area' | 'window-rect'
  trackerMode: GameWindowTrackerMode
  isGameWindowFound: boolean
  isForeground: boolean
  isMinimized: boolean
  clientAreaAvailable: boolean
  clientX: number | null
  clientY: number | null
  clientWidth: number | null
  clientHeight: number | null
  windowRect: GameWindowRect | null
  clientRect: GameWindowRect | null
  dpiScale: number | null
  scaleFactor: number | null
  matchedBy: 'title' | 'process' | 'fallback'
  processName: string | null
  pid: number | null
  foundWindowTitle: string | null
  foundWindowHandle: string | null
  titleKeywords: string[]
  processNames: string[]
  lastUpdateTime: string
  trackerIntervalMs: number
  lastUpdateDurationMs: number
  lastBoundsChanged: boolean
  message?: string
}

type DebugBounds = {
  x: number
  y: number
  width: number
  height: number
}

type TrackerConfig = {
  mode?: string
  windowTitleKeywords?: unknown
  processNames?: unknown
  debugBounds?: Partial<DebugBounds>
}

type NativeWindowLookupResult = {
  found?: boolean
  matchedBy?: 'title' | 'process'
  title?: string
  handle?: string
  processName?: string
  pid?: number
  x?: number
  y?: number
  width?: number
  height?: number
  appliedBoundsSource?: 'client-area' | 'window-rect'
  clientAreaAvailable?: boolean
  clientX?: number
  clientY?: number
  clientWidth?: number
  clientHeight?: number
  windowRect?: GameWindowRect
  clientRect?: GameWindowRect | null
  dpiScale?: number
  scaleFactor?: number
  isForeground?: boolean
  isMinimized?: boolean
}

const DEFAULT_DEBUG_WIDTH = 1920
const DEFAULT_DEBUG_HEIGHT = 1080
const DEFAULT_TITLE_KEYWORDS = [
  'Infinity Nikki',
  '无限暖暖',
  'InfinityNikki',
  'Papergames',
  'Infold',
]
const DEFAULT_PROCESS_NAMES = [
  'X6Game-Win64-Shipping.exe',
  'X6Game.exe',
]
const DEFAULT_TRACKER_INTERVAL_MS = 100

class GameWindowTracker {
  private readonly debugBounds: DebugBounds
  private readonly titleKeywords: string[]
  private readonly processNames: string[]
  private readonly trackerMode: GameWindowTrackerMode
  private readonly trackerIntervalMs: number
  private currentBounds: GameWindowBounds
  private refreshPromise: Promise<GameWindowBounds> | null = null
  private lastLookupWarning: string | null = null

  constructor() {
    const config = loadTrackerConfig()
    this.debugBounds = resolveDebugBounds(config)
    this.titleKeywords = resolveTitleKeywords(config)
    this.processNames = resolveProcessNames(config)
    this.trackerMode = resolveTrackerMode(config)
    this.trackerIntervalMs = resolveTrackerInterval()
    this.currentBounds = this.buildDebugBounds(
      this.trackerMode === 'debug'
        ? 'debug tracker mode'
        : 'waiting for first window lookup',
    )
  }

  getBounds(): GameWindowBounds {
    return this.currentBounds
  }

  getMode(): GameWindowTrackerMode {
    return this.trackerMode
  }

  getIntervalMs(): number {
    return this.trackerIntervalMs
  }

  async refresh(): Promise<GameWindowBounds> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.refreshNow().finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  private async refreshNow(): Promise<GameWindowBounds> {
    const started = performance.now()
    if (this.trackerMode === 'debug' || process.platform !== 'win32') {
      return this.commitBounds(this.buildDebugBounds(
        this.trackerMode === 'debug'
          ? 'debug tracker mode'
          : 'real window tracking is Windows-only',
      ), started)
    }

    try {
      const found = await sendRpcRequest<NativeWindowLookupResult>(
        'map_mask.get_game_window_state',
      )
      if (found?.found && isUsableWindowBounds(found)) {
        this.lastLookupWarning = null
        return this.commitBounds({
          x: Math.round(found.x),
          y: Math.round(found.y),
          width: Math.round(found.width),
          height: Math.round(found.height),
          source: 'game-window',
          appliedBoundsSource: found.appliedBoundsSource ?? 'window-rect',
          trackerMode: this.trackerMode,
          isGameWindowFound: true,
          isForeground: Boolean(found.isForeground),
          isMinimized: Boolean(found.isMinimized),
          clientAreaAvailable: Boolean(found.clientAreaAvailable),
          clientX: asFiniteNumber(found.clientX),
          clientY: asFiniteNumber(found.clientY),
          clientWidth: asFiniteNumber(found.clientWidth),
          clientHeight: asFiniteNumber(found.clientHeight),
          windowRect: found.windowRect ?? null,
          clientRect: found.clientRect ?? null,
          dpiScale: asFiniteNumber(found.dpiScale),
          scaleFactor: asFiniteNumber(found.scaleFactor ?? found.dpiScale),
          matchedBy: found.matchedBy ?? 'fallback',
          processName: found.processName ?? null,
          pid: asFiniteNumber(found.pid),
          foundWindowTitle: found.title ?? null,
          foundWindowHandle: found.handle ?? null,
          titleKeywords: this.titleKeywords,
          processNames: this.processNames,
          lastUpdateTime: new Date().toISOString(),
          trackerIntervalMs: this.trackerIntervalMs,
          lastUpdateDurationMs: 0,
          lastBoundsChanged: false,
        }, started)
      }

      return this.commitBounds(
        this.buildDebugBounds('game window not found'),
        started,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message !== this.lastLookupWarning) {
        log.warn(`[game-window-tracker] backend lookup failed: ${message}`)
        this.lastLookupWarning = message
      }
      return this.commitBounds(
        this.buildDebugBounds(`lookup failed: ${message}`),
        started,
      )
    }
  }

  private commitBounds(
    next: GameWindowBounds,
    started: number,
  ): GameWindowBounds {
    const previous = this.currentBounds
    const changed = (
      previous.x !== next.x ||
      previous.y !== next.y ||
      previous.width !== next.width ||
      previous.height !== next.height ||
      previous.source !== next.source ||
      previous.isForeground !== next.isForeground ||
      previous.isMinimized !== next.isMinimized
    )
    this.currentBounds = {
      ...next,
      trackerIntervalMs: this.trackerIntervalMs,
      lastUpdateDurationMs: Math.max(0, performance.now() - started),
      lastBoundsChanged: changed,
    }
    return this.currentBounds
  }

  private buildDebugBounds(message: string): GameWindowBounds {
    return {
      x: this.debugBounds.x,
      y: this.debugBounds.y,
      width: this.debugBounds.width,
      height: this.debugBounds.height,
      source: 'debug-fixed',
      appliedBoundsSource: 'debug-fixed',
      trackerMode: this.trackerMode,
      isGameWindowFound: false,
      isForeground: this.trackerMode === 'debug',
      isMinimized: false,
      clientAreaAvailable: true,
      clientX: this.debugBounds.x,
      clientY: this.debugBounds.y,
      clientWidth: this.debugBounds.width,
      clientHeight: this.debugBounds.height,
      windowRect: rectFromBounds(this.debugBounds),
      clientRect: rectFromBounds(this.debugBounds),
      dpiScale: 1,
      scaleFactor: 1,
      matchedBy: 'fallback',
      processName: null,
      pid: null,
      foundWindowTitle: null,
      foundWindowHandle: null,
      titleKeywords: this.titleKeywords,
      processNames: this.processNames,
      lastUpdateTime: new Date().toISOString(),
      trackerIntervalMs: this.trackerIntervalMs,
      lastUpdateDurationMs: 0,
      lastBoundsChanged: false,
      message,
    }
  }
}

function resolveTrackerMode(config: TrackerConfig): GameWindowTrackerMode {
  if (process.env.WHIMBOX_MAP_MASK_SMOKE === '1') return 'debug'

  const rawMode = (
    process.env.WHIMBOX_MAP_MASK_TRACKER_MODE ??
    config.mode ??
    'real'
  ).toString().trim().toLowerCase()

  if (rawMode === 'debug' || rawMode === 'fixed') return 'debug'
  return 'real-window'
}

function resolveTrackerInterval(): number {
  const value = Number(process.env.WHIMBOX_MAP_MASK_TRACKER_INTERVAL_MS)
  if (!Number.isFinite(value)) return DEFAULT_TRACKER_INTERVAL_MS
  return Math.max(50, Math.round(value))
}

function resolveTitleKeywords(config: TrackerConfig): string[] {
  const fromEnv = splitKeywords(process.env.WHIMBOX_MAP_MASK_WINDOW_TITLE_KEYWORDS)
  if (fromEnv.length > 0) return fromEnv

  const rawConfigKeywords = config.windowTitleKeywords
  if (Array.isArray(rawConfigKeywords)) {
    const keywords = rawConfigKeywords
      .map((item) => String(item).trim())
      .filter(Boolean)
    if (keywords.length > 0) return keywords
  }
  if (typeof rawConfigKeywords === 'string') {
    const keywords = splitKeywords(rawConfigKeywords)
    if (keywords.length > 0) return keywords
  }

  return DEFAULT_TITLE_KEYWORDS
}

function resolveProcessNames(config: TrackerConfig): string[] {
  const fromEnv = normalizeProcessNames(splitKeywords(process.env.WHIMBOX_MAP_MASK_PROCESS_NAMES))
  if (fromEnv.length > 0) return fromEnv

  const rawConfigProcessNames = config.processNames
  if (Array.isArray(rawConfigProcessNames)) {
    const names = normalizeProcessNames(rawConfigProcessNames.map((item) => String(item)))
    if (names.length > 0) return names
  }
  if (typeof rawConfigProcessNames === 'string') {
    const names = normalizeProcessNames(splitKeywords(rawConfigProcessNames))
    if (names.length > 0) return names
  }

  return DEFAULT_PROCESS_NAMES
}

function normalizeProcessNames(values: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const withExtension = trimmed.toLowerCase().endsWith('.exe')
      ? trimmed
      : `${trimmed}.exe`
    const key = withExtension.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(withExtension)
  }
  return normalized
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rectFromBounds(bounds: DebugBounds): GameWindowRect {
  return {
    left: bounds.x,
    top: bounds.y,
    right: bounds.x + bounds.width,
    bottom: bounds.y + bounds.height,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

function resolveDebugBounds(config: TrackerConfig): DebugBounds {
  const fromEnv = parseDebugBounds(process.env.WHIMBOX_MAP_MASK_DEBUG_BOUNDS)
  if (fromEnv) return fromEnv

  const fromConfig = config.debugBounds
  if (
    fromConfig &&
    Number.isFinite(fromConfig.width) &&
    Number.isFinite(fromConfig.height)
  ) {
    return {
      x: Number.isFinite(fromConfig.x) ? Number(fromConfig.x) : 0,
      y: Number.isFinite(fromConfig.y) ? Number(fromConfig.y) : 0,
      width: Math.max(1, Number(fromConfig.width)),
      height: Math.max(1, Number(fromConfig.height)),
    }
  }

  return { x: 0, y: 0, width: DEFAULT_DEBUG_WIDTH, height: DEFAULT_DEBUG_HEIGHT }
}

function parseDebugBounds(value: string | undefined): DebugBounds | null {
  if (!value) return null
  const parts = value
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
  if (parts.length !== 4) return null
  const [x, y, width, height] = parts
  return {
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
  }
}

function splitKeywords(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[;,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function loadTrackerConfig(): TrackerConfig {
  const configPath = process.env.WHIMBOX_MAP_MASK_TRACKER_CONFIG
    ? resolve(process.env.WHIMBOX_MAP_MASK_TRACKER_CONFIG)
    : join(process.cwd(), 'map-mask-window-tracker.json')

  if (!existsSync(configPath)) return {}

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as TrackerConfig
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn(`[game-window-tracker] failed to read ${configPath}: ${message}`)
    return {}
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
