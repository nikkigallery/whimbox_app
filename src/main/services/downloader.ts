import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'
import { URL } from 'node:url'

export type DownloadProgress = {
  fileName: string
  progress: number
  downloaded: number
  total?: number
}

type DownloadStart = {
  fileName: string
  url: string
  md5?: string | null
}

type DownloadComplete = {
  fileName: string
  filePath: string
}

type DownloadError = {
  fileName: string
  error: string
}

export class Downloader extends EventEmitter {
  private downloadDir: string

  constructor() {
    super()
    const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
    this.downloadDir = join(appDir, 'downloads')
    if (!existsSync(this.downloadDir)) {
      mkdirSync(this.downloadDir, { recursive: true })
    }
  }

  getDownloadDirectory() {
    return this.downloadDir
  }

  async downloadWheelPackage(options: DownloadStart) {
    const { url, fileName, md5 } = options
    this.emit('start', { fileName, url, md5 })
    return this.downloadFile(url, fileName, md5 ?? null)
  }

  async downloadFile(url: string, fileName: string, targetMd5: string | null = null) {
    const filePath = join(this.downloadDir, fileName)

    if (targetMd5 && existsSync(filePath)) {
      const fileMd5 = createHash('md5').update(readFileSync(filePath)).digest('hex')
      if (fileMd5 === targetMd5) {
        return filePath
      }
    }

    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }

    const urlObj = new URL(url)
    const request = urlObj.protocol === 'https:' ? httpsRequest : httpRequest

    return new Promise<string>((resolve, reject) => {
      const req = request(urlObj, (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          const message = `下载失败，状态码: ${res.statusCode ?? '未知'}`
          this.emit('error', { fileName, error: message } satisfies DownloadError)
          reject(new Error(message))
          res.resume()
          return
        }

        const totalLength = Number(res.headers['content-length'] ?? 0)
        let downloaded = 0
        const writer = createWriteStream(filePath)

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          const progress = totalLength
            ? Math.round((downloaded / totalLength) * 100)
            : 0
          this.emit('progress', {
            fileName,
            progress,
            downloaded,
            total: totalLength || undefined,
          } satisfies DownloadProgress)
        })

        writer.on('finish', () => {
          if (targetMd5) {
            const fileMd5 = createHash('md5')
              .update(readFileSync(filePath))
              .digest('hex')
            if (fileMd5 !== targetMd5) {
              const message = '下载文件校验失败'
              this.emit('error', { fileName, error: message } satisfies DownloadError)
              reject(new Error(message))
              return
            }
          }
          this.emit('complete', {
            fileName,
            filePath,
          } satisfies DownloadComplete)
          resolve(filePath)
        })

        writer.on('error', (err) => {
          this.emit('error', { fileName, error: err.message } satisfies DownloadError)
          reject(err)
        })

        res.on('error', (err) => {
          this.emit('error', { fileName, error: err.message } satisfies DownloadError)
          reject(err)
        })

        res.pipe(writer)
      })

      req.on('error', (err) => {
        this.emit('error', { fileName, error: err.message } satisfies DownloadError)
        reject(err)
      })

      req.end()
    })
  }
}

export const downloader = new Downloader()
