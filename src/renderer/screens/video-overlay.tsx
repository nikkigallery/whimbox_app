import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, RotateCcw, Tv, X } from 'lucide-react'

import { Button } from 'renderer/components/ui/button'
import { Input } from 'renderer/components/ui/input'
import { cn } from 'renderer/lib/utils'

const appRegionNoDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

const PANEL_MIN_WIDTH = 320
const PANEL_MIN_HEIGHT = 180
const TITLE_BAR_HEIGHT = 40

type ResizeEdge = 'e' | 'w' | 's' | 'se' | 'sw'
type PlaybackCommand = 'toggle_play' | 'seek_forward' | 'seek_backward'
type VideoOverlayState = {
  visible: boolean
  url: string
  opacity: number
  playPauseKey: string
  seekForwardKey: string
  seekBackwardKey: string
}

type ElectronWebviewTag = HTMLElement & {
  src: string
  loadURL: (url: string) => void
  getURL: () => string
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
}

const defaultState: VideoOverlayState = {
  visible: false,
  url: '',
  opacity: 1,
  playPauseKey: 'f8',
  seekForwardKey: 'f9',
  seekBackwardKey: 'f7',
}

function normalizeUrl(value: string): string {
  const text = value.trim()
  if (!text) return ''
  const url = new URL(text)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http/https 地址')
  }
  return url.toString()
}

function buildPlaybackScript(command: PlaybackCommand) {
  const seconds = command === 'seek_forward' ? 5 : -5
  return `
    (() => {
      const selectVideo = () => {
        const candidates = Array.from(document.querySelectorAll('video'));
        return candidates.find((item) => item instanceof HTMLVideoElement) ?? null;
      };
      const video = selectVideo();
      if (!video) return false;
      if (${JSON.stringify(command)} === 'toggle_play') {
        if (video.paused) video.play().catch(() => {});
        else video.pause();
        return true;
      }
      video.currentTime = Math.max(0, Math.min(video.duration || Number.MAX_SAFE_INTEGER, video.currentTime + ${seconds}));
      return true;
    })();
  `
}

