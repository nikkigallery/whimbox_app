import log from 'electron-log/renderer'
import {
  Bot,
  ChevronDown,
  FileText,
  Gift,
  Home,
  Layers,
  Map,
  Minus,
  Keyboard,
  PanelBottomClose,
  Piano,
  PlayCircle,
  Rss,
  Send,
  Sparkles,
  Square,
  Target,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from 'renderer/lib/utils'
import {
  GlobalProgressModal,
  type TaskProgressState,
} from 'renderer/components/global-progress-modal'
import { NotificationDrawer } from 'renderer/components/notification-drawer'
import { SettingsDialog } from 'renderer/components/settings-dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from 'renderer/components/ui/sidebar'
import { AutoTriggerPage } from '../pages/auto-trigger-page'
import { HomePage } from '../pages/home-page'
import { AutoNavigatePage } from '../pages/auto-navigate-page'
import { OneDragonPage } from '../pages/one-dragon-page'
import { AutoMacroPage } from '../pages/auto-macro-page'
import { AutoMusicPage } from '../pages/auto-music-page'
import { ScriptSubscribePage } from '../pages/script-subscribe-page'
import { IpcRpcClient } from 'renderer/lib/ipc-rpc'
import { apiClient } from 'renderer/lib/api-client'
import { toast } from 'sonner'
import { Toaster } from 'renderer/components/ui/sonner'
import { UpdatePromptDialog } from 'renderer/components/update-prompt-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'renderer/components/ui/collapsible'
import { AliveScope, KeepAlive } from 'react-activation'

// React 18+ createRoot 下需关闭 autoFreeze，否则 KeepAlive 可能异常
const keepAlive = KeepAlive as unknown as { defaultProps?: { autoFreeze?: boolean } }
if (keepAlive.defaultProps) keepAlive.defaultProps.autoFreeze = false

type NavItem =
  | { id: string; label: string; icon: typeof Home }
  | {
      id: string
      label: string
      icon: typeof PlayCircle
      children: { id: string; label: string; icon: typeof Map }[]
    }

const navItems: NavItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'one-dragon', label: '一条龙', icon: Layers },
  { id: 'auto-trigger', label: '自动触发', icon: Sparkles },
  {
    id: 'script-run',
    label: '运行脚本',
    icon: PlayCircle,
    children: [
      { id: 'auto-navigate', label: '跑图脚本', icon: Map },
      { id: 'auto-macro', label: '宏脚本', icon: Keyboard },
      { id: 'auto-music', label: '演奏脚本', icon: Piano },
    ],
  },
  { id: 'script-subscribe', label: '脚本订阅', icon: Rss },
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

type RpcEventLog = {
  id: string
  method: string
  detail: string
}

type LauncherBackendStatus = {
  installed: boolean
  version: string | null
  installedAt: number | null
  packageName: string | null
  entryPoint: string | null
}

type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'up-to-date' | 'error'
  message: string
  url?: string
  md5?: string
  transferred?: number
  total?: number
}

const IGNORED_VERSION_KEY = 'ignored_version'

function compareVersion(a: string, b: string): number {
  const parse = (s: string) => {
    const parts = s.replace(/^v/i, '').split('.')
    return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, parseInt(parts[2], 10) || 0]
  }
  const [ma, mi, pa] = parse(a)
  const [mb, mj, pb] = parse(b)
  if (ma !== mb) return ma > mb ? 1 : -1
  if (mi !== mj) return mi > mj ? 1 : -1
  if (pa !== pb) return pa > pb ? 1 : -1
  return 0
}

