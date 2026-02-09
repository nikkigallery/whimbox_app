const API_CONFIG = {
  baseURL: 'https://www.nikkigallery.vip/api/v1',
  timeout: 5000,
}

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

type StoredUser = {
  user: UserProfile
  accessToken: string
  refreshToken: string
}

class UserManager {
  private user: UserProfile | null = null
  private accessToken: string | null = null
  private refreshToken: string | null = null

  constructor() {
    this.loadUserFromStorage()
  }

  loadUserFromStorage() {
    try {
      const userDataStr = localStorage.getItem('user_data')
      if (userDataStr) {
        const userData = JSON.parse(userDataStr) as StoredUser
        this.user = userData.user
        this.accessToken = userData.accessToken
        this.refreshToken = userData.refreshToken
      }
    } catch (error) {
      console.error('加载用户信息失败:', error)
      this.clearUser()
    }
  }

  saveUserToStorage() {
    if (!this.user || !this.accessToken || !this.refreshToken) return
    try {
      const userData: StoredUser = {
        user: this.user,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
      }
      localStorage.setItem('user_data', JSON.stringify(userData))
    } catch (error) {
      console.error('保存用户信息失败:', error)
    }
  }

  clearUser() {
    this.user = null
    this.accessToken = null
    this.refreshToken = null
    localStorage.removeItem('user_data')
  }

  getUser() {
    return this.user
  }

  getAccessToken() {
    return this.accessToken
  }

  getRefreshToken() {
    return this.refreshToken
  }

  setRefreshToken(token: string) {
    this.refreshToken = token
  }

  setAccessToken(token: string) {
    this.accessToken = token
  }

  setUser(user: UserProfile) {
    this.user = user
  }

  isLoggedIn() {
    return Boolean(this.accessToken && this.user)
  }

  getAvatarUrl() {
    if (!this.user?.avatar) return null
    return `https://nikkigallery.vip/static/img/avatar/${this.user.avatar}`
  }
}

class APIClient {
  private userManager = new UserManager()
  private isRefreshing = false
  private refreshPromise: Promise<boolean> | null = null

  getUserManager() {
    return this.userManager
  }

  logout() {
    this.userManager.clearUser()
  }

  async request(
    endpoint: string,
    options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; data?: Record<string, unknown> | null; requireAuth?: boolean } = {},
  ): Promise<unknown> {
    const { requireAuth = false, method = 'GET', data = null } = options
    try {
      const response = await window.App.launcher.apiRequest(endpoint, {
        method,
        data: data ?? undefined,
        accessToken: requireAuth ? this.userManager.getAccessToken() ?? undefined : undefined,
      })
      return response
    } catch (error) {
      const message = (error as Error).message ?? ''
      if (requireAuth && message.includes('(401)')) {
        const refreshed = await this.refreshAccessToken()
        if (refreshed) {
          return this.request(endpoint, options)
        }
        this.userManager.clearUser()
        throw new Error('登录已过期，请重新登录')
      }
      throw error
    }
  }

  async refreshAccessToken() {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise
    }

    const refreshToken = this.userManager.getRefreshToken()
    if (!refreshToken) return false

    this.isRefreshing = true
    this.refreshPromise = (async () => {
      try {
        const data = (await window.App.launcher.apiRequest('/token/refresh', {
          method: 'POST',
          data: { refresh: refreshToken },
        })) as { access?: string; refresh?: string }
        if (!data.access) return false
        this.userManager.setAccessToken(data.access)
        if (data.refresh) {
          this.userManager.setRefreshToken(data.refresh)
        }
        this.userManager.saveUserToStorage()
        return true
      } catch {
        return false
      } finally {
        this.isRefreshing = false
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  async loginWithRefreshToken(refreshToken: string) {
    this.userManager.setRefreshToken(refreshToken)
    const refreshed = await this.refreshAccessToken()
    if (!refreshed) {
      throw new Error('未获取到登录凭证，请重试')
    }

    const userData = (await this.request('/user/0', { method: 'GET', requireAuth: true })) as UserProfile
    this.userManager.setUser({
      id: userData.id,
      username: userData.username,
      avatar: userData.avatar,
      is_vip: userData.is_vip,
      vip_expiry_data: userData.vip_expiry_data,
    })
    this.userManager.saveUserToStorage()

    return {
      user: this.userManager.getUser(),
      access_token: this.userManager.getAccessToken(),
      refresh_token: this.userManager.getRefreshToken(),
    }
  }

  async checkWhimboxUpdate() {
    const response = (await this.request('/whimbox/latest', {
      method: 'GET',
      requireAuth: true,
    })) as { version: string; url: string; md5: string }
    const remoteVersion = {
      version: response.version,
      url: response.url,
      md5: response.md5,
      fetchedAt: Date.now(),
    }
    localStorage.setItem('whimbox_remote_version', JSON.stringify(remoteVersion))
    return remoteVersion
  }

  async getAnnouncements() {
    return this.request('/whimbox/launcher/announcements', { method: 'GET' }) as Promise<{
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
    return this.request('/whimbox/scripts/search', {
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
    return this.request('/whimbox/scripts/subscribe', {
      method: 'POST',
      data: params as Record<string, unknown>,
      requireAuth: true,
    }) as Promise<{ is_subscribed: boolean; md5: string; message?: string }>
  }

  /** 获取所有订阅的脚本（用于全量同步） */
  async getAllSubscribedScripts() {
    return this.request('/whimbox/scripts/all_subscribed', {
      method: 'GET',
      requireAuth: true,
    }) as Promise<{ scripts: Array<{ name: string; md5: string }> }>
  }
}

export const apiClient = new APIClient()
export type { UserManager }
