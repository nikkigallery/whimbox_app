import { BrowserWindow, app, ipcMain } from 'electron'

import { RpcClient } from './rpc-client'
import { backendManager } from './backend-manager'
import { forceShowOverlay, setOverlayIgnoreMouseEvents, showOverlayOnToolStart } from '../windows/overlay'

let initialized = false
const rpcClient = new RpcClient()
let currentSessionId: string | null = null
let mainWindowForTaskStart: BrowserWindow | null = null
let appQuitRequested = false

const quitWhimbox = async () => {
  if (appQuitRequested) return
  appQuitRequested = true
  try {
    await backendManager.stopBackend()
  } finally {
    app.quit()
  }
}

const broadcast = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}

export function setRpcMainWindow(window: BrowserWindow | null) {
  mainWindowForTaskStart = window
}

export function registerRpcBridge() {
  if (initialized) return
  initialized = true

  rpcClient.on('state', (payload) => {
    if (payload.state !== 'open') {
      currentSessionId = null
      broadcast('rpc:session-id', null)
    }
    broadcast('rpc:state', payload)
  })
  rpcClient.on('notification', (payload) => {
    broadcast('rpc:notification', payload)
    if (payload.method === 'event.app.quit') {
      // Give the backend a brief moment to finish publishing the task result
      // before Electron terminates its managed Python process.
      setTimeout(() => void quitWhimbox(), 250)
      return
    }
    if (payload.method === 'event.overlay.show') {
      forceShowOverlay()
      return
    }
    if (payload.method === 'event.run.status') {
      const params = payload.params as {
        source?: string
        phase?: string
        tool_call_id?: string
        ui_behavior?: string
      } | undefined
      const source = params?.source ?? ''
      if (source !== 'agent' && source !== 'task' && source !== 'background') return
      const phase = params?.phase ?? ''
      const usesGameOverlay = params?.ui_behavior === 'game_overlay'
      const hasAgentToolCall = source === 'agent' && typeof params?.tool_call_id === 'string' && params.tool_call_id.length > 0
      const shouldAutoShow =
        usesGameOverlay
        && ((source === 'agent' && phase === 'started' && hasAgentToolCall)
          || (source !== 'agent' && phase === 'started'))
      if (shouldAutoShow) {
        if (
          mainWindowForTaskStart &&
          !mainWindowForTaskStart.isDestroyed() &&
          mainWindowForTaskStart.isVisible() &&
          !mainWindowForTaskStart.isMinimized()
        ) {
          mainWindowForTaskStart.minimize()
        }
        setOverlayIgnoreMouseEvents(true)
        showOverlayOnToolStart()
      } else if (usesGameOverlay && phase === 'stopping') {
        setOverlayIgnoreMouseEvents(false)
      } else if (usesGameOverlay && (phase === 'completed' || phase === 'cancelled' || phase === 'error')) {
        setOverlayIgnoreMouseEvents(false)
      }
    }
  })
  rpcClient.on('error', (payload) => broadcast('rpc:error', payload))

  ipcMain.handle('rpc:get-state', () => rpcClient.getState())
  ipcMain.handle('rpc:get-session-id', () => currentSessionId)
  ipcMain.handle('rpc:set-session-id', (_event, id: string | null) => {
    currentSessionId = id
    broadcast('rpc:session-id', id)
  })
  ipcMain.on(
    'rpc:request',
    (
      event: Electron.IpcMainEvent,
      payload: { requestId: number; method: string; params?: Record<string, unknown> },
    ) => {
      const { requestId, method, params } = payload
      rpcClient
        .sendRequest(method, params)
        .then((result) => {
          event.sender.send('rpc:response', { requestId, result })
        })
        .catch((err) => {
          event.sender.send('rpc:response', { requestId, error: err })
        })
    },
  )
  ipcMain.on(
    'rpc:request-stream',
    (
      event: Electron.IpcMainEvent,
      payload: {
        requestId: number
        method: string
        params?: Record<string, unknown>
        streamChannel: string
      },
    ) => {
      const { streamChannel, method, params } = payload
      rpcClient
        .sendStreamingRequest(method, params, {
          onStreamEvent: (n) => {
            event.sender.send(streamChannel, { type: 'stream_event', data: n })
          },
        })
        .then((result) => {
          event.sender.send(streamChannel, { type: 'done', result })
        })
        .catch((err) => {
          event.sender.send(streamChannel, { type: 'done', error: err })
        })
    },
  )
  ipcMain.on('rpc:notify', (_event, method: string, params?: Record<string, unknown>) => {
    rpcClient.sendNotification(method, params)
  })

  rpcClient.connect()
}

/** 立即发起一次 RPC 重连（用于后台重启后立刻重连，避免等指数退避） */
export function reconnectRpcNow() {
  rpcClient.reconnectNow()
}

export function sendRpcRequest<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
) {
  return rpcClient.sendRequest<T>(method, params)
}

/**
 * 等待 RPC 连接成功（state === 'open'），超时后 resolve(false)。
 */
export function waitForRpcConnected(timeoutMs: number): Promise<boolean> {
  if (rpcClient.getState() === 'open') return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off()
      resolve(false)
    }, timeoutMs)
    const off = rpcClient.on('state', ({ state }) => {
      if (state === 'open') {
        clearTimeout(timer)
        off()
        resolve(true)
      }
    })
  })
}

export function stopRpcBridge() {
  rpcClient.disconnect()
}
