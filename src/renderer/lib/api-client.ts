export type UserProfile = {
  id: number
  username: string
  avatar?: string
  is_vip: boolean
  vip_expiry_data?: string
}

export type ScriptListItem = {
  id: number
  name: string
  type?: string
  target?: string
  count?: number
  uploader_name?: string
  uploader_id?: number
  subscribe_count: number | string
  description?: string
  update_time?: string
  is_subscribed: boolean
}

/**
 * 业务 API 请求：仅传 endpoint 与 requireAuth，token 与 401 刷新由主进程处理。
 */
async function request(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    data?: Record<string, unknown> | null
    requireAuth?: boolean
  } = {},
): Promise<unknown> {
  const { method = 'GET', data = null, requireAuth = false } = options
  return window.App.launcher.apiRequest(endpoint, {
    method,
    data: data ?? undefined,
    requireAuth,
  })
}

class APIClient {
  logout(): void {
    window.App.launcher.logout()
  }

  async checkWhimboxUpdate() {
    const response = (await request('/whimbox/latest/backend', {
      method: 'GET',
      requireAuth: true,
    })) as { version: string; url: string; md5: string }
    const remoteVersion = {
      version: response.version,
      url: response.url,
      md5: response.md5,
      fetchedAt: Date.now(),
    }
    return remoteVersion
  }

  async getAnnouncements() {
    return request('/whimbox/launcher/announcements', { method: 'GET' }) as Promise<{
      announcements: Array<{ title: string; url?: string; created_at: string }>
    }>
  }

  /** 搜索脚本（需登录以获取 is_subscribed） */
  async searchScripts(params: {
    page?: number
    page_size?: number
    subscribed?: boolean
    type?: string
    target?: string
    min_count?: number
    uploader_name?: string
    order_by?: string
  }) {
    return request('/whimbox/scripts/search', {
      method: 'POST',
      data: params as Record<string, unknown>,
      requireAuth: true,
    }) as Promise<{
      scripts: ScriptListItem[]
      pagination: { total_count: number }
    }>
  }

  /** 订阅/取消订阅脚本 */
  async subscribeScript(params: { script_id: number; subscribe: boolean }) {
    return request('/whimbox/scripts/subscribe', {
      method: 'POST',
      data: params as Record<string, unknown>,
      requireAuth: true,
    }) as Promise<{ is_subscribed: boolean; md5: string; message?: string }>
  }

  /** 获取所有订阅的脚本（用于全量同步） */
  async getAllSubscribedScripts() {
    return request('/whimbox/scripts/all_subscribed', {
      method: 'GET',
      requireAuth: true,
    }) as Promise<{ scripts: Array<{ name: string; md5: string }> }>
  }
}

export const apiClient = new APIClient()
