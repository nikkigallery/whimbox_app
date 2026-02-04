import { BrowserWindow, ipcMain } from 'electron'

import { RpcClient } from './rpc-client'

let initialized = false
const rpcClient = new RpcClient()

const broadcast = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}

export function registerRpcBridge() {
  if (initialized) return
  initialized = true

  rpcClient.on('state', (payload) => broadcast('rpc:state', payload))
  rpcClient.on('notification', (payload) => broadcast('rpc:notification', payload))
  rpcClient.on('response', (payload) => broadcast('rpc:response', payload))
  rpcClient.on('error', (payload) => broadcast('rpc:error', payload))

  ipcMain.handle('rpc:get-state', () => rpcClient.getState())
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