export function VideoOverlayScreen() {
  const webviewRef = useRef<ElectronWebviewTag | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resizeRef = useRef<{
    edge: ResizeEdge
    startX: number
    startY: number
    startW: number
    startH: number
    startWinX: number
    startWinY: number
  } | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    startWinX: number
    startWinY: number
  } | null>(null)

  const [overlayState, setOverlayState] = useState<VideoOverlayState>(defaultState)
  const [draftUrl, setDraftUrl] = useState('')
  const [currentUrl, setCurrentUrl] = useState('')
  const [pageTitle, setPageTitle] = useState('视频小窗')
  const [editing, setEditing] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [pageReady, setPageReady] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('overlay-window')
    document.body.classList.add('overlay-window')
    return () => {
      document.documentElement.classList.remove('overlay-window')
      document.body.classList.remove('overlay-window')
    }
  }, [])

  useEffect(() => {
    const api = window.App.videoOverlay
    if (!api) return
    api.getState().then((state) => {
      setOverlayState(state)
      setDraftUrl(state.url)
      setCurrentUrl(state.url)
      setEditing(!state.url)
    })
    const offState = api.onState((state) => {
      setOverlayState(state)
      setCurrentUrl(state.url)
      setDraftUrl(state.url)
      if (!state.url) {
        setEditing(true)
      }
    })
    const offNavigate = api.onNavigate((url) => {
      setCurrentUrl(url)
      setDraftUrl(url)
      setEditing(!url)
      setLoadError('')
      setPageReady(false)
      if (webviewRef.current && url) {
        webviewRef.current.loadURL(url)
      }
    })
    const offPlayback = api.onPlaybackCommand((command) => {
      if (!webviewRef.current) return
      void webviewRef.current.executeJavaScript(buildPlaybackScript(command), true)
    })
    const offFocusInput = api.onFocusInput(() => {
      setEditing(true)
      window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    })
    return () => {
      offState()
      offNavigate()
      offPlayback()
      offFocusInput()
    }
  }, [])

  useEffect(() => {
    const view = webviewRef.current
    if (!view) return

    const handleStart = () => {
      setLoadError('')
      setPageReady(false)
    }

    const handleStop = async () => {
      setPageReady(true)
      try {
        const title = await view.executeJavaScript('document.title')
        if (typeof title === 'string' && title.trim()) {
          setPageTitle(title.trim())
          return
        }
      } catch {}
      setPageTitle('视频小窗')
    }

    const handleFail = (event: Event) => {
      const detail = event as Event & { errorDescription?: string }
      setLoadError(detail.errorDescription || '网页加载失败')
      setPageReady(false)
    }

    view.addEventListener('did-start-loading', handleStart as EventListener)
    view.addEventListener('did-stop-loading', handleStop as EventListener)
    view.addEventListener('did-fail-load', handleFail as EventListener)

    return () => {
      view.removeEventListener('did-start-loading', handleStart as EventListener)
      view.removeEventListener('did-stop-loading', handleStop as EventListener)
      view.removeEventListener('did-fail-load', handleFail as EventListener)
    }
  }, [currentUrl, editing])

  const handleSubmit = useCallback(async () => {
    const api = window.App.videoOverlay
    if (!api) return
    try {
      const url = normalizeUrl(draftUrl)
      const next = await api.navigate(url)
      setOverlayState(next)
      setCurrentUrl(next.url)
      setDraftUrl(next.url)
      setEditing(false)
      setLoadError('')
      setPageReady(false)
      if (webviewRef.current && next.url) {
        webviewRef.current.loadURL(next.url)
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '网址无效')
    }
  }, [draftUrl])

  const handleClose = useCallback(() => {
    void window.App.videoOverlay?.hide()
  }, [])

  const handleResizeMouseDown = useCallback(
    (edge: ResizeEdge) => (event: ReactMouseEvent) => {
      if (event.button !== 0 || !window.App.videoOverlay) return
      event.preventDefault()
      event.stopPropagation()
      window.App.videoOverlay.getBounds().then((bounds) => {
        resizeRef.current = {
          edge,
          startX: event.screenX,
          startY: event.screenY,
          startW: bounds.width,
          startH: bounds.height,
          startWinX: bounds.x,
          startWinY: bounds.y,
        }
        const onMove = (moveEvent: MouseEvent) => {
          const current = resizeRef.current
          if (!current || !window.App.videoOverlay) return
          const dx = moveEvent.screenX - current.startX
          const dy = moveEvent.screenY - current.startY
          let x = current.startWinX
          let y = current.startWinY
          let width = current.startW
          let height = current.startH
          if (current.edge === 'e') {
            width = Math.max(PANEL_MIN_WIDTH, current.startW + dx)
          } else if (current.edge === 'w') {
            const nextWidth = Math.max(PANEL_MIN_WIDTH, current.startW - dx)
            x = current.startWinX + current.startW - nextWidth
            width = nextWidth
          } else if (current.edge === 's') {
            height = Math.max(PANEL_MIN_HEIGHT, current.startH + dy)
          } else if (current.edge === 'se') {
            width = Math.max(PANEL_MIN_WIDTH, current.startW + dx)
            height = Math.max(PANEL_MIN_HEIGHT, current.startH + dy)
          } else if (current.edge === 'sw') {
            const nextWidth = Math.max(PANEL_MIN_WIDTH, current.startW - dx)
            x = current.startWinX + current.startW - nextWidth
            width = nextWidth
            height = Math.max(PANEL_MIN_HEIGHT, current.startH + dy)
          }
          void window.App.videoOverlay.setBounds(x, y, width, height)
        }
        const onUp = () => {
          resizeRef.current = null
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      })
    },
    [],
  )

  const handleTitleBarMouseDown = useCallback((event: ReactMouseEvent) => {
    if (event.button !== 0 || !window.App.videoOverlay) return
    event.preventDefault()
    event.stopPropagation()
    window.App.videoOverlay.getBounds().then((bounds) => {
      dragRef.current = {
        startX: event.screenX,
        startY: event.screenY,
        startWinX: bounds.x,
        startWinY: bounds.y,
      }
      const onMove = (moveEvent: MouseEvent) => {
        const current = dragRef.current
        if (!current || !window.App.videoOverlay) return
        const dx = moveEvent.screenX - current.startX
        const dy = moveEvent.screenY - current.startY
        void window.App.videoOverlay.setBounds(
          current.startWinX + dx,
          current.startWinY + dy,
          bounds.width,
          bounds.height,
        )
      }
      const onUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    })
  }, [])

  const titleText = useMemo(() => {
    if (pageTitle && pageTitle !== '视频小窗') return pageTitle
    if (currentUrl) return currentUrl
    return '视频小窗'
  }, [currentUrl, pageTitle])

  const titleBarVisible = hovered || editing

  return (
    <div
      className="relative h-screen w-screen"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-slate-950/72">
        <div
          className={cn(
            'absolute inset-x-0 top-0 z-20 flex h-10 items-center justify-between px-3 py-2',
            titleBarVisible
              ? 'pointer-events-auto visible border-b border-white/10 bg-slate-950/78'
              : 'pointer-events-none invisible border-b border-transparent bg-transparent',
          )}
          style={appRegionNoDrag}
        >
        <div
          className="min-w-0 flex-1 cursor-grab pr-2 active:cursor-grabbing"
          onMouseDown={handleTitleBarMouseDown}
          style={appRegionNoDrag}
        >
          <p className="truncate text-sm font-medium text-white">{titleText}</p>
        </div>
        <div className="flex items-center gap-1" style={appRegionNoDrag}>
          {currentUrl ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setEditing(true)
                  window.setTimeout(() => {
                    inputRef.current?.focus()
                    inputRef.current?.select()
                  }, 0)
                }}
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  if (currentUrl) window.App.launcher.openExternal(currentUrl)
                }}
              >
                <ExternalLink className="size-4" />
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            onClick={handleClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        </div>

        <div
          className="relative flex h-full w-full flex-1 flex-col overflow-hidden min-h-0"
          style={{ paddingTop: titleBarVisible ? TITLE_BAR_HEIGHT : 0 }}
        >
          {editing ? (
            <div className="flex h-full items-center justify-center px-6">
              <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/6 p-6 shadow-xl backdrop-blur-md">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-pink-400/15 text-pink-300">
                    <Tv className="size-5" />
                  </div>
                  <div>
                    <h1 className="text-base font-semibold text-white">输入视频网页地址</h1>
                    <p className="mt-1 text-xs text-white/55">目前仅支持B站，其他未测试。</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <Input
                    ref={inputRef}
                    value={draftUrl}
                    tone="default"
                    onChange={(event) => setDraftUrl(event.target.value)}
                    placeholder="https://"
                    className="border-white/15 bg-white/8 text-white placeholder:text-white/35"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleSubmit()
                      }
                    }}
                  />
                  {loadError ? <p className="text-xs text-rose-300">{loadError}</p> : null}
                  <div className="flex justify-end gap-2">
                    {currentUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-white/80 hover:bg-white/10 hover:text-white"
                        onClick={() => {
                          setEditing(false)
                          setDraftUrl(currentUrl)
                          setLoadError('')
                        }}
                      >
                        取消
                      </Button>
                    ) : null}
                    <Button type="button" className="bg-pink-400 text-white hover:bg-pink-500" onClick={() => void handleSubmit()}>
                      打开网页
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative h-full w-full overflow-hidden">
              <webview
                ref={(node) => {
                  webviewRef.current = node as ElectronWebviewTag | null
                }}
                src={currentUrl || 'about:blank'}
                allowpopups={true}
                className="h-full w-full bg-black"
              />
              {!pageReady && !loadError ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 text-sm text-white/60">
                  正在加载网页...
                </div>
              ) : null}
              {loadError ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center">
                  <div>
                    <p className="text-sm text-rose-300">{loadError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 border-white/15 bg-white/10 text-white hover:bg-white/15"
                      onClick={() => setEditing(true)}
                    >
                      重新输入网址
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize"
          onMouseDown={handleResizeMouseDown('s')}
          style={appRegionNoDrag}
        />
        <div
          className="absolute bottom-0 left-0 z-10 size-4 cursor-sw-resize"
          onMouseDown={handleResizeMouseDown('sw')}
          style={appRegionNoDrag}
        />
        <div
          className="absolute right-0 bottom-0 z-10 size-4 cursor-se-resize"
          onMouseDown={handleResizeMouseDown('se')}
          style={appRegionNoDrag}
        />
        <div
          className="absolute bottom-0 right-0 top-0 w-2 cursor-e-resize"
          onMouseDown={handleResizeMouseDown('e')}
          style={appRegionNoDrag}
        />
        <div
          className="absolute bottom-0 left-0 top-0 w-2 cursor-w-resize"
          onMouseDown={handleResizeMouseDown('w')}
          style={appRegionNoDrag}
        />
      </div>
    </div>
  )
}
