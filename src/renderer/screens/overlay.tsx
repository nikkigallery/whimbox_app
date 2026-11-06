import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Send, Square, X } from 'lucide-react'
import { ConversationPanel } from 'renderer/components/conversation-panel'
import type { ConversationSendPayload, UiAttachment, UiMessage } from 'renderer/hooks/use-home-conversation'
import { cn } from 'renderer/lib/utils'

/** Electron 无边框窗口拖拽区域，TypeScript 不包含此非标准属性，需断言 */
const appRegionDrag = { WebkitAppRegion: 'drag' } as CSSProperties
const appRegionNoDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

const PANEL_MIN_WIDTH = 200
const PANEL_MIN_HEIGHT = 250
const PANEL_DEFAULT_WIDTH = 420
const PANEL_DEFAULT_HEIGHT = 360

export function OverlayScreen() {
  useEffect(() => {
    document.documentElement.classList.add('overlay-window')
    document.body.classList.add('overlay-window')
    return () => {
      document.documentElement.classList.remove('overlay-window')
      document.body.classList.remove('overlay-window')
    }
  }, [])

  const [messages, setMessages] = useState<UiMessage[]>([])
  const [rpcState, setRpcState] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<UiAttachment[]>([])
  const [conversationPending, setConversationPending] = useState(false)
  const [toolRunning, setToolRunning] = useState(false)
  const [currentStatus, setCurrentStatus] = useState('')
  const [stopKey, setStopKey] = useState('/')
  const [pauseKey, setPauseKey] = useState(']')

  const refreshHotkeys = useCallback(async () => {
    try {
      const result = (await window.App.rpc.request(
        'config.get',
        { path: 'Whimbox' },
      )) as { value?: { stop_key?: { value?: unknown }; pause_key?: { value?: unknown } } }
      const configuredStop = result.value?.stop_key?.value
      const configuredPause = result.value?.pause_key?.value
      if (typeof configuredStop === 'string' && configuredStop.trim()) {
        setStopKey(configuredStop.trim())
      }
      if (typeof configuredPause === 'string' && configuredPause.trim()) {
        setPauseKey(configuredPause.trim())
      }
    } catch {
      // Keep the backend's default hotkeys while the connection is unavailable.
    }
  }, [])

  useEffect(() => {
    void refreshHotkeys()
    const offRpcState = window.App.rpc.onState(({ state }) => {
      if (state === 'open') void refreshHotkeys()
    })
    const onFocus = () => void refreshHotkeys()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshHotkeys()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      offRpcState()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refreshHotkeys])

  useEffect(() => {
    if (toolRunning) void refreshHotkeys()
  }, [refreshHotkeys, toolRunning])

  useEffect(() => {
    const applyState = (s: {
      messages?: unknown[]
      rpcState?: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
      sessionId?: string | null
      toolRunning?: boolean
      conversationPending?: boolean
      currentStatus?: string
    }) => {
      setMessages((s.messages ?? []) as UiMessage[])
      setRpcState(s.rpcState ?? 'idle')
      setSessionId(s.sessionId ?? null)
      setConversationPending(Boolean(s.conversationPending))
      setToolRunning(Boolean(s.toolRunning))
      setCurrentStatus(typeof s.currentStatus === 'string' ? s.currentStatus : '')
    }
    window.App.conversation.getState().then(applyState)
    const off = window.App.conversation.onState(applyState)
    return () => off()
  }, [])

  const handlePickImage = useCallback(async () => {
    const path = await window.App.launcher.selectImageFile()
    if (!path) return
    setAttachments((prev) => {
      if (prev.some((item) => item.path === path)) return prev
      return [...prev, { type: 'image_file', path, loading: true }]
    })
    const previewUrl = await window.App.launcher.getImagePreview(path)
    setAttachments((prev) =>
      prev.map((item) =>
        item.path === path
          ? { ...item, previewUrl: previewUrl ?? undefined, loading: false }
          : item,
      ),
    )
  }, [])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || rpcState !== 'open' || !sessionId || conversationPending) return
    setInput('')
    const payload: ConversationSendPayload = {
      text,
      attachments,
    }
    setAttachments([])
    window.App.conversation.send(payload)
  }, [attachments, conversationPending, input, rpcState, sessionId])

  const handleStop = useCallback(() => {
    if (!conversationPending) return
    window.App.conversation.stop()
  }, [conversationPending])

  type ResizeEdge = 'e' | 'w' | 'n' | 's' | 'se' | 'sw'
  const resizeRef = useRef<{
    edge: ResizeEdge
    startX: number
    startY: number
    startW: number
    startH: number
    startWinX: number
    startWinY: number
  } | null>(null)

  const savedPanelSizeRef = useRef<{ width: number; height: number } | null>(null)

  const handleClose = useCallback(() => {
    window.App.overlay?.hide()
  }, [])

  const handleResizeMouseDown = useCallback(
    (edge: ResizeEdge) => (e: React.MouseEvent) => {
      if (e.button !== 0 || !window.App.overlay) return
      e.preventDefault()
      e.stopPropagation()
      window.App.overlay.getBounds().then((b) => {
        resizeRef.current = {
          edge,
          startX: e.screenX,
          startY: e.screenY,
          startW: b.width,
          startH: b.height,
          startWinX: b.x,
          startWinY: b.y,
        }
        const onMove = (ev: MouseEvent) => {
          const r = resizeRef.current
          if (!r || !window.App.overlay) return
          const dx = ev.screenX - r.startX
          const dy = ev.screenY - r.startY
          let x = r.startWinX
          let y = r.startWinY
          let w = r.startW
          let h = r.startH
          if (r.edge === 'e') {
            w = Math.max(PANEL_MIN_WIDTH, r.startW + dx)
          } else if (r.edge === 'w') {
            const newW = Math.max(PANEL_MIN_WIDTH, r.startW - dx)
            x = r.startWinX + r.startW - newW
            w = newW
          } else if (r.edge === 's') {
            h = Math.max(PANEL_MIN_HEIGHT, r.startH + dy)
          } else if (r.edge === 'n') {
            const newH = Math.max(PANEL_MIN_HEIGHT, r.startH - dy)
            y = r.startWinY + r.startH - newH
            h = newH
          } else if (r.edge === 'se') {
            w = Math.max(PANEL_MIN_WIDTH, r.startW + dx)
            h = Math.max(PANEL_MIN_HEIGHT, r.startH + dy)
          } else if (r.edge === 'sw') {
            const newW = Math.max(PANEL_MIN_WIDTH, r.startW - dx)
            x = r.startWinX + r.startW - newW
            w = newW
            h = Math.max(PANEL_MIN_HEIGHT, r.startH + dy)
          }
          window.App.overlay.setBounds(x, y, w, h)
        }
        const onUp = () => {
          resizeRef.current = null
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          window.App.overlay?.getBounds().then((b) => {
            savedPanelSizeRef.current = { width: b.width, height: b.height }
          })
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      })
    },
    [],
  )

  const isSendDisabled = (!input.trim() && attachments.length === 0) || rpcState !== 'open' || !sessionId
  const isInputDisabled = conversationPending || rpcState !== 'open' || !sessionId
  const hasConversation = messages.length > 0
  const inputPlaceholder = currentStatus || (rpcState === 'open' ? '输入内容...' : '奇想盒后端异常')
  const pauseAvailable = pauseKey !== stopKey

  return (
    <div
      className={cn(
        'relative flex h-screen flex-col rounded-2xl overflow-hidden',
        'bg-slate-900/35 backdrop-blur-lg',
      )}
    >
      <div
        className="flex items-center justify-between border-b border-white/15 px-3 py-0.5 app-drag"
        style={appRegionDrag}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1">
          <span className="shrink-0 text-sm font-medium text-white/90">奇想盒</span>
          {pauseAvailable && (
            <span className="whitespace-nowrap text-[11px] text-white/65">暂停/继续 : {pauseKey}</span>
          )}
          <span className="whitespace-nowrap text-[11px] text-white/65">彻底停止 : {stopKey}</span>
        </div>
        <div className="flex items-center gap-1 app-no-drag" style={appRegionNoDrag}>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1.5 text-white/75 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col p-2 pt-0">
        {hasConversation ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ConversationPanel messages={messages} variant="overlay" />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-white/60 text-sm">
            {rpcState === 'open' ? '输入消息开始对话' : '奇想盒后端异常'}
          </div>
        )}

        <div className="mt-1 flex gap-2">
          <div className="flex-1">
            {attachments.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <div key={attachment.path} className="relative overflow-hidden rounded-xl border border-white/15 p-1">
                    {attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt="已选择图片"
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/10 text-[10px] text-white/60">
                        {attachment.loading ? '加载中...' : '不可预览'}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((item) => item.path !== attachment.path))}
                      className="absolute right-1 top-1 rounded-full bg-black/55 p-0.5 text-white"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              rows={1}
              value={input}
              disabled={isInputDisabled}
              placeholder={inputPlaceholder}
              onChange={(e) => {
                const t = e.currentTarget
                setInput(t.value)
                t.style.height = 'auto'
                t.style.height = `${t.scrollHeight}px`
              }}
              onKeyDown={(e) => {
                if (conversationPending) return
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              className={cn(
                'min-h-[36px] max-h-24 w-full resize-none overflow-hidden rounded-xl',
                'border border-white/20 bg-slate-700/35 px-3 py-2 text-sm text-white/95',
                'placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-pink-400',
              )}
            />
          </div>
          <button
            type="button"
            onClick={handlePickImage}
            disabled={isInputDisabled}
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl',
              'border border-white/20 text-white transition disabled:opacity-50 disabled:cursor-not-allowed',
              'hover:bg-white/10',
            )}
          >
            <ImagePlus className="size-4" />
          </button>
          <button
            type="button"
            onClick={conversationPending ? handleStop : handleSend}
            disabled={conversationPending ? false : isSendDisabled}
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl',
              'text-white transition disabled:opacity-50 disabled:cursor-not-allowed',
              conversationPending ? 'bg-rose-500 hover:bg-rose-600' : 'bg-pink-400 hover:bg-pink-500',
            )}
          >
            {conversationPending ? <Square className="size-4" /> : <Send className="size-4" />}
          </button>
        </div>
      </div>

      {/* 四边调整大小 */}
      <div
        className="absolute left-0 right-0 top-0 h-2 cursor-n-resize"
        onMouseDown={handleResizeMouseDown('n')}
        style={appRegionNoDrag}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize"
        onMouseDown={handleResizeMouseDown('e')}
        style={appRegionNoDrag}
      />
      <div
        className="absolute left-0 right-0 bottom-0 h-2 cursor-s-resize"
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
        className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize"
        onMouseDown={handleResizeMouseDown('w')}
        style={appRegionNoDrag}
      />
    </div>
  )
}
