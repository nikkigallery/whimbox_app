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

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>登录成功 - 奇想盒</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f6fb;
      --card: #ffffff;
      --text: #1f2937;
      --subtle: #6b7280;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
      background: radial-gradient(circle at 15% 15%, #e0f2fe 0%, var(--bg) 45%), var(--bg);
      color: var(--text);
      padding: 24px;
    }
    .card {
      width: min(520px, 100%);
      background: var(--card);
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 10px 30px rgba(2, 6, 23, 0.08);
      border: 1px solid #e5e7eb;
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.25;
      letter-spacing: 0.2px;
    }
    p {
      margin: 10px 0 0;
      line-height: 1.6;
      color: var(--subtle);
      font-size: 15px;
    }
    .hint {
      margin-top: 18px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      font-size: 13px;
      color: #475569;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>登录成功</h1>
    <p>你的奇想盒账号已完成授权，客户端正在同步登录状态。</p>
    <p class="hint">你可以直接关闭此页面，并返回奇想盒APP。</p>
  </main>
</body>
</html>`)

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
