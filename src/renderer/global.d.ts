import type { RpcError, RpcNotification, RpcState } from 'shared/rpc-types'

declare global {
  interface Window {
    App: {
      sayHelloFromBridge: () => void
      username?: string
      /** 写入主进程日志文件 userData/logs/app.log */
      log: (tag: string, message: string) => Promise<void>
      onSplashProgress: (callback: (data: { stage: string; message: string }) => void) => () => void
      windowControls: {
        minimize: () => Promise<void>
        minimizeToTray: () => Promise<void>
        toggleMaximize: () => Promise<boolean>
        close: () => Promise<void>
      }
      launcher: {
        openExternal: (url: string) => void
        getAuthPort: () => Promise<number>
        detectPythonEnvironment: () => Promise<{
          installed: boolean
          command?: string
          version?: string
          path?: string
          pipAvailable?: boolean
          message?: string
        }>
        setupPythonEnvironment: () => Promise<{
          installed: boolean
          command?: string
          version?: string
          path?: string
          pipAvailable?: boolean
          message?: string
        }>
        selectWhlFile: () => Promise<string | null>
        installWhl: (wheelPath: string, deleteWheel?: boolean) => Promise<unknown>
        downloadAndInstallWhl: (url: string, md5?: string) => Promise<unknown>
        getBackendStatus: () => Promise<{
          installed: boolean
          version: string | null
          installedAt: number | null
          packageName: string | null
          entryPoint: string | null
        }>
        launchBackend: () => Promise<unknown>
        stopBackend: () => Promise<unknown>
        getAppVersion: () => Promise<string>
        getAnnouncements: () => Promise<{
          announcements: Array<{ title: string; url?: string; created_at: string }>
          hash: string
        }>
        apiRequest: (
          endpoint: string,
          options?: { method?: string; data?: Record<string, unknown>; requireAuth?: boolean },
        ) => Promise<unknown>
        getAuthState: () => Promise<{
          user: { id: number; username: string; avatar?: string; is_vip: boolean; vip_expiry_data?: string }
        } | null>
        logout: () => Promise<void>
        onDownloadProgress: (callback: (data: { progress: number }) => void) => void
        onInstallProgress: (
          callback: (data: { output: string; isError?: boolean }) => void,
        ) => void
        onPythonSetup: (callback: (data: { stage: string; message: string }) => void) => void
        onLaunchBackendStatus: (callback: (data: { message: string }) => void) => void
        onLaunchBackendEnd: (callback: (data: { message: string }) => void) => void
        onAuthState: (
          callback: (data: {
            user: { id: number; username: string; avatar?: string; is_vip: boolean; vip_expiry_data?: string }
          } | null) => void,
        ) => void
        syncSubscribedScripts: (scriptsData: { scripts: Array<{ name: string; md5: string }> }) => Promise<unknown>
        downloadScript: (item: { name: string; md5: string }) => Promise<void>
        deleteScript: (md5: string) => Promise<void>
        onTaskProgress: (
          callback: (data: {
            status: string
            title?: string
            message?: string
            progress?: number
            error?: string
          }) => void,
        ) => () => void
      }
      rpc: {
        getState: () => Promise<RpcState>
        getSessionId: () => Promise<string | null>
        setSessionId: (id: string | null) => Promise<void>
        onSessionId: (callback: (id: string | null) => void) => () => void
        request: <T = unknown>(
          method: string,
          params?: Record<string, unknown>,
        ) => Promise<T>
        notify: (method: string, params?: Record<string, unknown>) => void
        onState: (callback: (data: { state: RpcState }) => void) => () => void
        onNotification: (callback: (data: RpcNotification) => void) => () => void
        onResponse: (
          callback: (data: { id: number; result?: unknown; error?: RpcError }) => void,
        ) => () => void
        onError: (callback: (data: { message: string; error?: unknown }) => void) => () => void
      }
    }
  }
}

export {}
