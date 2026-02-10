import { useEffect, useState } from 'react'
import { Gift } from 'lucide-react'
import { Spinner } from 'renderer/components/ui/spinner'

type Progress = { stage: string; message: string }

export function StartingScreen() {
  const [progress, setProgress] = useState<Progress>({
    stage: 'init',
    message: '正在启动…',
  })

  useEffect(() => {
    const off =
      typeof window !== 'undefined' && window.App?.onSplashProgress
        ? window.App.onSplashProgress((data: Progress) => setProgress(data))
        : () => {}

    return () => {
      off()
    }
  }, [])

  const isError = progress.stage === 'ensure-error'
  const isDone = progress.stage === 'ensure-done' || progress.stage === 'setup-complete'

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-pink-50 to-white dark:from-slate-900 dark:to-slate-950">
      <div className="flex items-center gap-3 text-pink-500">
        <Gift className="size-10" />
        <span className="text-xl font-semibold">奇想盒</span>
      </div>
      {!isDone && !isError && (
        <Spinner className="size-8 text-pink-400" />
      )}
      <p
        className={`max-w-xs text-center text-sm ${
          isError
            ? 'text-red-600 dark:text-red-400'
            : 'text-slate-600 dark:text-slate-400'
        }`}
      >
        {progress.message}
      </p>
    </div>
  )
}
