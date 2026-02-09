import { createHash } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import {
  clearAuth,
  getAccessToken,
  getAuthState,
  getRefreshToken,
  setAuth,
  type AuthState,
} from './auth-store'

const API_BASE = 'https://www.nikkigallery.vip/api/v1'

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown> | null
  /** 显式传入 token，用于 completeLogin 等场景 */
  accessToken?: string | null
  /** 为 true 时从 auth-store 取 token，401 时自动 refresh 并重试一次 */
  requireAuth?: boolean
}

export type Announcement = {
  title: string
  url?: string
  created_at: string
}

function buildAnnouncementsHash(announcements: Announcement[]) {
  const sorted = [...announcements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const payload = sorted
    .map((item) => `${item.title}|${item.url ?? ''}|${item.created_at}`)
    .join('||')
  return createHash('md5').update(payload).digest('hex')
}

export async function getAnnouncements() {
  const response = await fetch(`${API_BASE}/whimbox/launcher/announcements`, {
    method: 'GET',
  })
  if (!response.ok) {
    throw new Error(`获取公告失败 (${response.status})`)
  }
  const data = (await response.json()) as { announcements: Announcement[] }
  const hash = buildAnnouncementsHash(data.announcements ?? [])
  return { ...data, hash }
}

async function doRequest<T = unknown>(
  endpoint: string,
  options: { method: string; data?: Record<string, unknown> | null; accessToken?: string | null },
): Promise<T> {
  const { method, data, accessToken } = options
  const url = new URL(`${API_BASE}${endpoint}`)
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  let body: string | undefined
  if (data && method === 'GET') {
    for (const [key, value] of Object.entries(data)) {
      if (value != null) {
        url.searchParams.set(key, String(value))
      }
    }
  } else if (data) {
    body = JSON.stringify(data)
  }

  const response = await fetch(url.toString(), { method, headers, body })
  if (!response.ok) {
    let errorMessage = `请求失败 (${response.status})`
    try {
      const errorData = await response.json()
      errorMessage = (errorData as { message?: string; error?: string }).message ?? (errorData as { message?: string; error?: string }).error ?? errorMessage
    } catch {
      // ignore
    }
    throw new Error(errorMessage)
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as T
}

let refreshPromise: Promise<boolean> | null = null

async function refreshAndRetry(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    clearAuth()
    return false
  }
  refreshPromise = (async () => {
    try {
      const data = (await doRequest('/token/refresh', {
        method: 'POST',
        data: { refresh: refreshToken },
      })) as { access?: string; refresh?: string }
      if (!data.access) {
        clearAuth()
        return false
      }
      const current = getAuthState()
      setAuth({
        user: current?.user ?? ({} as AuthState['user']),
        accessToken: data.access,
        refreshToken: data.refresh ?? refreshToken,
      })
      return true
    } catch {
      clearAuth()
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = 'GET', data, accessToken: explicitToken, requireAuth = false } = options
  let accessToken = explicitToken ?? null
  if (requireAuth && !accessToken) {
    accessToken = getAccessToken()
    if (!accessToken) {
      clearAuth()
      throw new Error('未登录，请先登录 (401)')
    }
  }

  try {
    return await doRequest<T>(endpoint, { method, data, accessToken })
  } catch (err) {
    const message = (err as Error).message ?? ''
    if (requireAuth && message.includes('401')) {
      const refreshed = await refreshAndRetry()
      if (refreshed) {
        const newToken = getAccessToken()
        return doRequest<T>(endpoint, { method, data, accessToken: newToken })
      }
      throw new Error('登录已过期，请重新登录')
    }
    throw err
  }
}

/**
 * 登录回调：用 refresh_token 换 access_token 并拉取用户信息，写入 auth-store 并通知渲染进程。
 */
export async function completeLogin(refreshToken: string, window: BrowserWindow): Promise<void> {
  const data = (await doRequest('/token/refresh', {
    method: 'POST',
    data: { refresh: refreshToken },
  })) as { access?: string; refresh?: string }
  if (!data.access) {
    throw new Error('刷新 token 失败')
  }
  const accessToken = data.access
  const refreshTokenNew = data.refresh ?? refreshToken

  const user = (await doRequest<AuthState['user']>('/user/0', {
    method: 'GET',
    accessToken,
  })) as AuthState['user']

  setAuth({ user, accessToken, refreshToken: refreshTokenNew })
  window.webContents.send('launcher:auth-state', { user })
}
