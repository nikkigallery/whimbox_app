declare global {
  interface Window {
    App: {
      sayHelloFromBridge: () => void
      username?: string
      windowControls: {
        minimize: () => Promise<void>
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
        getAppStatus: () => Promise<{
          installed: boolean
          version: string | null
          installedAt: number | null
          packageName: string | null
          entryPoint: string | null
        }>
        launchApp: () => Promise<unknown>
        stopApp: () => Promise<unknown>
        getAppVersion: () => Promise<string>
        openLogsFolder: () => Promise<void>
        getAnnouncements: () => Promise<{
          announcements: Array<{ title: string; url?: string; created_at: string }>
          hash: string
        }>
        apiRequest: (
          endpoint: string,
          options?: { method?: string; data?: Record<string, unknown>; accessToken?: string },
        ) => Promise<unknown>
        onDownloadProgress: (callback: (data: { progress: number }) => void) => void
        onInstallProgress: (
          callback: (data: { output: string; isError?: boolean }) => void,
        ) => void
        onPythonSetup: (callback: (data: { stage: string; message: string }) => void) => void
        onLaunchAppStatus: (callback: (data: { message: string }) => void) => void
        onLaunchAppEnd: (callback: (data: { message: string }) => void) => void
        onAuthCallback: (callback: (data: { refreshToken?: string }) => void) => void
      }
    }
  }
}

export {}
