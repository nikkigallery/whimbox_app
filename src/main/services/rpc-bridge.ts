import { BrowserWindow, ipcMain } from 'electron'

import { RpcClient } from './rpc-client'

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
  rpcClient.on('notification', (payload) => broadcast('rpc:notification', payload))
  rpcClient.on('response', (payload) => broadcast('rpc:response', payload))
  rpcClient.on('error', (payload) => broadcast('rpc:error', payload))

  ipcMain.handle('rpc:get-state', () => rpcClient.getState())
  ipcMain.handle('rpc:get-session-id', () => currentSessionId)
  ipcMain.handle('rpc:set-session-id', (_event, id: string | null) => {
    currentSessionId = id
    broadcast('rpc:session-id', id)
  })
  ipcMain.handle('rpc:request', (_event, method: string, params?: Record<string, unknown>) =>
    rpcClient.sendRequest(method, params),
  )
  ipcMain.on('rpc:notify', (_event, method: string, params?: Record<string, unknown>) => {
    rpcClient.sendNotification(method, params)
  })

  rpcClient.connect()
}

export function stopRpcBridge() {
  rpcClient.disconnect()
}
