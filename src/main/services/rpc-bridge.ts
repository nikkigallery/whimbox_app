import { BrowserWindow, ipcMain } from 'electron'

import { RpcClient } from './rpc-client'
import { setOverlayIgnoreMouseEvents, showOverlayOnToolStart } from '../windows/overlay'
import log from 'electron-log/main.js'

let initialized = false
const rpcClient = new RpcClient()
let currentSessionId: string | null = null

const broadcast = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
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
    if (payload.method === 'event.agent.status') {
      const status = (payload.params as { status?: string } | undefined)?.status
      if (status === 'on_tool_start') {
        setOverlayIgnoreMouseEvents(true)
        showOverlayOnToolStart()
      } else if (status === 'on_tool_end' || status === 'on_tool_error') {
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
