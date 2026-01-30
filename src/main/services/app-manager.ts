import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'

import { downloader } from './downloader'
import { pythonManager } from './python-manager'

type AppStatus = {
  installed: boolean
  version: string | null
  installedAt: number | null
  packageName: string | null
  entryPoint: string | null
}

export class AppManager extends EventEmitter {
  private appDataDir: string
  private logsDir: string
  private statusFilePath: string
  private appStatus: AppStatus
  private appProcess: ReturnType<typeof spawn> | null = null

  constructor() {
    super()
    const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
    this.appDataDir = join(appDir, 'app-data')
    this.logsDir = join(appDir, 'logs')

    if (!existsSync(this.appDataDir)) {
      mkdirSync(this.appDataDir, { recursive: true })
    }
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true })
    }

    this.statusFilePath = join(this.appDataDir, 'app-status.json')
    this.appStatus = this.loadAppStatus()
  }

  private loadAppStatus(): AppStatus {
    try {
      if (existsSync(this.statusFilePath)) {
        const statusData = readFileSync(this.statusFilePath, 'utf-8')
        return JSON.parse(statusData) as AppStatus
      }
    } catch (error) {
      console.error('加载应用状态失败:', error)
    }
    return {
      installed: false,
      version: null,
      installedAt: null,
      packageName: null,
      entryPoint: null,
    }
  }

  private saveAppStatus() {
    try {
      writeFileSync(this.statusFilePath, JSON.stringify(this.appStatus, null, 2))
    } catch (error) {
      console.error('保存应用状态失败:', error)
    }
  }

  getAppStatus() {
    return this.appStatus
  }

  async installWhl(wheelPath: string, deleteWheel = true) {
    if (!wheelPath) {
      throw new Error('没有找到更新包')
    }
    await pythonManager.installWheelPackage(wheelPath)

    const fileName = wheelPath.split(/[\\/]/).pop() ?? ''
    const packageInfo = this.extractPackageInfo(fileName)
    const entryPoint = packageInfo.name.replace(/-/g, '_')
    await pythonManager.runCommand(
      pythonManager.embeddedPythonPath,
      ['-s', '-m', `${entryPoint}.main`, 'init'],
      false,
    )

    this.appStatus = {
      installed: true,
      version: packageInfo.version,
      installedAt: Date.now(),
      packageName: packageInfo.name,
      entryPoint,
    }
    this.saveAppStatus()

    if (deleteWheel) {
      try {
        unlinkSync(wheelPath)
      } catch {
        // ignore cleanup failures
      }
    }

    return { success: true, packageInfo }
  }

  async downloadAndInstallWhl(url: string, md5?: string) {
    const fileName = url.split('/').pop() ?? 'whimbox.whl'
    const wheelPath = await downloader.downloadWheelPackage({ url, fileName, md5 })
    return this.installWhl(wheelPath, true)
  }

  extractPackageInfo(fileName: string) {
    const parts = fileName.split('-')
    if (parts.length < 5) {
      return { name: 'unknown', version: 'unknown' }
    }
    return { name: parts[0], version: parts[1] }
  }

  async launchApp() {
    if (!this.appStatus.installed || !this.appStatus.entryPoint) {
      throw new Error('应用未安装')
    }

    const pythonEnv = await pythonManager.detectPythonEnvironment()
    if (!pythonEnv.command) {
      throw new Error('未找到可用的 Python 环境')
    }

    this.appProcess = spawn(
      pythonManager.embeddedPythonPath,
      ['-s', '-m', `${this.appStatus.entryPoint}.main`],
      {
        windowsHide: true,
        env: pythonManager.env,
      },
    )

    this.appProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString('utf-8')
      if (output.includes('WAIT_FOR_GAME_START')) {
        this.emit('launch-app-status', { message: '等待游戏启动' })
      } else if (output.includes('GAME_STARTED')) {
        this.emit('launch-app-status', { message: '奇想盒启动中' })
      } else if (output.includes('WHIMBOX_READY')) {
        this.emit('launch-app-status', { message: '奇想盒运行中' })
      }
    })

    this.appProcess.stderr.on('data', (data: Buffer) => {
      console.error(`运行异常: ${data.toString('utf-8')}`)
    })

    this.appProcess.on('error', (error) => {
      console.error(`运行异常: ${error.message}`)
    })

    this.appProcess.on('close', (code) => {
      this.appProcess = null
      this.emit('launch-app-end', { message: code != null ? String(code) : 'null' })
    })

    return { success: true }
  }

  async stopApp() {
    if (!this.appProcess) {
      return { success: true, message: '应用未运行' }
    }
    this.appProcess.kill('SIGTERM')
    setTimeout(() => {
      if (this.appProcess && !this.appProcess.killed) {
        this.appProcess.kill('SIGKILL')
      }
    }, 3000)
    return { success: true }
  }

  async openLogsFolder() {
    await shell.openPath(this.logsDir)
  }
}

export const appManager = new AppManager()
