import Store from 'electron-store'

export type UserProfile = {
  id: number
  username: string
  avatar?: string
  is_vip: boolean
  vip_expiry_data?: string
}

export type AuthState = {
  user: UserProfile
  accessToken: string
  refreshToken: string
}

const AUTH_KEY = 'auth'

const store = new Store<{ [AUTH_KEY]: AuthState }>({
  name: 'auth',
})

function load(): AuthState | null {
  const data = store.get(AUTH_KEY)
  if (!data?.user || !data?.accessToken || !data?.refreshToken) {
    return null
  }
  return data as AuthState
}

export function getAuthState(): AuthState | null {
  return load()
}

export function getAccessToken(): string | null {
  return load()?.accessToken ?? null
}

export function getRefreshToken(): string | null {
  return load()?.refreshToken ?? null
}

export function setAuth(state: AuthState): void {
  store.set(AUTH_KEY, state)
}

export function clearAuth(): void {
  store.delete(AUTH_KEY)
}
