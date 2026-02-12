import { app, ipcMain } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

const IPC_CHANNEL = 'app:log'
const LOG_RETAIN_DAYS = 7

function getLogsDir(): string {
  const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
  const logsDir = join(appDir, 'logs')
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true })
  }
  return logsDir
}

function getLogFilePath(): string {
  const logsDir = getLogsDir()
  const dateStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return join(logsDir, `app-${dateStr}.log`)
}

function deleteOldLogs(): void {
  try {
    const logsDir = getLogsDir()
    const now = Date.now()
    const maxAgeMs = LOG_RETAIN_DAYS * 24 * 60 * 60 * 1000
    const pattern = /^app-(\d{4})-(\d{2})-(\d{2})\.log$/
    for (const name of readdirSync(logsDir)) {
      const m = name.match(pattern)
      if (!m) continue
      const [, y, mon, d] = m
      const fileDate = new Date(parseInt(y!, 10), parseInt(mon!, 10) - 1, parseInt(d!, 10)).getTime()
      if (now - fileDate > maxAgeMs) {
        unlinkSync(join(logsDir, name))
      }
    }
  } catch {
    // ignore
  }
}

function formatLine(tag: string, message: string): string {
  const ts = new Date().toISOString()
  return `${ts} [${tag}] ${message}\n`
}

export function registerAppLogger() {
  ipcMain.handle(IPC_CHANNEL, (_event, tag: string, message: string) => {
    try {
      deleteOldLogs()
      const path = getLogFilePath()
      const line = formatLine(
        typeof tag === 'string' ? tag : 'renderer',
        typeof message === 'string' ? message : String(message),
      )
      appendFileSync(path, line, 'utf8')
    } catch (e) {
      console.error('[app-logger] write failed:', e)
    }
  })
}