function getIgnoredVersion(): string | null {
  try {
    return localStorage.getItem(IGNORED_VERSION_KEY)
  } catch {
    return null
  }
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
  const rpcRef = useRef<IpcRpcClient | null>(null)
  if (!rpcRef.current) {
    rpcRef.current = new IpcRpcClient()
  }
  const rpcClient = rpcRef.current

  const [rpcState, setRpcState] = useState(rpcClient.getState())
  const [activePage, setActivePage] = useState('home')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [eventLogs, setEventLogs] = useState<RpcEventLog[]>([])
  const [userName, setUserName] = useState<string | null>(null)
  const [userVip, setUserVip] = useState<string>('未登录')
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [backendStatus, setBackendStatus] = useState<LauncherBackendStatus | null>(null)
  const [electronVersion, setElectronVersion] = useState('')
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
    message: '未检测',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [taskProgressState, setTaskProgressState] = useState<TaskProgressState>({ status: 'idle' })
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false)
  const [updatePromptCurrent, setUpdatePromptCurrent] = useState('')
  const [updatePromptNew, setUpdatePromptNew] = useState('')

  const launcherApi = useMemo(() => window.App.launcher, [])
  const appUpdater = useMemo(() => window.App.appUpdater, [])

  const displayVersion = useMemo(() => {
    const ev = electronVersion || '0.0.0'
    const bv = backendStatus?.version ?? '0.0.0'
    const max = compareVersion(ev, bv) >= 0 ? ev : bv
    return max
  }, [electronVersion, backendStatus?.version])

  useEffect(() => {
    launcherApi.getAppVersion().then((v) => setElectronVersion(v ?? '0.0.0'))
    launcherApi.getBackendStatus().then((status) => setBackendStatus(status))
  }, [launcherApi])

  const pendingUnifiedCheckRef = useRef(false)
  type UnifiedBackend = { version: string; url: string; md5: string } | null
  type UnifiedElectron = { status: string; version?: string } | null
  const unifiedCheckRef = useRef<{
    currentElectronVersion: string
    currentBackendVersion: string
    backend: UnifiedBackend | undefined
    electron: UnifiedElectron | undefined
    fromSettings: boolean
  }>({
    currentElectronVersion: '',
    currentBackendVersion: '',
    backend: undefined,
    electron: undefined,
    fromSettings: false,
  })
  const lastUnifiedCheckResultRef = useRef<{
    hasBackend: boolean
    url?: string
    md5?: string
    hasElectron: boolean
  } | null>(null)
  const tryFinishUnifiedCheckRef = useRef<() => void>(() => {})
  /** 为 true 时把 Electron 更新状态推到 GlobalProgressModal，不再在设置里展示 */
  const electronUpdateInModalRef = useRef(false)

  useEffect(() => {
    const unsubscribe = appUpdater.onUpdateState((state) => {
      setUpdateState({
        status: state.status as UpdateState['status'],
        message: state.message,
        url: state.url,
        transferred: state.transferred,
        total: state.total,
      })
      if (pendingUnifiedCheckRef.current &&
        (state.status === 'available' || state.status === 'up-to-date' || state.status === 'error')
      ) {
        unifiedCheckRef.current.electron = { status: state.status, version: state.version }
        tryFinishUnifiedCheckRef.current()
      }
      if (electronUpdateInModalRef.current) {
        const title = '更新应用'
        if (state.status === 'checking' || state.status === 'available' || state.status === 'downloading') {
          const progress =
            state.status === 'downloading' &&
            state.total != null &&
            state.total > 0 &&
            state.transferred != null
              ? Math.round((state.transferred / state.total) * 100)
              : undefined
          setTaskProgressState({
            status: 'running',
            title,
            message: state.message,
            progress,
          })
        } else if (state.status === 'installing' || state.status === 'up-to-date') {
          electronUpdateInModalRef.current = false
          setTaskProgressState({
            status: 'success',
            title,
            message: state.status === 'installing' ? state.message : state.message || '更新完成',
          })
        } else if (state.status === 'error') {
          electronUpdateInModalRef.current = false
          setTaskProgressState({ status: 'error', title, error: state.message })
        }
      }
    })
    return () => {
      unsubscribe()
    }
  }, [appUpdater])

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

  const applyAuthState = useCallback(
    (state: { user: { username?: string; avatar?: string; is_vip?: boolean; vip_expiry_data?: string } } | null) => {
      if (state?.user) {
        const user = state.user
        setUserName(user.username ?? '已登录')
        setUserAvatarUrl(
          user.avatar ? `https://nikkigallery.vip/static/img/avatar/${user.avatar}` : null,
        )
        if (user.is_vip) {
          setUserVip(`自动更新：${user.vip_expiry_data ?? '未知'}`)
        } else if (user.vip_expiry_data) {
          setUserVip('自动更新已过期')
        } else {
          setUserVip('未开通自动更新')
        }
      } else {
        setUserName(null)
        setUserAvatarUrl(null)
        setUserVip('未登录')
      }
    },
    [],
  )

  const refreshUserState = useCallback(() => {
    launcherApi.getAuthState().then(applyAuthState)
  }, [launcherApi, applyAuthState])

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

  const refreshBackendScripts = useCallback(() => {
    rpcClient.sendRequest('script.refresh', {}).catch(() => {})
  }, [rpcClient])

  const runUnifiedUpdateCheck = useCallback(
    (fromSettings: boolean) => {
      const currentBackendVersion = backendStatus?.version ?? '0.0.0'
      pendingUnifiedCheckRef.current = true
      unifiedCheckRef.current = {
        currentElectronVersion: '',
        currentBackendVersion,
        backend: undefined,
        electron: undefined,
        fromSettings,
      }
      setUpdateState((s) => ({ ...s, status: 'checking', message: '正在检查更新…' }))

      const tryFinish = () => {
        const r = unifiedCheckRef.current
        if (r.currentElectronVersion === '' || r.backend === undefined || r.electron === undefined) return
        pendingUnifiedCheckRef.current = false
        const needBackend =
          r.backend && compareVersion(r.backend.version, r.currentBackendVersion) > 0
        const needElectron =
          r.electron?.status === 'available' &&
          r.electron.version != null &&
          compareVersion(r.electron.version, r.currentElectronVersion) > 0
        const candidates: string[] = []
        if (needBackend && r.backend) candidates.push(r.backend.version)
        if (needElectron && r.electron?.version) candidates.push(r.electron.version)
        const newVersion = candidates.reduce(
          (max, v) => (compareVersion(v, max) > 0 ? v : max),
          candidates[0] ?? '',
        )
        const currentDisplayVersion =
          compareVersion(r.currentElectronVersion, r.currentBackendVersion) >= 0
            ? r.currentElectronVersion
            : r.currentBackendVersion
        const ignored = getIgnoredVersion()
        if (newVersion && newVersion !== ignored) {
          lastUnifiedCheckResultRef.current = {
            hasBackend: !!needBackend,
            url: needBackend && r.backend ? r.backend.url : undefined,
            md5: needBackend && r.backend ? r.backend.md5 : undefined,
            hasElectron: !!needElectron,
          }
          setUpdatePromptCurrent(currentDisplayVersion)
          setUpdatePromptNew(newVersion)
          setUpdatePromptOpen(true)
        } else {
          if (fromSettings) {
            toast.success('当前已是最新版本')
          }
          setUpdateState((s) => ({ ...s, status: 'up-to-date', message: '当前已是最新版本' }))
        }
      }

      tryFinishUnifiedCheckRef.current = tryFinish

      launcherApi.getAppVersion().then((v) => {
        unifiedCheckRef.current.currentElectronVersion = v ?? '0.0.0'
        tryFinishUnifiedCheckRef.current()
      })
      apiClient
        .checkWhimboxUpdate()
        .then((res) => {
          unifiedCheckRef.current.backend = res
          tryFinishUnifiedCheckRef.current()
        })
        .catch(() => {
          unifiedCheckRef.current.backend = null
          tryFinishUnifiedCheckRef.current()
        })
      appUpdater.checkForUpdates()
    },
    [launcherApi, appUpdater, backendStatus?.version],
  )

  const handleCheckAppUpdate = useCallback(() => {
    runUnifiedUpdateCheck(true)
  }, [runUnifiedUpdateCheck])

  const handleManualAppUpdate = useCallback(async () => {
    const path = await launcherApi.selectWhlFile()
    if (!path) return
    setTaskProgressState({ status: 'running', title: '安装后端', message: '正在安装…' })
    try {
      await launcherApi.installWhl(path)
      setTaskProgressState({ status: 'success', title: '安装后端', message: '安装完成' })
      const status = await launcherApi.getBackendStatus()
      setBackendStatus(status)
    } catch (err) {
      setTaskProgressState({
        status: 'error',
        title: '安装后端',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [launcherApi])

  const handleUpdatePromptUpdate = useCallback(async () => {
    const result = lastUnifiedCheckResultRef.current
    if (!result) return
    if (result.hasBackend) {
      setTaskProgressState({ status: 'running', title: '更新后端', message: '正在下载安装…' })
      try {
        await launcherApi.downloadAndInstallLatestWhl()
        setTaskProgressState({ status: 'success', title: '更新后端', message: '安装完成' })
      } catch (err) {
        setTaskProgressState({
          status: 'error',
          title: '更新后端',
          error: err instanceof Error ? err.message : String(err),
        })
        return
      }
    }
    if (result.hasElectron) {
      const status = updateState.status
      log.scope('更新应用').info(`handleUpdatePromptUpdate status: ${status}`)
      electronUpdateInModalRef.current = true
      setTaskProgressState({
        status: 'running',
        title: '更新应用',
        message: status === 'available' ? updateState.message : '正在更新应用…',
      })
      if (status === 'installing') {
        appUpdater.quitAndInstall()
      } else if (status === 'available') {
        try {
          await appUpdater.downloadAndInstallUpdate()
        } catch (err) {
          electronUpdateInModalRef.current = false
          setTaskProgressState({
            status: 'error',
            title: '更新应用',
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }, [launcherApi, appUpdater, updateState.status, updateState.message])

  const handleUpdatePromptIgnore = useCallback(() => {
    try {
      localStorage.setItem(IGNORED_VERSION_KEY, updatePromptNew)
    } catch {
      // ignore
    }
  }, [updatePromptNew])

  const syncSubscribedScripts = useCallback(
    async (opts?: { showFeedbackWhenNoChange?: boolean }) => {
      const authState = await launcherApi.getAuthState()
      if (!authState?.user?.is_vip) return
      try {
        const data = await apiClient.getAllSubscribedScripts()
        if (data.scripts?.length) {
          await launcherApi.syncSubscribedScripts(data, {
            emitNoChangeSuccess: opts?.showFeedbackWhenNoChange,
          })
        } else {
          setTaskProgressState({
            status: 'success',
            title: '同步订阅脚本',
            message: '暂无订阅脚本',
          })
        }
        refreshBackendScripts()
      } catch (err) {
        setTaskProgressState({
          status: 'error',
          title: '同步订阅脚本',
          error: err instanceof Error ? err.message : '获取订阅列表失败',
        })
      }
    },
    [launcherApi, refreshBackendScripts],
  )

  useEffect(() => {
    const off = launcherApi.onTaskProgress(
      (data: { status: string; title?: string; message?: string; progress?: number; error?: string }) => {
        setTaskProgressState({
          status: data.status as 'running' | 'success' | 'error',
          title: data.title,
          message: data.message,
          progress: data.progress,
          error: data.error,
        })
      },
    )
    return () => {
      off()
    }
  }, [launcherApi])

  useEffect(() => {
    const offState = rpcClient.on('state', ({ state }) => {
      setRpcState(state)
      if (state !== 'open') {
        setSessionId(null)
      }
    })
    const offError = rpcClient.on('error', (payload) => {
      addEventLog('rpc.error', payload.message)
    })
    return () => {
      offState()
      offError()
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
          window.App.rpc.setSessionId(result.session_id)
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
    launcherApi.onAuthState((data) => {
      applyAuthState(data)
      if (data?.user?.is_vip) {
        syncSubscribedScripts()
        runUnifiedUpdateCheck(false)
      }
    })

    launcherApi.refreshAuth().catch(() => {})
    refreshUserState()
  }, [
    launcherApi,
    applyAuthState,
    refreshUserState,
    syncSubscribedScripts,
    runUnifiedUpdateCheck,
  ])

  const handleMinimize = () => window.App.windowControls.minimize()
  const handleMinimizeToTray = () => window.App.windowControls.minimizeToTray()
  const handleToggleMaximize = () => window.App.windowControls.toggleMaximize()
  const handleClose = () => window.App.windowControls.close()

  const getPageContent = (pageId: string) => {
    switch (pageId) {
      case 'one-dragon':
        return <OneDragonPage sessionId={sessionId} rpcState={rpcState} />
      case 'auto-trigger':
        return <AutoTriggerPage />
      case 'auto-navigate':
        return <AutoNavigatePage sessionId={sessionId} rpcState={rpcState} />
      case 'auto-macro':
        return <AutoMacroPage sessionId={sessionId} rpcState={rpcState} />
      case 'auto-music':
        return <AutoMusicPage sessionId={sessionId} rpcState={rpcState} />
      case 'script-subscribe':
        return (
          <ScriptSubscribePage
            onOpenExternal={launcherApi.openExternal}
            onRefreshBackendScripts={refreshBackendScripts}
          />
        )
      case 'home':
      default:
        return (
          <HomePage
            quickActions={quickActions}
            rpcClient={rpcClient}
            sessionId={sessionId}
            rpcState={rpcState}
            addEventLog={addEventLog}
            formatError={formatError}
          />
        )
    }
  }

  return (
    <>
      <Toaster />
      <UpdatePromptDialog
        open={updatePromptOpen}
        onClose={() => setUpdatePromptOpen(false)}
        currentVersion={updatePromptCurrent}
        newVersion={updatePromptNew}
        onUpdate={handleUpdatePromptUpdate}
        onIgnore={handleUpdatePromptIgnore}
      />
      <GlobalProgressModal
        state={taskProgressState}
        onClose={() => setTaskProgressState({ status: 'idle' })}
        onRestartAndInstall={() => appUpdater.quitAndInstall()}
      />
      <AliveScope>
      <main className="flex h-screen flex-col bg-background text-foreground">
      <header className="app-drag flex items-center justify-between border-b border-slate-100 bg-white/80 px-6 py-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center gap-2 text-pink-500">
          <Gift className="size-6" />
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>奇想盒</span>
            <span className="text-xs text-pink-300">{displayVersion || '—'}</span>
          </div>
        </div>
        <div className="app-no-drag flex items-center gap-3">
          <SettingsDialog
            displayVersion={displayVersion}
            updateState={updateState}
            isProcessing={isProcessing}
            onCheckUpdate={handleCheckAppUpdate}
            onManualUpdate={handleManualAppUpdate}
            onSyncScripts={() => syncSubscribedScripts({ showFeedbackWhenNoChange: true })}
          />
          <NotificationDrawer/>
          <div className="flex items-center gap-2 text-pink-400">
            <button
              type="button"
              onClick={handleMinimizeToTray}
              className="flex size-7 items-center justify-center rounded-lg transition hover:bg-pink-50 dark:hover:bg-pink-500/10"
              title="缩小到托盘"
            >
              <PanelBottomClose className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleMinimize}
              className="flex size-7 items-center justify-center rounded-lg transition hover:bg-pink-50 dark:hover:bg-pink-500/10"
              title="最小化"
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
              <X className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <SidebarProvider className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1">
          <Sidebar collapsible="none" className="shrink-0 w-55">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) =>
                      'children' in item ? (
                        <SidebarMenuItem key={item.id}>
                          <Collapsible defaultOpen className="group">
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton
                                asChild
                                isActive={item.children.some((c) => c.id === activePage)}
                                tooltip={item.label}
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition [&_svg.chevron]:shrink-0 [&_svg.chevron]:transition-transform group-data-[state=open]:[&_svg.chevron]:rotate-180',
                                    item.children.some((c) => c.id === activePage)
                                      ? 'bg-pink-50 text-pink-500 dark:bg-pink-500/15 dark:text-pink-300'
                                      : 'text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60',
                                  )}
                                >
                                  <item.icon className="size-4 shrink-0" />
                                  <span className="flex-1 text-left">{item.label}</span>
                                  <ChevronDown className="chevron size-4" />
                                </button>
                              </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub>
                                {item.children.map((sub) => (
                                  <SidebarMenuSubItem key={sub.id}>
                                    <SidebarMenuSubButton asChild isActive={activePage === sub.id}>
                                      <button
                                        type="button"
                                        onClick={() => setActivePage(sub.id)}
                                        className={cn(
                                          'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition',
                                          activePage === sub.id
                                            ? 'bg-pink-50 text-pink-500 dark:bg-pink-500/15 dark:text-pink-300'
                                            : 'text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60',
                                        )}
                                      >
                                        <sub.icon className="size-4 shrink-0" />
                                        <span>{sub.label}</span>
                                      </button>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                ))}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </Collapsible>
                        </SidebarMenuItem>
                      ) : (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            asChild
                            isActive={activePage === item.id}
                            tooltip={item.label}
                          >
                            <button
                              type="button"
                              onClick={() => setActivePage(item.id)}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition',
                                activePage === item.id
                                ? "bg-pink-50 text-pink-500 dark:bg-pink-500/15 dark:text-pink-300"
                                : "text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60",
                              )}
                            >
                              <item.icon className="size-4 shrink-0" />
                              <span>{item.label}</span>
                            </button>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 my-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <div className="size-9 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-base font-semibold text-slate-700 dark:text-slate-100">
                        {userName ?? '未登录'}
                      </p>
                      {userName ? (
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          退出
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleLogin}
                          className="shrink-0 rounded-full bg-pink-400 px-3 py-1 text-xs text-white shadow"
                        >
                          登录
                        </button>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-400">
                      {userVip}
                    </p>
                  </div>
                </div>
              </div>
            </SidebarFooter>
          </Sidebar>
          <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <KeepAlive name={activePage} cacheKey={activePage}>
              <div className="absolute inset-0 flex flex-col overflow-hidden">
                {getPageContent(activePage)}
              </div>
            </KeepAlive>
          </section>
        </div>
      </SidebarProvider>
      </main>
      </AliveScope>
    </>
  )
}
