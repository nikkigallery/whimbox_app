import {
  Bot,
  FileText,
  Gift,
  Home,
  Layers,
  Map,
  Minus,
  Moon,
  Keyboard,
  Piano,
  Send,
  Settings,
  Sparkles,
  Sun,
  Square,
  Target,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { RpcClient } from 'renderer/lib/rpc'

const navItems = [
  { label: '首页', icon: Home, active: true },
  { label: '一条龙', icon: Layers },
  { label: '自动触发', icon: Sparkles },
  { label: '跑图路线', icon: Map },
  { label: '键鼠宏', icon: Keyboard },
  { label: '自动演奏', icon: Piano },
]

const quickActions = [
  {
    icon: FileText,
    title: '请帮我执行下日常任务-一条龙',
  },
  {
    icon: Bot,
    title: '待定',
  },
  {
    icon: Target,
    title: '待定',
  },
]

type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  pending?: boolean
}

type RpcEventLog = {
  id: string
  method: string
  detail: string
}

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

const formatRpcState = (state: string) => {
  switch (state) {
    case 'open':
      return '已连接'
    case 'connecting':
      return '连接中'
    case 'error':
      return '连接异常'
    default:
      return '未连接'
  }
}

export function MainScreen() {
  const [isDark, setIsDark] = useState(() => {
    const savedTheme =
      typeof window !== 'undefined' ? localStorage.getItem('theme') : null
    return savedTheme === 'dark'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const rpcRef = useRef<RpcClient | null>(null)
  if (!rpcRef.current) {
    rpcRef.current = new RpcClient()
  }
  const rpcClient = rpcRef.current

  const [rpcState, setRpcState] = useState(rpcClient.getState())
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [eventLogs, setEventLogs] = useState<RpcEventLog[]>([])
  const pendingAssistantIdRef = useRef<string | null>(null)

  const addEventLog = useCallback((method: string, detail = '') => {
    setEventLogs((prev) => {
      const next = [{ id: createId(), method, detail }, ...prev]
      return next.slice(0, 6)
    })
  }, [])

  const formatError = useCallback((error: unknown) => {
    if (!error) return ''
    if (typeof error === 'string') return error
    if (typeof error === 'object' && 'message' in error) {
      return String((error as { message?: unknown }).message ?? '')
    }
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }, [])

  useEffect(() => {
    const offState = rpcClient.on('state', ({ state }) => {
      setRpcState(state)
      if (state !== 'open') {
        setSessionId(null)
      }
    })
    const offNotification = rpcClient.on('notification', (notification) => {
      const params =
        notification.params && typeof notification.params === 'object'
          ? (notification.params as Record<string, unknown>)
          : undefined
      const detailValue =
        notification.method === 'event.agent.message'
          ? (params?.message as { message?: unknown } | undefined)?.message
          : params?.detail ?? params?.status ?? params?.message
      const detail =
        typeof detailValue === 'string'
          ? detailValue
          : detailValue
            ? JSON.stringify(detailValue).slice(0, 120)
            : ''

      addEventLog(notification.method, detail)

      if (notification.method === 'event.agent.message') {
        const chunk = typeof detailValue === 'string' ? detailValue : ''
        if (!chunk) return
        setMessages((prev) => {
          const targetId = pendingAssistantIdRef.current
          if (!targetId) {
            return [
              ...prev,
              { id: createId(), role: 'assistant', content: chunk, pending: true },
            ]
          }
          const index = prev.findIndex((message) => message.id === targetId)
          if (index < 0) {
            return [
              ...prev,
              { id: targetId, role: 'assistant', content: chunk, pending: true },
            ]
          }
          const next = [...prev]
          const current = next[index]
          next[index] = {
            ...current,
            content: `${current.content}${chunk}`,
            pending: true,
          }
          return next
        })
      }
    })
    const offError = rpcClient.on('error', (payload) => {
      addEventLog('rpc.error', payload.message)
    })

    rpcClient.connect()

    return () => {
      offState()
      offNotification()
      offError()
      rpcClient.disconnect()
    }
  }, [rpcClient, addEventLog])

  useEffect(() => {
    if (rpcState !== 'open') return
    let active = true
    rpcClient
      .sendRequest<{ session_id?: string }>('session.create', {
        name: 'default',
        profile: 'default',
      })
      .then((result) => {
        if (!active) return
        if (result?.session_id) {
          setSessionId(result.session_id)
          addEventLog('session.create', result.session_id)
        }
      })
      .catch((error) => {
        if (!active) return
        addEventLog('session.create.error', formatError(error))
      })
    return () => {
      active = false
    }
  }, [rpcState, rpcClient, addEventLog, formatError])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || rpcState !== 'open' || !sessionId) return
    setInput('')
    const assistantId = createId()
    pendingAssistantIdRef.current = assistantId
    setMessages((prev) => [
      ...prev,
      { id: createId(), role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ])
    try {
      const result = await rpcClient.sendRequest<{ message?: string }>(
        'agent.send_message',
        {
          session_id: sessionId,
          message: text,
        },
      )
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: message.content || result?.message || '已收到回复。',
                pending: false,
              }
            : message,
        ),
      )
    } catch (error) {
      addEventLog('agent.send_message.error', formatError(error))
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: message.content || '发送失败，请稍后重试。',
                pending: false,
              }
            : message,
        ),
      )
    } finally {
      if (pendingAssistantIdRef.current === assistantId) {
        pendingAssistantIdRef.current = null
      }
    }
  }, [input, rpcState, sessionId, rpcClient, addEventLog, formatError])

  const handleMinimize = () => window.App.windowControls.minimize()
  const handleToggleMaximize = () => window.App.windowControls.toggleMaximize()
  const handleClose = () => window.App.windowControls.close()

  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <header className="app-drag flex items-center justify-between border-b border-slate-100 bg-white/80 px-6 py-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center gap-2 text-pink-500">
          <Gift className="size-6" />
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>奇想盒</span>
            <span className="text-xs text-pink-300">V1.5.3</span>
          </div>
        </div>
        <div className="app-no-drag flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Settings className="size-3" />
            设置
          </button>
          <button
            type="button"
            onClick={() => setIsDark((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {isDark ? <Sun className="size-3" /> : <Moon className="size-3" />}
            {isDark ? '白天' : '夜间'}
          </button>
          <div className="flex items-center gap-2 text-pink-400">
            <button
              type="button"
              onClick={handleMinimize}
              className="flex size-7 items-center justify-center rounded-lg transition hover:bg-pink-50 dark:hover:bg-pink-500/10"
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleToggleMaximize}
              className="flex size-7 items-center justify-center rounded-lg transition hover:bg-pink-50 dark:hover:bg-pink-500/10"
            >
              <Square className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex size-7 items-center justify-center rounded-lg transition hover:bg-pink-50 dark:hover:bg-pink-500/10"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 flex-col border-r border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <nav className="px-4">
            <div className="space-y-2 bg-white px-2 py-3 dark:bg-slate-900/60">
              {navItems.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                    item.active
                      ? 'bg-pink-50 text-pink-500'
                      : 'text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                  } ${item.active ? 'dark:bg-pink-500/15 dark:text-pink-300' : ''}`}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </nav>

          <div className="mt-auto space-y-4 px-4 pb-6">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 shadow-sm dark:from-slate-800 dark:via-slate-900 dark:to-slate-900">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-full bg-white text-pink-400 shadow dark:bg-slate-800 dark:text-pink-300">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                    奇想盒首页
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-400">
                    前往奇想盒首页查看更多详情
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="mt-3 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-pink-400 shadow-sm dark:bg-slate-800 dark:text-pink-300"
              >
                立即前往
              </button>
            </div>

            <div className="flex items-center gap-3 px-2">
              <div className="size-9 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="size-full bg-gradient-to-br from-slate-200 to-slate-400 dark:from-slate-700 dark:to-slate-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                  MOMO
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-400">
                  自动更新有效期至XX
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-10">
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-20 items-center justify-center rounded-3xl bg-pink-100 text-pink-400 dark:bg-pink-500/20 dark:text-pink-300">
                <Gift className="size-10" />
              </div>
              <p className="text-sm text-slate-400 dark:text-slate-400">
                你好，我是奇想盒
              </p>
              <h1 className="text-xl font-semibold text-slate-700 dark:text-slate-100">
                今天需要我帮你做点什么吗？
              </h1>
            </div>

            <div className="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-3">
              {quickActions.map((action) => (
                <div
                  key={action.title}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-pink-50 text-pink-400 dark:bg-pink-500/15 dark:text-pink-300">
                    <action.icon className="size-5" />
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-300">
                    {action.title}
                  </span>
                </div>
              ))}
            </div>

            <div className="w-full max-w-2xl">
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        rpcState === 'open'
                          ? 'bg-emerald-400'
                          : rpcState === 'connecting'
                            ? 'bg-amber-400'
                            : 'bg-slate-400'
                      }`}
                    />
                    <span>RPC {formatRpcState(rpcState)}</span>
                  </div>
                  <span>Session: {sessionId ?? '未建立'}</span>
                </div>

                <div className="mt-3 max-h-40 space-y-2 overflow-auto">
                  {messages.length === 0 ? (
                    <p className="text-xs text-slate-400">暂无对话内容</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-xl px-3 py-2 text-xs ${
                          message.role === 'user'
                            ? 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-300'
                            : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-200'
                        }`}
                      >
                        <span className="mr-2 font-semibold">
                          {message.role === 'user' ? '你' : 'Agent'}
                        </span>
                        <span>
                          {message.content || (message.pending ? '处理中...' : '')}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <p className="text-slate-400">最近事件</p>
                  <div className="mt-2 space-y-1">
                    {eventLogs.length === 0 ? (
                      <p className="text-slate-400">暂无事件</p>
                    ) : (
                      eventLogs.map((event) => (
                        <div key={event.id} className="text-slate-500 dark:text-slate-300">
                          <span className="font-semibold">{event.method}</span>
                          {event.detail ? `：${event.detail}` : ''}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white px-3 pt-3 pb-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-end gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex-1">
                <textarea
                  rows={1}
                  value={input}
                  placeholder={
                    rpcState === 'open'
                      ? '请输入内容...'
                      : 'RPC 未连接，暂无法发送'
                  }
                  onChange={(event) => {
                    const target = event.currentTarget
                    setInput(target.value)
                    target.style.height = 'auto'
                    target.style.height = `${target.scrollHeight}px`
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      handleSend()
                    }
                  }}
                  className="max-h-40 w-full resize-none bg-transparent text-sm text-slate-600 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || rpcState !== 'open' || !sessionId}
                  className="flex size-9 items-center justify-center rounded-xl bg-pink-400 text-white shadow transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
