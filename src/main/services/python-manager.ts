import { app } from 'electron'
import AdmZip from 'adm-zip'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'

type PythonEnvInfo = {
  installed: boolean
  command?: string
  version?: string
  path?: string
  pipAvailable?: boolean
  message?: string
}

type SpeedResult = {
  fastest: string
  speed: number
  results: Array<{ source: string; speed: number }>
  error?: string
}

const DEFAULT_PIP_SOURCES = [
  'https://mirrors.ustc.edu.cn/pypi/simple/',
  'https://pypi.tuna.tsinghua.edu.cn/simple/',
  'https://mirrors.cloud.tencent.com/pypi/simple/',
  'https://mirrors.aliyun.com/pypi/simple/',
]

export class PythonManager extends EventEmitter {
  embeddedPythonDir: string
  embeddedPythonPath: string
  embeddedPythonScriptsDir: string
  env: NodeJS.ProcessEnv

  constructor() {
    super()
    const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
    this.embeddedPythonDir = join(appDir, 'python-embedded')
    this.embeddedPythonPath = join(this.embeddedPythonDir, 'python.exe')
    this.embeddedPythonScriptsDir = join(this.embeddedPythonDir, 'Scripts')
    this.env = {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: '',
      PATH: `${this.embeddedPythonDir};${this.embeddedPythonScriptsDir};${process.env.PATH ?? ''}`,
      PYTHONHOME: this.embeddedPythonDir,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
  }

  async detectPythonEnvironment(): Promise<PythonEnvInfo> {
    try {
      if (existsSync(this.embeddedPythonPath)) {
        const versionInfo = await this.getPythonVersion(this.embeddedPythonPath)
        const pipAvailable = await this.isPipAvailable(this.embeddedPythonPath)
        if (!pipAvailable) {
          return { installed: false, message: 'pip 未安装' }
        }
        return {
          installed: true,
          command: this.embeddedPythonPath,
          version: versionInfo.version,
          path: this.embeddedPythonPath,
          pipAvailable,
        }
      }
      return { installed: false, message: '需要安装内置 Python 环境' }
    } catch (error) {
      return { installed: false, message: `检测失败: ${(error as Error).message}` }
    }
  }

  async setupEmbeddedPython(): Promise<PythonEnvInfo> {
    try {
      const pythonExists = existsSync(this.embeddedPythonPath)
      if (!pythonExists) {
        this.emit('setup-start', { message: '正在设置内置 Python 环境...' })
        await this.extractEmbeddedPython()
        this.emit('setup-complete', { message: '内置 Python 环境设置完成' })
      } else {
        this.emit('setup-complete', { message: '检测到已有内置 Python 环境' })
      }

      const versionInfo = await this.getPythonVersion(this.embeddedPythonPath)
      const pipAvailable = await this.isPipAvailable(this.embeddedPythonPath)
      if (!pipAvailable) {
        throw new Error('pip 未能成功安装，环境配置失败')
      }

      return {
        installed: true,
        command: this.embeddedPythonPath,
        version: versionInfo.version,
        path: this.embeddedPythonPath,
        pipAvailable: true,
      }
    } catch (error) {
      throw new Error(`设置内置 Python 失败: ${(error as Error).message}`)
    }
  }

  async extractEmbeddedPython() {
    const resourceBase = process.resourcesPath ?? app.getAppPath()
    const packagedZipPath = join(resourceBase, 'assets', 'Python312.zip')
    const devZipPath = join(app.getAppPath(), 'assets', 'Python312.zip')
    const zipPath = existsSync(packagedZipPath) ? packagedZipPath : devZipPath

    if (!existsSync(zipPath)) {
      throw new Error(`找不到内置 Python 压缩包: ${zipPath}`)
    }

    if (!existsSync(this.embeddedPythonDir)) {
      mkdirSync(this.embeddedPythonDir, { recursive: true })
    }

    this.emit('extract-progress', { message: '正在解压内置 Python 环境...' })
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(this.embeddedPythonDir, true)
    this.emit('extract-complete', { message: '内置 Python 解压完成' })
  }

  async getPythonVersion(command: string) {
    const versionOutput = await this.runCommand(command, ['--version'])
    return { version: versionOutput.trim(), path: command }
  }

  async isPipAvailable(pythonCommand: string) {
    try {
      await this.runCommand(pythonCommand, ['-s', '-m', 'pip', '--version'], false, 5000)
      return true
    } catch {
      return false
    }
  }

  async selectFastestPipSource(sources: string[] = DEFAULT_PIP_SOURCES): Promise<SpeedResult> {
    try {
      this.emit('speed-test-start', {
        message: '正在测试 pip 源速度...',
        total: sources.length,
      })

      const results = await Promise.all(
        sources.map(async (source, index) => {
          const speed = await this.testPipSourceSpeed(source)
          this.emit('speed-test-progress', {
            source,
            speed,
            index,
            total: sources.length,
            message: speed === 0 ? `测试 ${source}: 失败或超时` : `测试 ${source}: ${speed.toFixed(2)} KB/s`,
          })
          return { source, speed }
        }),
      )

      const fastest = results.reduce((prev, current) => (current.speed > prev.speed ? current : prev))
      this.emit('speed-test-complete', {
        fastest: fastest.source,
        speed: fastest.speed,
        results,
        message: `最快的 pip 源: ${fastest.source} (${fastest.speed.toFixed(2)} KB/s)`,
      })

      return {
        fastest: fastest.source,
        speed: fastest.speed,
        results,
      }
    } catch (error) {
      this.emit('speed-test-error', { error: (error as Error).message })
      return {
        fastest: sources[0],
        speed: 0,
        results: [],
        error: (error as Error).message,
      }
    }
  }

  async testPipSourceSpeed(sourceUrl: string, timeout = 5000) {
    return new Promise<number>((resolve) => {
      const urlObj = new URL(sourceUrl)
      const protocol = urlObj.protocol === 'https:' ? httpsRequest : httpRequest
      let downloadedBytes = 0
      let downloadStartTime: number | null = null

      const timeoutId = setTimeout(() => {
        resolve(0)
      }, timeout)

      const testPath = `${urlObj.pathname.replace(/\/$/, '')}/pip/`
      const req = protocol(
        {
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: testPath,
          method: 'GET',
          headers: {
            'User-Agent': 'pip/23.0 (python 3.12)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
          },
        },
        (res) => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 400) {
            clearTimeout(timeoutId)
            res.destroy()
            resolve(0)
            return
          }

          res.on('data', (chunk: Buffer) => {
            if (!downloadStartTime) {
              downloadStartTime = Date.now()
            }
            downloadedBytes += chunk.length
            const elapsed = Date.now() - downloadStartTime
            if (downloadedBytes >= 50 * 1024 || elapsed >= 2000) {
              clearTimeout(timeoutId)
              res.destroy()
              resolve((downloadedBytes / 1024) / (elapsed / 1000))
            }
          })

          res.on('end', () => {
            clearTimeout(timeoutId)
            if (!downloadStartTime || downloadedBytes === 0) {
              resolve(0)
              return
            }
            const elapsed = Date.now() - downloadStartTime
            resolve((downloadedBytes / 1024) / (elapsed / 1000))
          })

          res.on('error', () => {
            clearTimeout(timeoutId)
            resolve(0)
          })
        },
      )

      req.on('error', () => {
        clearTimeout(timeoutId)
        resolve(0)
      })
      req.end()
    })
  }

  async installWheelPackage(wheelPath: string) {
    try {
      if (!existsSync(wheelPath)) {
        throw new Error(`Wheel 包文件不存在: ${wheelPath}`)
      }
      const pythonEnv = await this.detectPythonEnvironment()
      if (!pythonEnv.installed || !pythonEnv.command) {
        throw new Error('Python 环境未安装')
      }

      this.emit('install-start', {
        wheelPath,
        pythonVersion: pythonEnv.version,
      })

      const { fastest } = await this.selectFastestPipSource()
      this.emit('install-progress', {
        output: `使用最快的 pip 源: ${fastest}\n`,
      })

      await this.runCommand(pythonEnv.command, ['-s', '-m', 'pip', 'install', '-i', fastest, 'setuptools'], true)
      const result = await this.runCommand(
        pythonEnv.command,
        ['-s', '-m', 'pip', 'install', '-i', fastest, wheelPath],
        true,
        10 * 60 * 1000,
      )

      this.emit('install-complete', {
        wheelPath,
        success: true,
        output: result,
      })

      return { success: true, output: result }
    } catch (error) {
      this.emit('install-error', { wheelPath, error: (error as Error).message })
      throw new Error(`安装 wheel 包失败: ${(error as Error).message}`)
    }
  }

  runCommand(command: string, args: string[], emitProgress = false, timeout = 30000) {
    return new Promise<string>((resolve, reject) => {
      const processRef = spawn(command, args, {
        windowsHide: true,
        env: this.env,
      })
      let stdout = ''
      let stderr = ''
      let timeoutId: NodeJS.Timeout | undefined

      if (timeout) {
        timeoutId = setTimeout(() => {
          processRef.kill()
          reject(new Error('命令执行超时'))
        }, timeout)
      }

      processRef.stdout.on('data', (data: Buffer) => {
        const output = data.toString('utf-8')
        stdout += output
        if (emitProgress) {
          this.emit('install-progress', { output })
        }
      })

      processRef.stderr.on('data', (data: Buffer) => {
        const output = data.toString('utf-8')
        stderr += output
        if (emitProgress) {
          this.emit('install-progress', { output, isError: true })
        }
      })

      processRef.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId)
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`命令执行失败，退出码: ${code ?? '未知'}, 错误: ${stderr}`))
        }
      })

      processRef.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId)
        reject(error)
      })
    })
  }
}

export const pythonManager = new PythonManager()
