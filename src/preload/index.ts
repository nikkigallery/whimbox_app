import { contextBridge, ipcRenderer } from 'electron'
import type { RpcError, RpcNotification, RpcState } from 'shared/rpc-types'

declare global {
  interface Window {
    App: typeof API
  }
}

let rpcRequestId = 0
const rpcPending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: unknown) => void }
>()
ipcRenderer.on(
  'rpc:response',
  (
    _: Electron.IpcRendererEvent,
    data: { requestId: number; result?: unknown; error?: RpcError },
  ) => {
    const p = rpcPending.get(data.requestId)
    rpcPending.delete(data.requestId)
    if (p) {
      if (data.error != null) p.reject(data.error)
      else p.resolve(data.result)
    }
  },
)

/** 与 main 进程 AppUpdateState 一致，供渲染进程使用 */
type AppUpdateState = {
  status: string
  message: string
  version?: string
  url?: string
  transferred?: number
  total?: number
}

const API = {
  sayHelloFromBridge: () => console.log('\nHello from bridgeAPI! 👋\n\n'),
  username: process.env.USER,
  appUpdater: {
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    downloadAndInstallUpdate: () => ipcRenderer.invoke('app:download-and-install-update'),
    quitAndInstall: () => ipcRenderer.invoke('app:quit-and-install'),
    getManualUpdateUrl: () => ipcRenderer.invoke('app:get-manual-update-url') as Promise<string | null>,
    onUpdateState: (callback: (state: AppUpdateState) => void) => {
      const listener = (_: Electron.IpcRendererEvent, state: AppUpdateState) => callback(state)
      ipcRenderer.on('app:update-state', listener)
      return () => ipcRenderer.removeListener('app:update-state', listener)
    },
  },
  onSplashProgress: (callback: (data: { stage: string; message: string }) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: { stage: string; message: string }) =>
      callback(data)
    ipcRenderer.on('splash:python-progress', listener)
    return () => ipcRenderer.removeListener('splash:python-progress', listener)
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  overlay: {
    setIgnoreMouseEvents: (ignore: boolean) =>
      ipcRenderer.invoke('overlay:set-ignore-mouse-events', ignore),
    setPosition: (x: number, y: number) =>
      ipcRenderer.invoke('overlay:set-position', x, y),
    getBounds: () =>
      ipcRenderer.invoke('overlay:get-bounds') as Promise<{
        x: number
        y: number
        width: number
        height: number
      }>,
    setBounds: (x: number, y: number, width: number, height: number) =>
      ipcRenderer.invoke('overlay:set-bounds', x, y, width, height),
    setBoundsNoSave: (x: number, y: number, width: number, height: number) =>
      ipcRenderer.invoke('overlay:set-bounds-no-save', x, y, width, height),
    hide: () => ipcRenderer.invoke('overlay:hide'),
    show: () => ipcRenderer.invoke('overlay:show'),
    addShownAsBallListener: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('overlay:shown-as-ball', listener)
      return () => {
        ipcRenderer.removeListener('overlay:shown-as-ball', listener)
      }
    },
  },
  conversation: {
    getState: () =>
      ipcRenderer.invoke('conversation:get-state') as Promise<{
        messages: Array<{
          id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          pending?: boolean
          title?: string
          blocks?: Array<{ type: 'text' | 'log'; content: string; title?: string }>
        }>
        rpcState?: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
        sessionId?: string | null
        toolRunning?: boolean
      }>,
    pushState: (payload: {
      messages: unknown[]
      rpcState?: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
      sessionId?: string | null
      toolRunning?: boolean
    }) => ipcRenderer.send('conversation:push-state', payload),
    send: (text: string) => ipcRenderer.send('conversation:send', text),
    onState: (
      callback: (data: {
        messages: unknown[]
        rpcState?: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
        sessionId?: string | null
        toolRunning?: boolean
      }) => void,
    ) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        data: {
          messages: unknown[]
          rpcState?: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
          sessionId?: string | null
          toolRunning?: boolean
        },
      ) => callback(data)
      ipcRenderer.on('conversation:state', listener)
      return () => {
        ipcRenderer.removeListener('conversation:state', listener)
      }
    },
    onRunSend: (callback: (text: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, text: string) => callback(text)
      ipcRenderer.on('conversation:run-send', listener)
      return () => {
        ipcRenderer.removeListener('conversation:run-send', listener)
      }
    },
  },
  launcher: {
    openExternal: (url: string) => ipcRenderer.send('launcher:open-external', url),
    getAuthPort: () => ipcRenderer.invoke('launcher:get-auth-port'),
    detectPythonEnvironment: () => ipcRenderer.invoke('launcher:detect-python'),
    setupPythonEnvironment: () => ipcRenderer.invoke('launcher:setup-python'),
    selectWhlFile: () => ipcRenderer.invoke('launcher:select-whl-file'),
    installWhl: (wheelPath: string, deleteWheel = true) =>
      ipcRenderer.invoke('launcher:install-whl', wheelPath, deleteWheel),
    downloadAndInstallWhl: (url: string, md5?: string) =>
      ipcRenderer.invoke('launcher:download-and-install-whl', url, md5),
    downloadAndInstallLatestWhl: () =>
      ipcRenderer.invoke('launcher:download-and-install-latest-whl'),
    getBackendStatus: () => ipcRenderer.invoke('launcher:get-backend-status'),
    launchBackend: () => ipcRenderer.invoke('launcher:launch-backend'),
    stopBackend: () => ipcRenderer.invoke('launcher:stop-backend'),
    restartBackend: (title?: string) => ipcRenderer.invoke('launcher:restart-backend', title),
    getAppVersion: () => ipcRenderer.invoke('launcher:get-app-version'),
    getAnnouncements: () => ipcRenderer.invoke('launcher:get-announcements'),
    apiRequest: (
      endpoint: string,
      options?: { method?: string; data?: Record<string, unknown>; requireAuth?: boolean },
    ) => ipcRenderer.invoke('launcher:api-request', endpoint, options),
    getAuthState: () => ipcRenderer.invoke('launcher:get-auth-state'),
    refreshAuth: () => ipcRenderer.invoke('launcher:refresh-auth'),
    logout: () => ipcRenderer.invoke('launcher:logout'),
    onDownloadProgress: (callback: (data: { progress: number }) => void) => {
      ipcRenderer.on('launcher:download-progress', (_, data) => callback(data))
    },
    onInstallProgress: (callback: (data: { output: string; isError?: boolean }) => void) => {
      ipcRenderer.on('launcher:install-progress', (_, data) => callback(data))
    },
    onPythonSetup: (callback: (data: { stage: string; message: string }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { stage: string; message: string }) =>
        callback(data)
      ipcRenderer.on('launcher:python-setup', listener)
      return () => ipcRenderer.removeListener('launcher:python-setup', listener)
    },
    onLaunchBackendEnd: (callback: (data: { message: string }) => void) => {
      ipcRenderer.on('launcher:launch-backend-end', (_, data) => callback(data))
    },
    onAuthState: (
      callback: (data: { user: { id: number; username: string; avatar?: string; is_vip: boolean; vip_expiry_data?: string } } | null) => void,
    ) => {
      ipcRenderer.on('launcher:auth-state', (_, data) => callback(data))
    },
    syncSubscribedScripts: (
      scriptsData: { scripts: Array<{ name: string; md5: string }> },
      options?: { emitNoChangeSuccess?: boolean },
    ) => ipcRenderer.invoke('launcher:sync-subscribed-scripts', scriptsData, options),
    downloadScript: (item: { name: string; md5: string }) =>
      ipcRenderer.invoke('launcher:download-script', item),
    deleteScript: (md5: string) => ipcRenderer.invoke('launcher:delete-script', md5),
    openScriptsFolder: () => ipcRenderer.invoke('launcher:open-scripts-folder'),
    openLogsFolder: () => ipcRenderer.invoke('launcher:open-logs-folder'),
    onTaskProgress: (
      callback: (data: { status: string; title?: string; message?: string; progress?: number; error?: string }) => void,
    ) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        data: { status: string; title?: string; message?: string; progress?: number; error?: string },
      ) => callback(data)
      ipcRenderer.on('launcher:task-progress', listener)
      return () => ipcRenderer.removeListener('launcher:task-progress', listener)
    },
  },
  rpc: {
    getState: () => ipcRenderer.invoke('rpc:get-state'),
    getSessionId: () => ipcRenderer.invoke('rpc:get-session-id') as Promise<string | null>,
    setSessionId: (id: string | null) => ipcRenderer.invoke('rpc:set-session-id', id),
    onSessionId: (callback: (id: string | null) => void) => {
      const listener = (_: Electron.IpcRendererEvent, id: string | null) => callback(id)
      ipcRenderer.on('rpc:session-id', listener)
      return () => ipcRenderer.removeListener('rpc:session-id', listener)
    },
    request: (method: string, params?: Record<string, unknown>) => {
      const requestId = ++rpcRequestId
      ipcRenderer.send('rpc:request', { requestId, method, params })
      return new Promise<unknown>((resolve, reject) => {
        rpcPending.set(requestId, { resolve, reject })
      })
    },
    requestStream: (
      method: string,
      params: Record<string, unknown> | undefined,
      onStreamEvent: (data: RpcNotification) => void,
    ): Promise<unknown> => {
      const requestId = ++rpcRequestId
      const streamChannel = `rpc:stream:${requestId}`
      return new Promise<unknown>((resolve, reject) => {
        const listener = (
          _: Electron.IpcRendererEvent,
          msg: { type: string; data?: RpcNotification; result?: unknown; error?: RpcError },
        ) => {
          if (msg.type === 'stream_event' && msg.data) {
            onStreamEvent(msg.data)
            return
          }
          if (msg.type === 'done') {
            ipcRenderer.removeAllListeners(streamChannel)
            if (msg.error != null) reject(msg.error)
            else resolve(msg.result)
          }
        }
        ipcRenderer.on(streamChannel, listener)
        ipcRenderer.send('rpc:request-stream', {
          requestId,
          method,
          params,
          streamChannel,
        })
      })
    },
    notify: (method: string, params?: Record<string, unknown>) =>
      ipcRenderer.send('rpc:notify', method, params),
    onState: (callback: (data: { state: RpcState }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { state: RpcState }) => callback(data)
      ipcRenderer.on('rpc:state', listener)
      return () => ipcRenderer.removeListener('rpc:state', listener)
    },
    onNotification: (callback: (data: RpcNotification) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        data: RpcNotification,
      ) => callback(data)
      ipcRenderer.on('rpc:notification', listener)
      return () => ipcRenderer.removeListener('rpc:notification', listener)
    },
    onResponse: (callback: (data: { id: number; result?: unknown; error?: RpcError }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        data: { id: number; result?: unknown; error?: RpcError },
      ) => callback(data)
      ipcRenderer.on('rpc:response', listener)
      return () => ipcRenderer.removeListener('rpc:response', listener)
    },
    onError: (callback: (data: { message: string; error?: unknown }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        data: { message: string; error?: unknown },
      ) => callback(data)
      ipcRenderer.on('rpc:error', listener)
      return () => ipcRenderer.removeListener('rpc:error', listener)
    },
  },
}

contextBridge.exposeInMainWorld('App', API)
