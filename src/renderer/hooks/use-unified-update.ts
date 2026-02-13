import log from 'electron-log/renderer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { TaskProgressState } from 'renderer/components/global-progress-modal'
import { apiClient } from 'renderer/lib/api-client'

const IGNORED_VERSION_KEY = 'ignored_version'

function compareVersion(a: string, b: string): number {
  const parse = (s: string) => {
    const parts = s.replace(/^v/i, '').split('.')
    return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, parseInt(parts[2], 10) || 0]
  }
  const [ma, mi, pa] = parse(a)
  const [mb, mj, pb] = parse(b)
  if (ma !== mb) return ma > mb ? 1 : -1
  if (mi !== mj) return mi > mj ? 1 : -1
  if (pa !== pb) return pa > pb ? 1 : -1
  return 0
}

function getIgnoredVersion(): string | null {
  try {
    return localStorage.getItem(IGNORED_VERSION_KEY)
  } catch {
    return null
  }
}

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'up-to-date' | 'error'
  message: string
  url?: string
  md5?: string
  transferred?: number
  total?: number
}

type LauncherBackendStatus = {
  installed: boolean
  version: string | null
  installedAt: number | null
  packageName: string | null
  entryPoint: string | null
}

type UnifiedBackend = { version: string; url: string; md5: string } | null
type UnifiedElectron = { status: string; version?: string } | null

export type UseUnifiedUpdateOptions = {
  launcherApi: typeof window.App.launcher
  appUpdater: typeof window.App.appUpdater
  setTaskProgressState: (state: TaskProgressState) => void
}

