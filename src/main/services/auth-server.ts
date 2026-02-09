import { createServer, type Server } from 'node:http'
import { URL } from 'node:url'
import type { BrowserWindow } from 'electron'
import { completeLogin } from './launcher-api'

let authServer: Server | null = null
let authPort = 0

function handleAuthRequest(window: BrowserWindow) {
  return (req: { url?: string; method?: string }, res: { writeHead: Function; end: Function }) => {
    const url = new URL(req.url ?? '/', `http://localhost:${authPort}`)
    if (url.pathname !== '/auth/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }

    const refreshToken = url.searchParams.get('refresh_token')
    if (!refreshToken) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Missing refresh_token')
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('奇想盒已登录成功，你可以关闭该页面')

    completeLogin(refreshToken, window).catch((err) => {
      console.error('登录完成失败:', err)
      window.webContents.send('launcher:auth-state', null)
    })
  }
}

export function getAuthPort() {
  return authPort
}

export async function startAuthServer(window: BrowserWindow) {
  if (authServer) {
    return authPort
  }

  const create = () => {
    authServer = createServer(handleAuthRequest(window))
  }

  create()
  let port = 9090

  return new Promise<number>((resolve, reject) => {
    const tryStart = () => {
      authServer?.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          port += 1
          if (port < 9099) {
            authServer?.removeAllListeners()
            create()
            tryStart()
            return
          }
          reject(new Error('无法找到可用端口'))
          return
        }
        reject(err)
      })

      authServer?.listen(port, '127.0.0.1', () => {
        authPort = port
        resolve(port)
      })
    }

    tryStart()
  })
}

export function stopAuthServer() {
  if (!authServer) return
  authServer.close()
  authServer = null
  authPort = 0
}
