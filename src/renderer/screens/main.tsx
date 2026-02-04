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
  Sparkles,
  Sun,
  Square,
  Target,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { NotificationDrawer, type NotificationItem } from 'renderer/components/notification-drawer'
import { SettingsDialog } from 'renderer/components/settings-dialog'
import { SidebarNavItem } from 'renderer/components/sidebar-nav-item'
import { AutoTriggerPage } from '../pages/auto-trigger-page'
import { HomePage } from '../pages/home-page'
import { AutoNavigatePage } from '../pages/auto-navigate-page'
import { OneDragonPage } from '../pages/one-dragon-page'
import { AutoMacroPage } from '../pages/auto-macro-page'
import { AutoMusicPage } from '../pages/auto-music-page'
import { IpcRpcClient } from 'renderer/lib/ipc-rpc'
import { apiClient } from 'renderer/lib/api-client'

const navItems = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'one-dragon', label: '一条龙', icon: Layers },
  { id: 'auto-trigger', label: '自动触发', icon: Sparkles },
  { id: 'auto-navigate', label: '自动跑图', icon: Map },
  { id: 'auto-macro', label: '键鼠宏', icon: Keyboard },
  { id: 'auto-music', label: '自动演奏', icon: Piano },
]

const quickActions = [
  {
    icon: FileText,
    title: '请帮我执行下日常任务-一条龙',
  },
  {
    icon: Bot,
    title: '待定1',
  },
  {
    icon: Target,
    title: '待定2',
  },
]

type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  pending?: boolean
  title?: string
}

type RpcEventLog = {
  id: string
  method: string
  detail: string
}

type LauncherAppStatus = {
  installed: boolean
  version: string | null
  installedAt: number | null
  packageName: string | null
  entryPoint: string | null
}

type PythonEnvStatus = {
  installed: boolean
  version?: string
  message?: string
}

