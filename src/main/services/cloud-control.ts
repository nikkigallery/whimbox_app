import type { BrowserWindow } from 'electron'

import { apiRequest } from './launcher-api'
import { getAuthState } from './auth-store'
import { getRpcBridgeState, sendRpcBridgeRequest } from './rpc-bridge'

type CloudState = {
  status: 'idle' | 'connecting' | 'connected' | 'error'
  deviceId: string | null
  expiresAt: string | null
  lastError: string | null
}

let state: CloudState = {
  status: 'idle',
  deviceId: null,
  expiresAt: null,
  lastError: null,
}
let started = false
let refreshTimer: NodeJS.Timeout | null = null
let syncing = false
let mainWindow: BrowserWindow | null = null

function broadcastState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('launcher:cloud-state', state)
}

export function getCloudControlState(): CloudState {
  return { ...state }
}

async function syncCloudGateway() {
  if (syncing) return
  syncing = true
  try {
    const auth = getAuthState()
    if (!auth?.user?.is_vip) {
      state = { status: 'idle', deviceId: null, expiresAt: null, lastError: null }
      broadcastState()
      return
    }
    if (getRpcBridgeState() !== 'open') {
      state = { ...state, status: 'connecting', lastError: null }
      broadcastState()
      return
    }
    const data = await apiRequest<{
      device_id: string
      relay_ws_url: string
      connect_token: string
      expires_at?: string
      user_id?: number
    }>('/whimbox/cloud/device/register', {
      method: 'POST',
      requireAuth: true,
    })
    console.info('[cloud-control] device register response', {
      device_id: data.device_id,
      relay_ws_url: data.relay_ws_url,
      expires_at: data.expires_at ?? null,
    })
    await sendRpcBridgeRequest('cloud.gateway.configure', {
      device_id: data.device_id,
      relay_ws_url: data.relay_ws_url,
      connect_token: data.connect_token,
      expires_at: data.expires_at ?? '',
      user_id: typeof data.user_id === 'number' ? data.user_id : auth.user.id,
    })
    await sendRpcBridgeRequest('cloud.gateway.connect')
    const gatewayStatus = await sendRpcBridgeRequest<{ connected?: boolean; last_error?: string }>('cloud.gateway.status')
    state = {
      status: gatewayStatus?.connected ? 'connected' : 'connecting',
      deviceId: data.device_id,
      expiresAt: data.expires_at ?? null,
      lastError:
        gatewayStatus && typeof gatewayStatus.last_error === 'string' && gatewayStatus.last_error
          ? gatewayStatus.last_error
          : null,
    }
  } catch (error) {
    state = {
      ...state,
      status: 'error',
      lastError: error instanceof Error ? error.message : String(error),
    }
  } finally {
    syncing = false
    broadcastState()
  }
}

export function startCloudControl(window: BrowserWindow) {
  mainWindow = window
  if (started) return
  started = true
  void syncCloudGateway()
  refreshTimer = setInterval(() => {
    void syncCloudGateway()
  }, 60_000)
}

export function notifyCloudAuthChanged() {
  if (!started) return
  void syncCloudGateway()
}

export function stopCloudControl() {
  started = false
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
