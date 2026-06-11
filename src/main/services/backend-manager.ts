import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'

import log from 'electron-log/main.js'

import { downloader } from './downloader'
import { pythonManager } from './python-manager'

import path from 'node:path'

// NOTE: This local BackendStatus allows nullable fields (from persisted store).
// The platform interface's BackendStatus (IPythonEnvironmentService) uses non-nullable
// fields since it only returns fully-populated overrides. Keep both in sync if fields change.
type BackendStatus = {
  installed: boolean
  version: string | null
  installedAt: number | null
  packageName: string | null
  entryPoint: string | null
}

const BACKEND_PACKAGE_NAME = 'whimbox'

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

    this.backendStatus = { ...defaultBackendStatus }
  }

  getBackendStatus() {
    return this.backendStatus
  }

  async refreshBackendStatus() {
    try {
      const pythonEnv = await pythonManager.detectPythonEnvironment()
      if (!pythonEnv.installed || !pythonEnv.command) {
        this.backendStatus = { ...defaultBackendStatus }
        return this.backendStatus
      }

      const version = (
        await pythonManager.runCommand(pythonEnv.command, [
          '-s',
          '-c',
          `import importlib.metadata as m; print(m.version("${BACKEND_PACKAGE_NAME}"))`,
        ])
      ).trim()

      this.backendStatus = {
        installed: true,
        version,
        installedAt: null,
        packageName: BACKEND_PACKAGE_NAME,
        entryPoint: BACKEND_PACKAGE_NAME.replace(/-/g, '_'),
      }
    } catch {
      this.backendStatus = { ...defaultBackendStatus }
    }

    return this.backendStatus
  }

  async installWhl(wheelPath: string, deleteWheel = true) {
    if (!wheelPath) {
      throw new Error('没有找到更新包')
    }
    await pythonManager.installWheelPackage(wheelPath)

    const fileName = wheelPath.split(/[\\/]/).pop() ?? ''
    const packageInfo = this.extractPackageInfo(fileName)
    // await pythonManager.runCommand(
    //   pythonManager.embeddedPythonPath,
    //   ['-s', '-m', `${entryPoint}.main`, 'init'],
    //   false,
    // )

    await this.refreshBackendStatus()

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
    await this.refreshBackendStatus()

    if (!this.backendStatus.installed || !this.backendStatus.entryPoint) {
      throw new Error('后端未安装')
    }

    const pythonEnv = await pythonManager.detectPythonEnvironment()
    if (!pythonEnv.command) {
      throw new Error('未找到可用的 Python 环境')
    }

    const backendCwd = app.isPackaged ? dirname(app.getPath('exe')) : process.cwd()
    const proc = spawn(
      pythonManager.embeddedPythonPath,
      ['-s', '-m', `${this.backendStatus.entryPoint}.main`],
      {
        cwd: backendCwd,
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
      log.scope('backend-close').info(`backend process closed with code: ${code}`)
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
