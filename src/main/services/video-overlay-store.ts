import Store from 'electron-store'

export type VideoOverlayPlaybackCommand = 'toggle_play' | 'seek_forward' | 'seek_backward'

export type VideoOverlayState = {
  visible: boolean
  url: string
  opacity: number
  playPauseKey: string
  seekForwardKey: string
  seekBackwardKey: string
}

const DEFAULT_STATE: VideoOverlayState = {
  visible: false,
  url: '',
  opacity: 1,
  playPauseKey: 'f8',
  seekForwardKey: 'f9',
  seekBackwardKey: 'f7',
}

const store = new Store<{ state: VideoOverlayState }>({
  name: 'video-overlay',
})

function normalizeKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const next = value.trim().toLowerCase()
  return next || fallback
}

function normalizeOpacity(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(1, Math.max(0.2, value))
}

export function getVideoOverlayState(): VideoOverlayState {
  const value = store.get('state')
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_STATE }
  }
  return {
    visible: Boolean(value.visible),
    url: typeof value.url === 'string' ? value.url.trim() : DEFAULT_STATE.url,
    opacity: normalizeOpacity(value.opacity, DEFAULT_STATE.opacity),
    playPauseKey: normalizeKey(value.playPauseKey, DEFAULT_STATE.playPauseKey),
    seekForwardKey: normalizeKey(value.seekForwardKey, DEFAULT_STATE.seekForwardKey),
    seekBackwardKey: normalizeKey(value.seekBackwardKey, DEFAULT_STATE.seekBackwardKey),
  }
}

export function setVideoOverlayState(patch: Partial<VideoOverlayState>): VideoOverlayState {
  const prev = getVideoOverlayState()
  const next: VideoOverlayState = {
    visible: typeof patch.visible === 'boolean' ? patch.visible : prev.visible,
    url: typeof patch.url === 'string' ? patch.url.trim() : prev.url,
    opacity: patch.opacity === undefined ? prev.opacity : normalizeOpacity(patch.opacity, prev.opacity),
    playPauseKey: patch.playPauseKey === undefined
      ? prev.playPauseKey
      : normalizeKey(patch.playPauseKey, prev.playPauseKey),
    seekForwardKey: patch.seekForwardKey === undefined
      ? prev.seekForwardKey
      : normalizeKey(patch.seekForwardKey, prev.seekForwardKey),
    seekBackwardKey: patch.seekBackwardKey === undefined
      ? prev.seekBackwardKey
      : normalizeKey(patch.seekBackwardKey, prev.seekBackwardKey),
  }
  store.set('state', next)
  return next
}
