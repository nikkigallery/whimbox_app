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

let mainWindowRef: BrowserWindow | null = null
let conversationMessages: StoredMessage[] = []

function sendToOverlay(channel: string, payload: unknown) {
  const win = getOverlayWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

export function registerConversationBridge(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow

  ipcMain.handle('conversation:get-state', () => ({
    messages: conversationMessages,
  }))

  ipcMain.on(
    'conversation:push-state',
    (_event, payload: { messages: StoredMessage[] }) => {
      conversationMessages = payload.messages ?? []
      sendToOverlay('conversation:state', { messages: conversationMessages })
    },
  )

  ipcMain.on('conversation:send', (_event, text: string) => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('conversation:run-send', text)
    }
  })
}
