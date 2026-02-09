import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { ConversationPanel } from 'renderer/components/conversation-panel'
import { useHomeConversation } from 'renderer/hooks/use-home-conversation'
import { IpcRpcClient } from 'renderer/lib/ipc-rpc'
import { cn } from 'renderer/lib/utils'

const formatError = (error: unknown) => {
  if (error == null) return ''
  if (typeof error === 'string') return error
  if (typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return String(error)
}

export function OverlayScreen() {
  const rpcRef = useRef<IpcRpcClient | null>(null)
  if (!rpcRef.current) rpcRef.current = new IpcRpcClient()
  const rpcClient = rpcRef.current

  useEffect(() => {
    document.body.classList.add('overlay-window')
    return () => document.body.classList.remove('overlay-window')
  }, [])

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [rpcState, setRpcState] = useState(rpcClient.getState())

  useEffect(() => {
    window.App.rpc.getSessionId().then(setSessionId)
    const offSession = window.App.rpc.onSessionId(setSessionId)
    const offState = rpcClient.on('state', ({ state }) => setRpcState(state))
    return () => {
      offSession()
      offState()
    }
  }, [rpcClient])

  const addEventLog = useCallback(() => {}, [])

  const { messages, input, setInput, handleSend } = useHomeConversation({
    rpcClient,
    sessionId,
    rpcState,
    addEventLog,
    formatError,
  })

  const isSendDisabled = !input.trim() || rpcState !== 'open' || !sessionId
  const hasConversation = messages.length > 0

  const handleClose = useCallback(() => {
    window.App.windowControls.close()
  }, [])

  return (
    <div
      className={cn(
        'flex h-screen flex-col rounded-2xl overflow-hidden',
        'bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-md',
        'border border-slate-700/50 shadow-2xl',
      )}
    >
      <div
        className="flex items-center justify-between border-b border-slate-700/50 px-3 py-2 app-drag"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <span className="text-xs font-medium text-slate-300">奇想盒</span>
        <button
          type="button"
          onClick={handleClose}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-white app-no-drag"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 flex-col p-2">
        {hasConversation ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ConversationPanel messages={messages} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-500 text-sm">
            {rpcState === 'open' ? '输入消息开始对话' : 'RPC 未连接'}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <textarea
            rows={1}
            value={input}
            placeholder={
              rpcState === 'open' ? '输入内容...' : '等待连接...'
            }
            onChange={(e) => {
              const t = e.currentTarget
              setInput(t.value)
              t.style.height = 'auto'
              t.style.height = `${t.scrollHeight}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            className={cn(
              'min-h-[36px] max-h-24 flex-1 resize-none rounded-xl',
              'border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-slate-200',
              'placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500',
            )}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isSendDisabled}
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl',
              'bg-pink-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed',
              'hover:bg-pink-600',
            )}
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
