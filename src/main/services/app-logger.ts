import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import log from 'electron-log/main.js'

const LOG_RETAIN_DAYS = 7
const LOG_FILE_PREFIX = 'app-'

/** 删除超过保留天数的按日日志文件 */
function deleteOldLogs(logsDir: string) {
  const now = Date.now()
  const pattern = /^app-(\d{4})-(\d{2})-(\d{2})\.log$/
  for (const name of readdirSync(logsDir)) {
    try{
      const m = name.match(pattern)
        if (!m) continue
      const filePath = join(logsDir, name)
      const stat = statSync(filePath)
      const ageDays = (now - stat.birthtimeMs) / 86400000
      if (ageDays > LOG_RETAIN_DAYS) {
        unlinkSync(filePath)
      }
    } catch {
      // ignore
    }
  }
}

/** 配置日志：按天存储为 logs/app-YYYY-MM-DD.log，超过 7 天自动删除。需在 app ready 后调用。 */
export function configureLogFile() {
  const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
  const logsDir = join(appDir, 'logs')
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true })
  }
  deleteOldLogs(logsDir)
  log.transports.file.resolvePathFn = () => {
    const dateStr = new Date().toISOString().slice(0, 10)
    return join(logsDir, `${LOG_FILE_PREFIX}${dateStr}.log`)
  }
}

/** 初始化 electron-log（主进程 + 接收渲染进程日志）。日志路径由 configureLogFile() 在 app ready 时配置。 */
export function registerAppLogger() {
  log.initialize({ spyRendererConsole: false })
}
