import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import { Button } from 'renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from 'renderer/components/ui/dialog'

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

  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open && canClose) onClose?.()
      }}
    >
      <DialogContent
        showCloseButton={canClose}
        className="sm:max-w-md"
        aria-describedby={undefined}
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
            <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {title ?? '处理中'}
            </DialogTitle>
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
            <DialogFooter className="flex justify-end pt-2 sm:justify-end">
              <Button variant="outline" size="sm" onClick={onClose}>
                关闭
              </Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
