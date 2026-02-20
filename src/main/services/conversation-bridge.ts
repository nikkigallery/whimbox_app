import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'

import { getOverlayWindow } from '../windows/overlay'

/** 与 renderer UiMessage 结构一致，主进程只做存储与转发 */
type StoredMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  pending?: boolean
  title?: string
  blocks?: Array<{ type: 'text' | 'log'; content: string; title?: string }>
}

export type ConversationState = {
  messages: StoredMessage[]
  rpcState?: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
  sessionId?: string | null
  toolRunning?: boolean
}

let mainWindowRef: BrowserWindow | null = null
let conversationState: ConversationState = { messages: [] }

function sendToOverlay(channel: string, payload: unknown) {
  const win = getOverlayWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

export function registerConversationBridge(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow

  ipcMain.handle('conversation:get-state', () => conversationState)

  ipcMain.on(
    'conversation:push-state',
    (_event, payload: ConversationState) => {
      conversationState = {
        messages: payload.messages ?? [],
        rpcState: payload.rpcState,
        sessionId: payload.sessionId,
        toolRunning: payload.toolRunning,
      }
      sendToOverlay('conversation:state', conversationState)
    },
  )

  ipcMain.on('conversation:send', (_event, text: string) => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('conversation:run-send', text)
    }
  })
}
