import * as fs from 'node:fs'
import * as path from 'node:path'
import { app, shell } from 'electron'
import { EventEmitter } from 'node:events'

const SCRIPTS_BASE_URL = 'https://nikkigallery.vip/static/whimbox/scripts'

export type ScriptItem = { name: string; md5: string }

export type ScriptsData = { scripts: ScriptItem[] }

type ProgressPayload = {
  status: 'running' | 'success' | 'error'
  title?: string
  message?: string
  progress?: number
  error?: string
}

export class ScriptManager extends EventEmitter {
  readonly scriptsDir: string
  readonly appDataDir: string
  readonly scriptsIndexJsonPath: string

  constructor() {
    super()
    const appDir = app.isPackaged
      ? path.dirname(process.execPath)
      : app.getAppPath()
    this.scriptsDir = path.join(appDir, 'scripts')
    this.appDataDir = path.join(appDir, 'app-data')
    this.scriptsIndexJsonPath = path.join(this.appDataDir, 'scripts-index.json')

    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true })
    }
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true })
    }
  }

  private isValidMD5(str: string): boolean {
    return /^[a-f0-9]{32}$/i.test(str)
  }

  private generateIndexFromScriptsDir(): Record<string, string> {
    const index: Record<string, string> = {}
    try {
      if (!fs.existsSync(this.scriptsDir)) return index
      const files = fs.readdirSync(this.scriptsDir)
      const jsonFiles = files.filter((f) => f.endsWith('.json'))
      for (const file of jsonFiles) {
        try {
          const md5 = file.replace(/\.json$/, '')
          if (!this.isValidMD5(md5)) continue
          const filePath = path.join(this.scriptsDir, file)
          const content = fs.readFileSync(filePath, 'utf8')
          const scriptJson = JSON.parse(content) as { info?: { name?: string } }
          if (scriptJson.info?.name) {
            index[scriptJson.info.name] = md5
          }
        } catch {
          // skip invalid file
        }
      }
    } catch (err) {
      console.error('从 scripts 目录生成索引失败:', err)
    }
    return index
  }

  /** 全量同步订阅脚本；会通过 emit 发出进度，由 IPC 转发给渲染进程 */
  async updateSubscribedScripts(scriptsData: ScriptsData): Promise<{
    success: boolean
    totalCount: number
    successCount: number
    failedCount: number
    unsubscribedCount: number
  }> {
    if (!scriptsData?.scripts || !Array.isArray(scriptsData.scripts)) {
      throw new Error('返回的脚本列表格式不正确')
    }
    const scripts = scriptsData.scripts

    let existingIndex: Record<string, string> = {}
    if (fs.existsSync(this.scriptsIndexJsonPath)) {
      try {
        const content = fs.readFileSync(this.scriptsIndexJsonPath, 'utf8')
        existingIndex = JSON.parse(content) as Record<string, string>
      } catch {
        existingIndex = this.generateIndexFromScriptsDir()
      }
    } else {
      existingIndex = this.generateIndexFromScriptsDir()
    }

    const currentMd5Set = new Set(scripts.map((s) => s.md5))
    const existingMd5Set = new Set(Object.values(existingIndex))
    const unsubscribedMd5s = [...existingMd5Set].filter((md5) => !currentMd5Set.has(md5))

    for (const md5 of unsubscribedMd5s) {
      try {
        const filePath = path.join(this.scriptsDir, `${md5}.json`)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
          this.emit('scriptUnsubscribed', { md5, fileName: `${md5}.json` })
        }
      } catch (err) {
        console.error(`删除退订脚本 ${md5}.json 失败:`, err)
      }
    }

    const newIndex: Record<string, string> = {}
    let successCount = 0
    let failedCount = 0

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i]
      const progress = scripts.length > 0 ? Math.round(((i + 1) / scripts.length) * 100) : 100
      this.emit('progress', {
        status: 'running',
        title: '同步订阅脚本',
        message: `正在处理 ${i + 1}/${scripts.length}: ${script.name}`,
        progress,
      } as ProgressPayload)

      try {
        const url = `${SCRIPTS_BASE_URL}/${script.md5}.json`
        const filePath = path.join(this.scriptsDir, `${script.md5}.json`)
        let needDownload = true
        if (fs.existsSync(filePath)) {
          needDownload = false
        }

        if (needDownload) {
          const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const buf = await res.arrayBuffer()
          fs.writeFileSync(filePath, Buffer.from(buf))
        }

        let scriptName = script.name
        try {
          const content = fs.readFileSync(filePath, 'utf8')
          const scriptJson = JSON.parse(content) as { info?: { name?: string } }
          if (scriptJson.info?.name) scriptName = scriptJson.info.name
        } catch {
          // keep scriptName from API
        }

        if (existingIndex[scriptName] && existingIndex[scriptName] !== script.md5) {
          const oldMd5 = existingIndex[scriptName]
          const oldPath = path.join(this.scriptsDir, `${oldMd5}.json`)
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
        }

        newIndex[scriptName] = script.md5
        successCount++
        this.emit('scriptDownloaded', { name: scriptName, md5: script.md5, current: i + 1, total: scripts.length })
      } catch (err) {
        failedCount++
        const msg = err instanceof Error ? err.message : String(err)
        this.emit('scriptDownloadError', { name: script.name, md5: script.md5, error: msg })
      }
    }

    fs.writeFileSync(this.scriptsIndexJsonPath, JSON.stringify(newIndex, null, 2), 'utf8')

    this.emit('progress', {
      status: 'success',
      title: '同步订阅脚本',
      message: `已完成，成功 ${successCount}/${scripts.length} 个，删除 ${unsubscribedMd5s.length} 个退订`,
      progress: 100,
    } as ProgressPayload)

    this.emit('updateComplete', {
      totalCount: scripts.length,
      successCount,
      failedCount,
      unsubscribedCount: unsubscribedMd5s.length,
    })

    return {
      success: true,
      totalCount: scripts.length,
      successCount,
      failedCount,
      unsubscribedCount: unsubscribedMd5s.length,
    }
  }

  /** 下载单个脚本（订阅后调用） */
  async downloadScript(item: { name: string; md5: string }): Promise<void> {
    this.emit('progress', {
      status: 'running',
      title: '下载脚本',
      message: `正在下载 ${item.name}`,
      progress: 0,
    } as ProgressPayload)

    const url = `${SCRIPTS_BASE_URL}/${item.md5}.json`
    const filePath = path.join(this.scriptsDir, `${item.md5}.json`)
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(buf))

    let scriptName = item.name
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const scriptJson = JSON.parse(content) as { info?: { name?: string } }
      if (scriptJson.info?.name) scriptName = scriptJson.info.name
    } catch {
      // keep name from param
    }

    let existingIndex: Record<string, string> = {}
    if (fs.existsSync(this.scriptsIndexJsonPath)) {
      try {
        const content = fs.readFileSync(this.scriptsIndexJsonPath, 'utf8')
        existingIndex = JSON.parse(content) as Record<string, string>
      } catch {
        existingIndex = this.generateIndexFromScriptsDir()
      }
    } else {
      existingIndex = this.generateIndexFromScriptsDir()
    }

    if (existingIndex[scriptName] && existingIndex[scriptName] !== item.md5) {
      const oldPath = path.join(this.scriptsDir, `${existingIndex[scriptName]}.json`)
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
    }
    existingIndex[scriptName] = item.md5
    fs.writeFileSync(this.scriptsIndexJsonPath, JSON.stringify(existingIndex, null, 2), 'utf8')

    this.emit('progress', {
      status: 'success',
      title: '下载脚本',
      message: `${scriptName} 已下载`,
      progress: 100,
    } as ProgressPayload)
  }

  /** 删除单个脚本（取消订阅后调用） */
  deleteScript(md5: string): void {
    const filePath = path.join(this.scriptsDir, `${md5}.json`)
    if (!fs.existsSync(filePath)) return

    fs.unlinkSync(filePath)

    let index: Record<string, string> = {}
    if (fs.existsSync(this.scriptsIndexJsonPath)) {
      try {
        const content = fs.readFileSync(this.scriptsIndexJsonPath, 'utf8')
        index = JSON.parse(content) as Record<string, string>
      } catch {
        index = this.generateIndexFromScriptsDir()
      }
    } else {
      index = this.generateIndexFromScriptsDir()
    }

    const entries = Object.entries(index).filter(([, v]) => v !== md5)
    const newIndex = Object.fromEntries(entries)
    fs.writeFileSync(this.scriptsIndexJsonPath, JSON.stringify(newIndex, null, 2), 'utf8')
  }

  getScriptsMetadata(): Record<string, string> | null {
    try {
      if (fs.existsSync(this.scriptsIndexJsonPath)) {
        const content = fs.readFileSync(this.scriptsIndexJsonPath, 'utf8')
        return JSON.parse(content) as Record<string, string>
      }
    } catch (err) {
      console.error('读取脚本元数据失败:', err)
    }
    return null
  }

  async openScriptsFolder(): Promise<void> {
    await shell.openPath(this.scriptsDir)
  }
}

export const scriptManager = new ScriptManager()
