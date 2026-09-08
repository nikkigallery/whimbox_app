import log from 'electron-log/main.js'
import type { UiohookMouseEvent } from 'uiohook-napi'

export type VideoOverlayMouseShortcut = 'mouse_x1' | 'mouse_x2'

type Uiohook = typeof import('uiohook-napi')['uIOhook']

const BUTTON_TO_SHORTCUT = new Map<number, VideoOverlayMouseShortcut>([
  [4, 'mouse_x1'],
  [5, 'mouse_x2'],
])

let hook: Uiohook | null = null
let loadPromise: Promise<void> | null = null
let running = false
let unavailable = false
let desiredActive = false
let activeShortcuts = new Set<VideoOverlayMouseShortcut>()
let shortcutHandler: ((shortcut: VideoOverlayMouseShortcut) => void) | null =
  null

function handleMouseDown(event: UiohookMouseEvent) {
  if (!desiredActive) return
  const shortcut = BUTTON_TO_SHORTCUT.get(Number(event.button))
  if (!shortcut || !activeShortcuts.has(shortcut)) return
  shortcutHandler?.(shortcut)
}

function stopHook() {
  if (!hook || !running) return
  try {
    hook.off('mousedown', handleMouseDown)
    hook.stop()
  } catch (error) {
    log.warn('[video-overlay] failed to stop mouse shortcut hook', error)
  } finally {
    running = false
  }
}

async function ensureHookStarted() {
  if (running || unavailable || loadPromise) return

  loadPromise = (async () => {
    try {
      const module = await import('uiohook-napi')
      hook = module.uIOhook
      if (!desiredActive) return

      hook.on('mousedown', handleMouseDown)
      hook.start()
      running = true
    } catch (error) {
      hook?.off('mousedown', handleMouseDown)
      unavailable = true
      log.warn(
        '[video-overlay] mouse shortcut hook unavailable; keyboard shortcuts remain active',
        error
      )
    }
  })().finally(() => {
    loadPromise = null
  })

  await loadPromise
}

export function updateVideoOverlayMouseShortcuts(
  shortcuts: Iterable<VideoOverlayMouseShortcut>,
  handler: (shortcut: VideoOverlayMouseShortcut) => void
) {
  activeShortcuts = new Set(shortcuts)
  shortcutHandler = handler
  desiredActive = activeShortcuts.size > 0

  if (!desiredActive) {
    stopHook()
    return
  }

  void ensureHookStarted()
}

export function stopVideoOverlayMouseShortcuts() {
  desiredActive = false
  activeShortcuts.clear()
  shortcutHandler = null
  stopHook()
}
