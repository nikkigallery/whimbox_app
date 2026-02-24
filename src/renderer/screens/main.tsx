import {
  ChevronDown,
  CircleDot,
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
  Sparkles,
  Square,
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
import { useHomeConversation } from 'renderer/hooks/use-home-conversation'
import { useUnifiedUpdate } from 'renderer/hooks/use-unified-update'
import { toast } from 'sonner'
import { Toaster } from 'renderer/components/ui/sonner'
import { UpdatePromptDialog } from 'renderer/components/update-prompt-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'renderer/components/ui/collapsible'
import { AliveScope, KeepAlive } from 'react-activation'
import log from 'electron-log/renderer'

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
  { id: 'script-subscribe', label: '订阅脚本', icon: Rss },
]

export function MainScreen() {
  const rpcRef = useRef<IpcRpcClient | null>(null)
  if (!rpcRef.current) {
    rpcRef.current = new IpcRpcClient()
  }
  const rpcClient = rpcRef.current

  const [rpcState, setRpcState] = useState(rpcClient.getState())
  const [activePage, setActivePage] = useState('home')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userVip, setUserVip] = useState<string>('未登录')
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [taskProgressState, setTaskProgressState] = useState<TaskProgressState>({ status: 'idle' })
  const [toolRunning, setToolRunning] = useState(false)

  const launcherApi = useMemo(() => window.App.launcher, [])
  const appUpdater = useMemo(() => window.App.appUpdater, [])

  const {
    displayVersion,
    updateState,
    updatePromptOpen,
    updatePromptCurrent,
    updatePromptNew,
    closeUpdatePrompt,
    runUnifiedUpdateCheck,
    handleCheckAppUpdate,
    handleManualAppUpdate,
    handleUpdatePromptUpdate,
    handleUpdatePromptIgnore,
  } = useUnifiedUpdate({
    launcherApi,
    appUpdater,
    setTaskProgressState,
  })

  useEffect(
    () => () => {
      rpcRef.current?.destroy()
      rpcRef.current = null
    },
    [],
  )

  const homeConversation = useHomeConversation({
    rpcClient,
    sessionId,
    rpcState,
  })
  const {
    messages,
    input,
    setInput,
    handleSend,
    handleStop,
    isConversationPending,
  } = homeConversation

  useEffect(() => {
    const off = rpcClient.on('notification', (n) => {
      if (n.method !== 'event.run.status') return
      const params = n.params as { source?: string; phase?: string } | undefined
      if (params?.source !== 'agent') return
      const phase = params?.phase ?? ''
      if (phase === 'started' || phase === 'stopping') setToolRunning(true)
      else if (phase === 'completed' || phase === 'cancelled' || phase === 'error') setToolRunning(false)
    })
    return () => off()
  }, [rpcClient])

  useEffect(() => {
    window.App.conversation.pushState({
      messages,
      rpcState,
      sessionId,
      toolRunning,
      conversationPending: isConversationPending,
    })
  }, [isConversationPending, messages, rpcState, sessionId, toolRunning])

  useEffect(() => {
    const off = window.App.conversation.onRunSend((text: string) => {
      handleSend(text)
    })
    return () => off()
  }, [handleSend])

  useEffect(() => {
    const off = window.App.conversation.onRunStop(() => {
      handleStop()
    })
    return () => off()
  }, [handleStop])

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
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }, [launcherApi])

  const handleLogout = useCallback(() => {
    apiClient.logout()
    refreshUserState()
  }, [refreshUserState])

  const refreshBackendScripts = useCallback(() => {
    rpcClient.sendRequest('script.refresh', {}).catch(() => {})
  }, [rpcClient])

  const syncSubscribedScripts = useCallback(
    async (opts?: { showFeedbackWhenNoChange?: boolean }) => {
      const authState = await launcherApi.getAuthState()
      try{
        if (!authState?.user?.is_vip) {
          refreshBackendScripts()
          setTaskProgressState({
            status: 'success',
            title: '刷新脚本',
            message: '刷新脚本完成',
          })
        }else{
          const data = await apiClient.getAllSubscribedScripts()
          if (data.scripts?.length) {
            await launcherApi.syncSubscribedScripts(data, {
              emitNoChangeSuccess: opts?.showFeedbackWhenNoChange,
            })
          } else {
            setTaskProgressState({
              status: 'success',
              title: '刷新脚本',
              message: '暂无订阅脚本',
            })
          }
          refreshBackendScripts()
        }
      } catch (err) {
        setTaskProgressState({
          status: 'error',
          title: '刷新脚本',
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
      toast.error(payload.message || 'RPC 连接异常')
    })
    // 挂载后主动拉取一次当前状态，避免 RPC 在 starting 阶段已 open 而主界面未收到广播
    void rpcClient.getStateAsync().then(setRpcState)
    return () => {
      offState()
      offError()
    }
  }, [rpcClient])

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
        }
      })
      .catch(() => {
        if (!active) return
        toast.error('会话创建失败')
      })
    return () => {
      active = false
    }
  }, [rpcState, rpcClient])

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
        return <OneDragonPage rpcClient={rpcClient} sessionId={sessionId} rpcState={rpcState} />
      case 'auto-trigger':
        return <AutoTriggerPage rpcClient={rpcClient} />
      case 'auto-navigate':
        return <AutoNavigatePage rpcClient={rpcClient} sessionId={sessionId} rpcState={rpcState} />
      case 'auto-macro':
        return <AutoMacroPage rpcClient={rpcClient} sessionId={sessionId} rpcState={rpcState} />
      case 'auto-music':
        return <AutoMusicPage rpcClient={rpcClient} sessionId={sessionId} rpcState={rpcState} />
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
            messages={messages}
            input={input}
            setInput={setInput}
            handleSend={handleSend}
            handleStop={handleStop}
            isConversationPending={isConversationPending}
            rpcState={rpcState}
            sessionId={sessionId}
          />
        )
    }
  }

  return (
    <>
      <Toaster />
      <UpdatePromptDialog
        open={updatePromptOpen}
        onClose={closeUpdatePrompt}
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
          <button
            type="button"
            onClick={() => window.App?.overlay?.show?.()}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            title="悬浮窗关闭后，点击可重新显示悬浮窗"
          >
            <CircleDot className="size-3" />
            悬浮窗
          </button>
          <SettingsDialog
            displayVersion={displayVersion}
            updateState={updateState}
            isProcessing={isProcessing}
            onCheckUpdate={handleCheckAppUpdate}
            onManualUpdate={handleManualAppUpdate}
            onSyncScripts={() => syncSubscribedScripts({ showFeedbackWhenNoChange: true })}
            rpcClient={rpcClient}
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
            {['auto-navigate', 'auto-macro', 'auto-music'].includes(activePage) ? (
              <div className="absolute inset-0 flex flex-col overflow-hidden">
                {getPageContent(activePage)}
              </div>
            ) : (
              <KeepAlive name={activePage} cacheKey={activePage}>
                <div className="absolute inset-0 flex flex-col overflow-hidden">
                  {getPageContent(activePage)}
                </div>
              </KeepAlive>
            )}
          </section>
        </div>
      </SidebarProvider>
      </main>
      </AliveScope>
    </>
  )
}
