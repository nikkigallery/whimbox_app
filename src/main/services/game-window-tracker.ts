import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import log from 'electron-log/main.js'

const execFileAsync = promisify(execFile)

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
const LOOKUP_TIMEOUT_MS = 5000
const DEFAULT_TRACKER_INTERVAL_MS = 1000

class GameWindowTracker {
  private readonly debugBounds: DebugBounds
  private readonly titleKeywords: string[]
  private readonly processNames: string[]
  private readonly trackerMode: GameWindowTrackerMode
  private readonly trackerIntervalMs: number
  private readonly windowLookupScript: string
  private currentBounds: GameWindowBounds
  private refreshPromise: Promise<GameWindowBounds> | null = null

  constructor() {
    const config = loadTrackerConfig()
    this.debugBounds = resolveDebugBounds(config)
    this.titleKeywords = resolveTitleKeywords(config)
    this.processNames = resolveProcessNames(config)
    this.trackerMode = resolveTrackerMode(config)
    this.trackerIntervalMs = resolveTrackerInterval()
    this.windowLookupScript = buildWindowLookupScript(
      this.titleKeywords,
      this.processNames,
    )
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
      const found = await findGameWindow(this.windowLookupScript)
      if (found?.found && isUsableWindowBounds(found)) {
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
      log.warn(`[game-window-tracker] lookup failed: ${message}`)
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
  return Math.max(250, Math.round(value))
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

async function findGameWindow(
  script: string,
): Promise<NativeWindowLookupResult | null> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      windowsHide: true,
      timeout: LOOKUP_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    },
  )
  const text = stdout.trim()
  if (!text) return null
  return JSON.parse(text) as NativeWindowLookupResult
}

