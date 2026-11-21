import { useEffect, useState } from 'react'

const preferenceKey = 'map-mask-scene-guidance'

function readPreference() {
  return window.localStorage.getItem(preferenceKey) !== 'off'
}

export function useSceneGuidance() {
  const [enabled, setEnabled] = useState(readPreference)

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === null) setEnabled(readPreference())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const save = (next: boolean) => {
    window.localStorage.setItem(preferenceKey, next ? 'on' : 'off')
    setEnabled(next)
  }
  return [enabled, save] as const
}