type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'up-to-date' | 'error'
  message: string
  url?: string
  md5?: string
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

  const rpcRef = useRef<IpcRpcClient | null>(null)
  if (!rpcRef.current) {
    rpcRef.current = new IpcRpcClient()
  }
  const rpcClient = rpcRef.current

  const [rpcState, setRpcState] = useState(rpcClient.getState())
  const [activePage, setActivePage] = useState('home')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [eventLogs, setEventLogs] = useState<RpcEventLog[]>([])
  const pendingAssistantIdRef = useRef<string | null>(null)
  const activeLogGroupIdRef = useRef<string | null>(null)
  const activeLogTitleRef = useRef<string | null>(null)
  const [announcements, setAnnouncements] = useState<NotificationItem[]>([])
  const [announcementsHash, setAnnouncementsHash] = useState<string>('')
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)
  const [userVip, setUserVip] = useState<string>('未登录')
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [pythonStatus, setPythonStatus] = useState<PythonEnvStatus>({
    installed: false,
    message: '未检测',
  })
  const [appStatus, setAppStatus] = useState<LauncherAppStatus | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
    message: '未检测',
  })
  const [progressText, setProgressText] = useState<string>('')
  const [progressPercent, setProgressPercent] = useState<number>(0)
  const [isProcessing, setIsProcessing] = useState(false)

  const launcherApi = useMemo(() => window.App.launcher, [])

  const addEventLog = useCallback((method: string, detail = '') => {
    setEventLogs((prev) => {
      const next = [{ id: createId(), method, detail }, ...prev]
      return next.slice(0, 6)
    })
  }, [])

  const markAnnouncementsSeen = useCallback(() => {
    if (!announcementsHash) return
    localStorage.setItem('whimbox_announcements_hash_seen', announcementsHash)
    setHasUnreadNotifications(false)
  }, [announcementsHash])

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

  const refreshUserState = useCallback(() => {
    const userManager = apiClient.getUserManager()
    if (userManager.isLoggedIn()) {
      const user = userManager.getUser()
      setUserAvatarUrl(userManager.getAvatarUrl())
      setUserName(user?.username ?? '已登录')
      if (user?.is_vip) {
        setUserVip(`自动更新有效期：${user.vip_expiry_data ?? '未知'}`)
      } else if (user?.vip_expiry_data) {
        setUserVip(`自动更新已过期：\n${user.vip_expiry_data}`)
      } else {
        setUserVip('未开通自动更新')
      }
      return true
    }
    setUserName(null)
    setUserAvatarUrl(null)
    setUserVip('未登录')
    return false
  }, [])

  const loadAnnouncements = useCallback(async () => {
    try {
      const result = await launcherApi.getAnnouncements()
      const list = result.announcements ?? []
      list.sort(
        (a: NotificationItem, b: NotificationItem) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      setAnnouncements(list.slice(0, 5))
      if (result.hash) {
        setAnnouncementsHash(result.hash)
        const seenHash = localStorage.getItem('whimbox_announcements_hash_seen')
        setHasUnreadNotifications(result.hash !== seenHash)
      } else {
        setAnnouncementsHash('')
        setHasUnreadNotifications(false)
      }
    } catch (error) {
      addEventLog('announcement.error', formatError(error))
    }
  }, [launcherApi, addEventLog, formatError])

  const checkPythonEnv = useCallback(async () => {
    try {
      const result = await launcherApi.detectPythonEnvironment()
      setPythonStatus({
        installed: result.installed,
        version: result.version,
        message: result.message ?? (result.installed ? '已就绪' : '未安装'),
      })
    } catch (error) {
      setPythonStatus({ installed: false, message: `检测失败：${formatError(error)}` })
    }
  }, [launcherApi, formatError])

  const checkAppStatus = useCallback(async () => {
    try {
      const status = await launcherApi.getAppStatus()
      setAppStatus(status)
    } catch (error) {
      addEventLog('app.status.error', formatError(error))
    }
  }, [launcherApi, addEventLog, formatError])

  const checkUpdate = useCallback(async () => {
    setUpdateState({ status: 'checking', message: '检测中...' })
    try {
      const userManager = apiClient.getUserManager()
      if (!userManager.isLoggedIn()) {
        setUpdateState({ status: 'error', message: '未登录，无法检测更新' })
        return
      }
      const remote = await apiClient.checkWhimboxUpdate()
      const localVersion = appStatus?.version ?? null
      const hasUpdate = localVersion ? remote.version > localVersion : true
      if (hasUpdate) {
        setUpdateState({
          status: 'available',
          message: `发现新版本 ${remote.version}`,
          url: remote.url,
          md5: remote.md5,
        })
      } else {
        setUpdateState({ status: 'up-to-date', message: '已是最新版本' })
      }
    } catch (error) {
      setUpdateState({ status: 'error', message: `检测失败：${formatError(error)}` })
    }
  }, [appStatus?.version, formatError])

  const handleLogin = useCallback(async () => {
    try {
      const port = await launcherApi.getAuthPort()
      const loginUrl = `https://nikkigallery.vip/whimbox?login_redirect_uri=http://localhost:${port}/auth/callback`
      launcherApi.openExternal(loginUrl)
    } catch (error) {
      addEventLog('login.error', formatError(error))
    }
  }, [launcherApi, addEventLog, formatError])

  const handleLogout = useCallback(() => {
    apiClient.logout()
    refreshUserState()
  }, [refreshUserState])

  const handleSetupPython = useCallback(async () => {
    if (pythonStatus.installed) {
      await checkPythonEnv()
      return
    }
    setIsProcessing(true)
    setProgressText('正在配置 Python 环境...')
    setProgressPercent(0)
    try {
      await launcherApi.setupPythonEnvironment()
      await checkPythonEnv()
    } catch (error) {
      setProgressText(`安装失败：${formatError(error)}`)
    } finally {
      setIsProcessing(false)
    }
  }, [launcherApi, checkPythonEnv, formatError, pythonStatus.installed])

  const handleInstallUpdate = useCallback(async () => {
    if (!updateState.url) return
    setIsProcessing(true)
    setUpdateState((prev) => ({ ...prev, status: 'downloading', message: '下载中...' }))
    setProgressText('正在下载更新...')
    setProgressPercent(0)
    try {
      await launcherApi.downloadAndInstallWhl(updateState.url, updateState.md5)
      await checkAppStatus()
      setUpdateState({ status: 'up-to-date', message: '更新完成' })
    } catch (error) {
      setUpdateState({ status: 'error', message: `更新失败：${formatError(error)}` })
    } finally {
      setIsProcessing(false)
    }
  }, [launcherApi, updateState.url, updateState.md5, checkAppStatus, formatError])

  const handleManualUpdate = useCallback(async () => {
    setIsProcessing(true)
    setProgressText('正在选择更新包...')
    try {
      const filePath = await launcherApi.selectWhlFile()
      if (!filePath) {
        setProgressText('已取消手动更新')
        return
      }
      setUpdateState((prev) => ({ ...prev, status: 'installing', message: '安装中...' }))
      setProgressText('正在安装更新...')
      await launcherApi.installWhl(filePath, false)
      await checkAppStatus()
      setUpdateState({ status: 'up-to-date', message: '更新完成' })
    } catch (error) {
      setUpdateState({ status: 'error', message: `手动更新失败：${formatError(error)}` })
    } finally {
      setIsProcessing(false)
    }
  }, [launcherApi, checkAppStatus, formatError])

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

      if (notification.method === 'event.agent.status') {
        const status = typeof params?.status === 'string' ? params.status : ''
        const detailText =
          typeof params?.detail === 'string' && params.detail
            ? params.detail
            : ''
        if (status === 'on_tool_start') {
          if (pendingAssistantIdRef.current) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === pendingAssistantIdRef.current
                  ? { ...message, pending: false }
                  : message,
              ),
            )
            pendingAssistantIdRef.current = null
          }
          activeLogGroupIdRef.current = createId()
          activeLogTitleRef.current = detailText
        }
        if (status === 'on_tool_end' || status === 'on_tool_error') {
          if (pendingAssistantIdRef.current) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === pendingAssistantIdRef.current
                  ? { ...message, pending: false }
                  : message,
              ),
            )
            pendingAssistantIdRef.current = null
          }
          activeLogGroupIdRef.current = null
          activeLogTitleRef.current = null
        }
      }

      if (notification.method === 'event.task.progress') {
        const detailText =
          typeof params?.detail === 'string' ? params.detail : ''
        const toolId = typeof params?.tool_id === 'string' ? params.tool_id : ''
        if (detailText === 'started') {
          if (!activeLogGroupIdRef.current) {
            activeLogGroupIdRef.current = createId()
            activeLogTitleRef.current = toolId || null
          }
        } else if (
          detailText === 'completed' ||
          detailText === 'cancelled'
        ) {
          activeLogGroupIdRef.current = null
          activeLogTitleRef.current = null
        }
      }

      if (notification.method === 'event.agent.message') {
        const chunk = typeof detailValue === 'string' ? detailValue : ''
        if (!chunk) return
        setMessages((prev) => {
          const targetId = pendingAssistantIdRef.current
          if (!targetId) {
            const newId = createId()
            pendingAssistantIdRef.current = newId
            return [
              ...prev,
              { id: newId, role: 'assistant', content: chunk, pending: true },
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

      if (notification.method === 'event.task.log') {
        const targetSessionId =
          typeof params?.session_id === 'string' ? params.session_id : null
        if (targetSessionId && sessionId && targetSessionId !== sessionId) {
          return
        }
        const message =
          typeof params?.message === 'string'
            ? params.message
            : typeof params?.raw_message === 'string'
              ? params.raw_message
              : ''
        if (!message) return
        setMessages((prev) => {
          const activeId = activeLogGroupIdRef.current
          if (!activeId) {
            return [
              ...prev,
              { id: createId(), role: 'system', content: message },
            ]
          }
          const index = prev.findIndex((item) => item.id === activeId)
          const title = activeLogTitleRef.current
            ? `工具运行日志 · ${activeLogTitleRef.current}`
            : '工具运行日志'
          if (index < 0) {
            return [
              ...prev,
              {
                id: activeId,
                role: 'system',
                title,
                content: message,
              },
            ]
          }
          const next = [...prev]
          const current = next[index]
          next[index] = {
            ...current,
            title: current.title ?? title,
            content: current.content
              ? `${current.content}\n${message}`
              : message,
          }
          return next
        })
      }
    })
    const offError = rpcClient.on('error', (payload) => {
      addEventLog('rpc.error', payload.message)
    })

    return () => {
      offState()
      offNotification()
      offError()
    }
  }, [rpcClient, addEventLog, sessionId])

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

  useEffect(() => {
    refreshUserState()
    loadAnnouncements()
    checkPythonEnv()
    checkAppStatus()

    const onAuth = (data: { refreshToken?: string }) => {
      if (!data.refreshToken) return
      apiClient
        .loginWithRefreshToken(data.refreshToken)
        .then(() => {
          refreshUserState()
          checkUpdate()
        })
        .catch((error) => {
          addEventLog('login.error', formatError(error))
        })
    }

    launcherApi.onAuthCallback(onAuth)
    launcherApi.onDownloadProgress((data) => {
      setProgressPercent(data.progress)
    })
    launcherApi.onInstallProgress((data) => {
      setProgressText(data.output)
    })
    launcherApi.onPythonSetup((data) => {
      if (data.stage === 'setup-complete') {
        setProgressPercent(100)
      }
      setProgressText(data.message)
    })
  }, [
    launcherApi,
    refreshUserState,
    loadAnnouncements,
    checkPythonEnv,
    checkAppStatus,
    checkUpdate,
    addEventLog,
    formatError,
  ])

  useEffect(() => {
    if (!appStatus) return
    const userManager = apiClient.getUserManager()
    if (!userManager.isLoggedIn()) return
    checkUpdate()
  }, [appStatus, checkUpdate])

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

  const renderPage = () => {
    switch (activePage) {
      case 'one-dragon':
        return <OneDragonPage sessionId={sessionId} rpcState={rpcState} />
      case 'auto-trigger':
        return <AutoTriggerPage />
      case 'auto-navigate':
        return <AutoNavigatePage />
      case 'auto-macro':
        return <AutoMacroPage />
      case 'auto-music':
        return <AutoMusicPage />
      case 'home':
      default:
        return (
          <HomePage
            quickActions={quickActions}
            messages={messages}
            input={input}
            rpcState={rpcState}
            sessionId={sessionId}
            onInputChange={setInput}
            onSend={handleSend}
          />
        )
    }
  }

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
          <SettingsDialog
            pythonStatus={pythonStatus}
            appStatus={appStatus}
            updateState={updateState}
            isProcessing={isProcessing}
            onSetupPython={handleSetupPython}
            onCheckUpdate={checkUpdate}
            onInstallUpdate={handleInstallUpdate}
            onManualUpdate={handleManualUpdate}
          />
          <button
            type="button"
            onClick={() => setIsDark((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {isDark ? <Sun className="size-3" /> : <Moon className="size-3" />}
            {isDark ? '白天' : '夜间'}
          </button>
          <NotificationDrawer
            items={announcements}
            onOpenExternal={(url) => launcherApi.openExternal(url)}
            hasUnread={hasUnreadNotifications}
            onOpenChange={(open) => {
              if (open) {
                markAnnouncementsSeen()
              }
            }}
          />
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
        <aside className="flex w-60 flex-col border-r border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <nav className="px-4">
            <div className="space-y-2 bg-white px-2 py-3 dark:bg-slate-900/60">
              {navItems.map((item) => (
                <SidebarNavItem
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  active={activePage === item.id}
                  onClick={() => setActivePage(item.id)}
                />
              ))}
            </div>
          </nav>

          <div className="mt-auto space-y-4 px-4 pb-6">

            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="size-9 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  {userAvatarUrl ? (
                    <img
                      src={userAvatarUrl}
                      alt={userName ?? '用户头像'}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="size-full bg-gradient-to-br from-slate-200 to-slate-400 dark:from-slate-700 dark:to-slate-500" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-100">
                      {userName ?? '未登录'}
                    </p>
                    {userName ? (
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        退出
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleLogin}
                        className="rounded-full bg-pink-400 px-3 py-1 text-xs text-white shadow"
                      >
                        登录
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                    {userVip}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex flex-1 flex-col">
          {renderPage()}

        </section>
      </div>
    </main>
  )
}
