import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from 'renderer/components/ui/button'
import {
  GlobalProgressModal,
  type TaskProgressState,
} from 'renderer/components/global-progress-modal'

type PythonEnvStatus = {
  installed: boolean
  version?: string
  message?: string
}

export function RuntimeEnvironmentSection() {
  const launcherApi = useMemo(() => window.App.launcher, [])
  const [pythonStatus, setPythonStatus] = useState<PythonEnvStatus>({
    installed: false,
    message: '未检测',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [taskProgressState, setTaskProgressState] = useState<TaskProgressState>({
    status: 'idle',
  })

  useEffect(() => {
    launcherApi
      .detectPythonEnvironment()
      .then((res) => {
        setPythonStatus({
          installed: !!res.installed,
          version: res.version,
          message: res.installed ? undefined : res.message,
        })
      })
      .catch((err) => {
        setPythonStatus({
          installed: false,
          message: err instanceof Error ? err.message : '检测失败',
        })
      })
  }, [launcherApi])

  useEffect(() => {
    const off = launcherApi.onPythonSetup((data: { stage: string; message: string }) => {
      if (
        data.stage === 'setup-start' ||
        data.stage === 'extract-progress' ||
        data.stage === 'extract-complete' ||
        data.stage === 'speed-test-progress' ||
        data.stage === 'speed-test-complete'
      ) {
        setTaskProgressState({
          status: 'running',
          title: 'Python 环境',
          message: data.message,
        })
      } else if (data.stage === 'setup-complete') {
        setTaskProgressState({ status: 'idle' })
        launcherApi.detectPythonEnvironment().then((res) => {
          setPythonStatus({
            installed: !!res.installed,
            version: res.version,
            message: res.installed ? undefined : res.message,
          })
        })
      }
    })
    return () => off()
  }, [launcherApi])

  const handleSetupPython = useCallback(() => {
    setIsProcessing(true)
    launcherApi
      .setupPythonEnvironment()
      .then((res) => {
        setPythonStatus({
          installed: !!res.installed,
          version: res.version,
          message: res.installed ? undefined : res.message,
        })
      })
      .catch((err) => {
        setPythonStatus({
          installed: false,
          message: err instanceof Error ? err.message : '安装失败',
        })
      })
      .finally(() => setIsProcessing(false))
  }, [launcherApi])

  return (
    <>
      <GlobalProgressModal
        state={taskProgressState}
        onClose={() => setTaskProgressState({ status: 'idle' })}
      />
      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-100">Python 环境</p>
            <p className="text-xs text-slate-400">
              {pythonStatus.installed ? '已就绪' : '未安装'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            onClick={handleSetupPython}
          >
            {pythonStatus.installed ? '重新检测' : '安装环境'}
          </Button>
        </div>
      </div>
    </>
  )
}
