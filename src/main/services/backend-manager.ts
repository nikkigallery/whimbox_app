import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'
import Store from 'electron-store'

import log from 'electron-log/main.js'

import { downloader } from './downloader'
import { pythonManager } from './python-manager'

import path from 'node:path'

type BackendStatus = {
  installed: boolean
  version: string | null
  installedAt: number | null
  packageName: string | null
  entryPoint: string | null
}

const BACKEND_STATUS_KEY = 'backendStatus'
const backendStatusStore = new Store<{ [BACKEND_STATUS_KEY]: BackendStatus }>({
  name: 'backend-status',
})

const defaultBackendStatus: BackendStatus = {
  installed: false,
  version: '0.0.0',
  installedAt: null,
  packageName: null,
  entryPoint: null,
}

export class BackendManager extends EventEmitter {
  private backendStatus: BackendStatus
  private backendProcess: ReturnType<typeof spawn> | null = null

  constructor() {
    super()

    this.backendStatus = this.loadBackendStatus()
  }

  private loadBackendStatus(): BackendStatus {
    try {
      const stored = backendStatusStore.get(BACKEND_STATUS_KEY)
      if (stored && typeof stored === 'object' && 'installed' in stored) {
        return {
          installed: Boolean(stored.installed),
          version: stored.version ?? null,
          installedAt: stored.installedAt ?? null,
          packageName: stored.packageName ?? null,
          entryPoint: stored.entryPoint ?? null,
        }
      }
    } catch (error) {
      console.error('加载后端状态失败:', error)
    }
    return { ...defaultBackendStatus }
  }

  private saveBackendStatus() {
    try {
      backendStatusStore.set(BACKEND_STATUS_KEY, this.backendStatus)
    } catch (error) {
      console.error('保存后端状态失败:', error)
    }
  }

  getBackendStatus() {
    return this.backendStatus
  }

  async installWhl(wheelPath: string, deleteWheel = true) {
    if (!wheelPath) {
      throw new Error('没有找到更新包')
    }
    await pythonManager.installWheelPackage(wheelPath)

    const fileName = wheelPath.split(/[\\/]/).pop() ?? ''
    const packageInfo = this.extractPackageInfo(fileName)
    const entryPoint = packageInfo.name.replace(/-/g, '_')
    // await pythonManager.runCommand(
    //   pythonManager.embeddedPythonPath,
    //   ['-s', '-m', `${entryPoint}.main`, 'init'],
    //   false,
    // )

    this.backendStatus = {
      installed: true,
      version: packageInfo.version,
      installedAt: Date.now(),
      packageName: packageInfo.name,
      entryPoint,
    }
    this.saveBackendStatus()

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
    const fileName = path.basename(new URL(url).pathname);
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

  async launchBackend() {
    if (!this.backendStatus.installed || !this.backendStatus.entryPoint) {
      throw new Error('后端未安装')
    }

    const pythonEnv = await pythonManager.detectPythonEnvironment()
    if (!pythonEnv.command) {
      throw new Error('未找到可用的 Python 环境')
    }

    const proc = spawn(
      pythonManager.embeddedPythonPath,
      ['-s', '-m', `${this.backendStatus.entryPoint}.main`],
      {
        windowsHide: true,
        env: pythonManager.env,
      },
    )
    this.backendProcess = proc

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf-8').trim()
      if (text) log.scope('backend-stderr').info(text)
    })

    proc.on('error', (error) => {
      log.scope('backend-error').error(error.message)
    })

    proc.on('close', (code) => {
      this.backendProcess = null
      this.emit('launch-backend-end', { message: code != null ? String(code) : 'null' })
    })

    return { success: true }
  }

  async stopBackend() {
    if (!this.backendProcess) {
      return { success: true, message: '后端未运行' }
    }
    this.backendProcess.kill('SIGTERM')
    setTimeout(() => {
      if (this.backendProcess && !this.backendProcess.killed) {
        this.backendProcess.kill('SIGKILL')
      }
    }, 3000)
    return { success: true }
  }
}

export const backendManager = new BackendManager()