function buildWindowLookupScript(titleKeywords: string[], processNames: string[]) {
  const keywordsJson = JSON.stringify(titleKeywords).replace(/'/g, "''")
  const processNamesJson = JSON.stringify(processNames).replace(/'/g, "''")
  return `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WhimboxMapMaskWindow {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);

  [DllImport("user32.dll")]
  public static extern uint GetDpiForWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetShellWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }
}
"@

$keywords = ConvertFrom-Json -InputObject '${keywordsJson}'
if ($null -eq $keywords) {
  $keywords = @()
} elseif ($keywords -isnot [System.Array]) {
  $keywords = @($keywords)
}
$processNames = ConvertFrom-Json -InputObject '${processNamesJson}'
if ($null -eq $processNames) {
  $processNames = @()
} elseif ($processNames -isnot [System.Array]) {
  $processNames = @($processNames)
}
$shellWindow = [WhimboxMapMaskWindow]::GetShellWindow()
$foregroundWindow = [WhimboxMapMaskWindow]::GetForegroundWindow()
$candidates = New-Object System.Collections.Generic.List[object]

function Normalize-ProcessName([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return $null }
  $trimmed = $name.Trim()
  if ($trimmed.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase)) {
    return $trimmed
  }
  return "$($trimmed).exe"
}

function Test-TitleMatch([string]$title) {
  $safeTitle = if ($null -eq $title) { '' } else { $title }
  foreach ($keyword in $keywords) {
    $text = [string]$keyword
    if ([string]::IsNullOrWhiteSpace($text)) { continue }
    if ($safeTitle.IndexOf($text, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }
  return $false
}

function Test-ProcessMatch([string]$processName) {
  $normalized = Normalize-ProcessName $processName
  if ([string]::IsNullOrWhiteSpace($normalized)) { return $false }
  foreach ($expected in $processNames) {
    $expectedName = Normalize-ProcessName ([string]$expected)
    if ([string]::IsNullOrWhiteSpace($expectedName)) { continue }
    if ([string]::Equals($normalized, $expectedName, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }
  return $false
}

$processNameByPid = @{}
Get-Process | ForEach-Object {
  try {
    $processNameByPid[[int]$_.Id] = Normalize-ProcessName $_.ProcessName
  } catch {}
}

[WhimboxMapMaskWindow]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if ($hWnd -eq $shellWindow) { return $true }
  if (-not [WhimboxMapMaskWindow]::IsWindowVisible($hWnd)) { return $true }

  $length = [WhimboxMapMaskWindow]::GetWindowTextLength($hWnd)
  $title = ''
  if ($length -gt 0) {
    $builder = New-Object System.Text.StringBuilder ($length + 1)
    [void][WhimboxMapMaskWindow]::GetWindowText($hWnd, $builder, $builder.Capacity)
    $title = $builder.ToString()
  }

  $pidValue = [uint32]0
  [void][WhimboxMapMaskWindow]::GetWindowThreadProcessId($hWnd, [ref]$pidValue)
  $processName = $null
  if ($pidValue -gt 0) {
    $processName = $processNameByPid[[int]$pidValue]
  }

  $titleMatched = Test-TitleMatch $title
  $processMatched = Test-ProcessMatch $processName
  if (-not $titleMatched -and -not $processMatched) {
    return $true
  }

  $rect = New-Object WhimboxMapMaskWindow+RECT
  if (-not [WhimboxMapMaskWindow]::GetWindowRect($hWnd, [ref]$rect)) {
    return $true
  }

  $windowWidth = $rect.Right - $rect.Left
  $windowHeight = $rect.Bottom - $rect.Top
  if ($windowWidth -le 0 -or $windowHeight -le 0) {
    return $true
  }

  $windowRect = [pscustomobject]@{
    left = $rect.Left
    top = $rect.Top
    right = $rect.Right
    bottom = $rect.Bottom
    x = $rect.Left
    y = $rect.Top
    width = $windowWidth
    height = $windowHeight
  }

  $client = New-Object WhimboxMapMaskWindow+RECT
  $clientPoint = New-Object WhimboxMapMaskWindow+POINT
  $clientPoint.X = 0
  $clientPoint.Y = 0
  $clientOk = [WhimboxMapMaskWindow]::GetClientRect($hWnd, [ref]$client)
  $clientScreenOk = [WhimboxMapMaskWindow]::ClientToScreen($hWnd, [ref]$clientPoint)
  $clientWidth = $client.Right - $client.Left
  $clientHeight = $client.Bottom - $client.Top
  $clientAreaAvailable = $clientOk -and $clientScreenOk -and $clientWidth -gt 0 -and $clientHeight -gt 0

  if ($clientAreaAvailable) {
    $appliedX = $clientPoint.X
    $appliedY = $clientPoint.Y
    $appliedWidth = $clientWidth
    $appliedHeight = $clientHeight
    $appliedSource = 'client-area'
    $clientRect = [pscustomobject]@{
      left = $clientPoint.X
      top = $clientPoint.Y
      right = $clientPoint.X + $clientWidth
      bottom = $clientPoint.Y + $clientHeight
      x = $clientPoint.X
      y = $clientPoint.Y
      width = $clientWidth
      height = $clientHeight
    }
  } else {
    $appliedX = $rect.Left
    $appliedY = $rect.Top
    $appliedWidth = $windowWidth
    $appliedHeight = $windowHeight
    $appliedSource = 'window-rect'
    $clientRect = $null
  }

  $dpiScale = 1.0
  try {
    $dpi = [WhimboxMapMaskWindow]::GetDpiForWindow($hWnd)
    if ($dpi -gt 0) {
      $dpiScale = [math]::Round(([double]$dpi / 96.0), 4)
    }
  } catch {
    $dpiScale = 1.0
  }

  $candidates.Add([pscustomobject]@{
    found = $true
    matchedBy = if ($titleMatched) { 'title' } else { 'process' }
    titleMatched = $titleMatched
    processMatched = $processMatched
    title = $title
    handle = $hWnd.ToInt64().ToString()
    processName = $processName
    pid = [int]$pidValue
    x = $appliedX
    y = $appliedY
    width = $appliedWidth
    height = $appliedHeight
    appliedBoundsSource = $appliedSource
    clientAreaAvailable = $clientAreaAvailable
    clientX = if ($clientAreaAvailable) { $clientPoint.X } else { $null }
    clientY = if ($clientAreaAvailable) { $clientPoint.Y } else { $null }
    clientWidth = if ($clientAreaAvailable) { $clientWidth } else { $null }
    clientHeight = if ($clientAreaAvailable) { $clientHeight } else { $null }
    windowRect = $windowRect
    clientRect = $clientRect
    dpiScale = $dpiScale
    scaleFactor = $dpiScale
    isForeground = $foregroundWindow -eq $hWnd
    isMinimized = [WhimboxMapMaskWindow]::IsIconic($hWnd)
  }) | Out-Null
  return $true
}, [IntPtr]::Zero) | Out-Null

$result = $candidates | Where-Object { $_.titleMatched } | Select-Object -First 1
if ($null -eq $result) {
  $result = $candidates | Where-Object { $_.processMatched } | Select-Object -First 1
  if ($null -ne $result) {
    $result.matchedBy = 'process'
  }
}

if ($null -eq $result) {
  [pscustomobject]@{ found = $false } | ConvertTo-Json -Compress
} else {
  $result | ConvertTo-Json -Compress
}
`
}

export const gameWindowTracker = new GameWindowTracker()