export function useUnifiedUpdate({
  launcherApi,
  appUpdater,
  setTaskProgressState,
}: UseUnifiedUpdateOptions) {
  const [backendStatus, setBackendStatus] = useState<LauncherBackendStatus | null>(null)
  const [electronVersion, setElectronVersion] = useState('')
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
    message: '未检测',
  })
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false)
  const [updatePromptCurrent, setUpdatePromptCurrent] = useState('')
  const [updatePromptNew, setUpdatePromptNew] = useState('')

  const displayVersion = useMemo(() => {
    const ev = electronVersion || '0.0.0'
    const bv = backendStatus?.version ?? '0.0.0'
    const max = compareVersion(ev, bv) >= 0 ? ev : bv
    return max
  }, [electronVersion, backendStatus?.version])

  useEffect(() => {
    launcherApi.getAppVersion().then((v) => setElectronVersion(v ?? '0.0.0'))
    launcherApi.getBackendStatus().then((status) => setBackendStatus(status))
  }, [launcherApi])

  const pendingUnifiedCheckRef = useRef(false)
  const unifiedCheckRef = useRef<{
    currentElectronVersion: string
    currentBackendVersion: string
    backend: UnifiedBackend | undefined
    electron: UnifiedElectron | undefined
    fromSettings: boolean
  }>({
    currentElectronVersion: '',
    currentBackendVersion: '',
    backend: undefined,
    electron: undefined,
    fromSettings: false,
  })
  const lastUnifiedCheckResultRef = useRef<{
    hasBackend: boolean
    url?: string
    md5?: string
    hasElectron: boolean
  } | null>(null)
  const tryFinishUnifiedCheckRef = useRef<() => void>(() => {})
  const electronUpdateInModalRef = useRef(false)

  useEffect(() => {
    const unsubscribe = appUpdater.onUpdateState((state: { status: string; message: string; url?: string; transferred?: number; total?: number; version?: string }) => {
      setUpdateState({
        status: state.status as UpdateState['status'],
        message: state.message,
        url: state.url,
        transferred: state.transferred,
        total: state.total,
      })
      if (
        pendingUnifiedCheckRef.current &&
        (state.status === 'available' || state.status === 'up-to-date' || state.status === 'error')
      ) {
        unifiedCheckRef.current.electron = { status: state.status, version: state.version }
        tryFinishUnifiedCheckRef.current()
      }
      if (electronUpdateInModalRef.current) {
        const title = '更新应用'
        if (state.status === 'checking' || state.status === 'available' || state.status === 'downloading') {
          const progress =
            state.status === 'downloading' &&
            state.total != null &&
            state.total > 0 &&
            state.transferred != null
              ? Math.round((state.transferred / state.total) * 100)
              : undefined
          setTaskProgressState({
            status: 'running',
            title,
            message: state.message,
            progress,
          })
        } else if (state.status === 'installing' || state.status === 'up-to-date') {
          electronUpdateInModalRef.current = false
          setTaskProgressState({
            status: 'success',
            title,
            message: state.status === 'installing' ? state.message : state.message || '更新完成',
          })
        } else if (state.status === 'error') {
          electronUpdateInModalRef.current = false
          setTaskProgressState({ status: 'error', title, error: state.message })
        }
      }
    })
    return () => {
      unsubscribe()
    }
  }, [appUpdater, setTaskProgressState])

  const runUnifiedUpdateCheck = useCallback(
    (fromSettings: boolean) => {
      const currentBackendVersion = backendStatus?.version ?? '0.0.0'
      pendingUnifiedCheckRef.current = true
      unifiedCheckRef.current = {
        currentElectronVersion: '',
        currentBackendVersion,
        backend: undefined,
        electron: undefined,
        fromSettings,
      }
      setUpdateState((s) => ({ ...s, status: 'checking', message: '正在检查更新…' }))

      const tryFinish = () => {
        const r = unifiedCheckRef.current
        if (r.currentElectronVersion === '' || r.backend === undefined || r.electron === undefined) return
        pendingUnifiedCheckRef.current = false
        const needBackend =
          r.backend && compareVersion(r.backend.version, r.currentBackendVersion) > 0
        const needElectron =
          r.electron?.status === 'available' &&
          r.electron.version != null &&
          compareVersion(r.electron.version, r.currentElectronVersion) > 0
        const candidates: string[] = []
        if (needBackend && r.backend) candidates.push(r.backend.version)
        if (needElectron && r.electron?.version) candidates.push(r.electron.version)
        const newVersion = candidates.reduce(
          (max, v) => (compareVersion(v, max) > 0 ? v : max),
          candidates[0] ?? '',
        )
        const currentDisplayVersion =
          compareVersion(r.currentElectronVersion, r.currentBackendVersion) >= 0
            ? r.currentElectronVersion
            : r.currentBackendVersion
        const ignored = getIgnoredVersion()
        const skipIgnoredCheck = r.fromSettings
        if (newVersion && (skipIgnoredCheck || newVersion !== ignored)) {
          lastUnifiedCheckResultRef.current = {
            hasBackend: !!needBackend,
            url: needBackend && r.backend ? r.backend.url : undefined,
            md5: needBackend && r.backend ? r.backend.md5 : undefined,
            hasElectron: !!needElectron,
          }
          setUpdatePromptCurrent(currentDisplayVersion)
          setUpdatePromptNew(newVersion)
          setUpdatePromptOpen(true)
        } else {
          if (fromSettings) {
            toast.success('当前已是最新版本')
          }
          setUpdateState((s) => ({ ...s, status: 'up-to-date', message: '当前已是最新版本' }))
        }
      }

      tryFinishUnifiedCheckRef.current = tryFinish

      launcherApi.getAppVersion().then((v) => {
        unifiedCheckRef.current.currentElectronVersion = v ?? '0.0.0'
        tryFinishUnifiedCheckRef.current()
      })
      apiClient
        .checkWhimboxUpdate()
        .then((res) => {
          unifiedCheckRef.current.backend = res
          tryFinishUnifiedCheckRef.current()
        })
        .catch(() => {
          unifiedCheckRef.current.backend = null
          tryFinishUnifiedCheckRef.current()
        })
      appUpdater.checkForUpdates()
    },
    [launcherApi, appUpdater, backendStatus?.version],
  )

  const handleCheckAppUpdate = useCallback(async () => {
    const authState = await launcherApi.getAuthState()
    if (!authState?.user?.is_vip) {
      toast.error('请先开通自动更新')
      return
    }
    runUnifiedUpdateCheck(true)
  }, [launcherApi, runUnifiedUpdateCheck])

  const handleManualAppUpdate = useCallback(async () => {
    const path = await launcherApi.selectWhlFile()
    if (!path) return
    setTaskProgressState({ status: 'running', title: '安装后端', message: '正在安装…' })
    try {
      await launcherApi.installWhl(path)
      const status = await launcherApi.getBackendStatus()
      setBackendStatus(status)
    } catch (err) {
      setTaskProgressState({
        status: 'error',
        title: '安装后端',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [launcherApi, setTaskProgressState])

  const handleUpdatePromptUpdate = useCallback(async () => {
    const result = lastUnifiedCheckResultRef.current
    if (!result) return
    if (result.hasBackend) {
      setTaskProgressState({ status: 'running', title: '更新后端', message: '正在下载安装…' })
      try {
        await launcherApi.downloadAndInstallLatestWhl()
        const status = await launcherApi.getBackendStatus()
        setBackendStatus(status)
      } catch (err) {
        setTaskProgressState({
          status: 'error',
          title: '更新后端',
          error: err instanceof Error ? err.message : String(err),
        })
        return
      }
    }
    if (result.hasElectron) {
      const status = updateState.status
      log.scope('更新应用').info(`handleUpdatePromptUpdate status: ${status}`)
      electronUpdateInModalRef.current = true
      setTaskProgressState({
        status: 'running',
        title: '更新应用',
        message: status === 'available' ? updateState.message : '正在更新应用…',
      })
      if (status === 'installing') {
        appUpdater.quitAndInstall()
      } else if (status === 'available') {
        try {
          await appUpdater.downloadAndInstallUpdate()
        } catch (err) {
          electronUpdateInModalRef.current = false
          setTaskProgressState({
            status: 'error',
            title: '更新应用',
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }, [launcherApi, appUpdater, updateState.status, updateState.message, setTaskProgressState])

  const handleUpdatePromptIgnore = useCallback(() => {
    try {
      localStorage.setItem(IGNORED_VERSION_KEY, updatePromptNew)
    } catch {
      // ignore
    }
    setUpdatePromptOpen(false)
  }, [updatePromptNew])

  const closeUpdatePrompt = useCallback(() => {
    setUpdatePromptOpen(false)
  }, [])

  return {
    displayVersion,
    updateState,
    updatePromptOpen,
    updatePromptCurrent,
    updatePromptNew,
    closeUpdatePrompt,
    runUnifiedUpdateCheck,
    handleCheckAppUpdate,
    handleManualAppUpdate,
    handleUpdatePromptUpdate,
    handleUpdatePromptIgnore,
  }
}
