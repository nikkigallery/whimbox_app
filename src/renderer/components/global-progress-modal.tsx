import { useEffect } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import { Button } from 'renderer/components/ui/button'

export type TaskProgressState = {
  status: 'idle' | 'running' | 'success' | 'error'
  title?: string
  message?: string
  progress?: number
  error?: string
}

type GlobalProgressModalProps = {
  state: TaskProgressState
  onClose?: () => void
}

export function GlobalProgressModal({ state, onClose }: GlobalProgressModalProps) {
  const { status, title, message, progress, error } = state
  const visible = status !== 'idle'
  const canClose = status === 'success' || status === 'error'

  // useEffect(() => {
  //   if (status === 'success' && onClose) {
  //     const t = setTimeout(onClose, 2500)
  //     return () => clearTimeout(t)
  //   }
  // }, [status, onClose])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      aria-modal
      role="dialog"
      aria-label={title ?? '进度'}
    >
      <div
        className={cn(
          'mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900',
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {status === 'running' && (
              <Loader2 className="size-6 shrink-0 animate-spin text-pink-500" aria-hidden />
            )}
            {status === 'success' && (
              <CheckCircle2 className="size-6 shrink-0 text-green-500" aria-hidden />
            )}
            {status === 'error' && (
              <XCircle className="size-6 shrink-0 text-red-500" aria-hidden />
            )}
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {title ?? '处理中'}
            </h2>
          </div>

          {message && status !== 'error' && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
          )}
          {status === 'error' && error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {status === 'running' && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={cn(
                  'h-full rounded-full bg-pink-500 transition-[width] duration-300',
                  typeof progress !== 'number' && 'animate-pulse',
                )}
                style={{
                  width:
                    typeof progress === 'number' && progress >= 0
                      ? `${Math.min(100, Math.max(0, progress))}%`
                      : '35%',
                }}
              />
            </div>
          )}

          {canClose && onClose && (
            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                关闭
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
