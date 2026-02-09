import { contextBridge, ipcRenderer } from 'electron'
import type { RpcError, RpcNotification, RpcState } from 'shared/rpc-types'

declare global {
  interface Window {
    App: typeof API
  }
}

const API = {
  sayHelloFromBridge: () => console.log('\nHello from bridgeAPI! 👋\n\n'),
  username: process.env.USER,
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
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
    getAppStatus: () => ipcRenderer.invoke('launcher:get-app-status'),
    launchApp: () => ipcRenderer.invoke('launcher:launch-app'),
    stopApp: () => ipcRenderer.invoke('launcher:stop-app'),
    getAppVersion: () => ipcRenderer.invoke('launcher:get-app-version'),
    openLogsFolder: () => ipcRenderer.invoke('launcher:open-logs-folder'),
    getAnnouncements: () => ipcRenderer.invoke('launcher:get-announcements'),
    apiRequest: (
      endpoint: string,
      options?: { method?: string; data?: Record<string, unknown>; accessToken?: string },
    ) => ipcRenderer.invoke('launcher:api-request', endpoint, options),
    onDownloadProgress: (callback: (data: { progress: number }) => void) => {
      ipcRenderer.on('launcher:download-progress', (_, data) => callback(data))
    },
    onInstallProgress: (callback: (data: { output: string; isError?: boolean }) => void) => {
      ipcRenderer.on('launcher:install-progress', (_, data) => callback(data))
    },
    onPythonSetup: (callback: (data: { stage: string; message: string }) => void) => {
      ipcRenderer.on('launcher:python-setup', (_, data) => callback(data))
    },
    onLaunchAppStatus: (callback: (data: { message: string }) => void) => {
      ipcRenderer.on('launcher:launch-app-status', (_, data) => callback(data))
    },
    onLaunchAppEnd: (callback: (data: { message: string }) => void) => {
      ipcRenderer.on('launcher:launch-app-end', (_, data) => callback(data))
    },
    onAuthCallback: (callback: (data: { refreshToken?: string }) => void) => {
      ipcRenderer.on('launcher:auth-callback', (_, data) => callback(data))
    },
    syncSubscribedScripts: (scriptsData: { scripts: Array<{ name: string; md5: string }> }) =>
      ipcRenderer.invoke('launcher:sync-subscribed-scripts', scriptsData),
    downloadScript: (item: { name: string; md5: string }) =>
      ipcRenderer.invoke('launcher:download-script', item),
    deleteScript: (md5: string) => ipcRenderer.invoke('launcher:delete-script', md5),
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
    request: (method: string, params?: Record<string, unknown>) =>
      ipcRenderer.invoke('rpc:request', method, params),
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
