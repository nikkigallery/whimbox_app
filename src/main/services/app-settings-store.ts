import Store from 'electron-store'

type AppSettings = {
  compatibilityMode: boolean
}

const store = new Store<AppSettings>({
  name: 'app-settings',
})

export function getCompatibilityModeEnabled(): boolean {
  return store.get('compatibilityMode', false) === true
}

export function setCompatibilityModeEnabled(enabled: boolean): boolean {
  const next = enabled === true
  store.set('compatibilityMode', next)
  return next
}
