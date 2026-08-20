import { Play, Square, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ScrollCenterLayout } from 'renderer/components/scroll-center-layout'
import { SettingsPageLayout } from 'renderer/components/settings-page-layout'
import { Button } from 'renderer/components/ui/button'
import type { IpcRpcClient } from 'renderer/lib/ipc-rpc'

const TOOL_ID = 'nikki.mira_crown'

type MiraCrownPageProps = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
}

export function MiraCrownPage({
  rpcClient,
  sessionId,
  rpcState,
}: MiraCrownPageProps) {
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const offNotification = rpcClient.on('notification', notification => {
      if (notification.method !== 'event.run.status') return
      const params =
        notification.params && typeof notification.params === 'object'
          ? (notification.params as Record<string, unknown>)
          : undefined
      if (params?.source !== 'task' || params.tool_id !== TOOL_ID) return

      const phase = typeof params.phase === 'string' ? params.phase : ''
      if (phase === 'started' || phase === 'running') {
        const taskId =
          typeof params.task_id === 'string' ? params.task_id : null
        if (taskId) setRunningTaskId(taskId)
        setStarting(false)
        setStopping(false)
        return
      }
      if (phase === 'stopping') {
        setStarting(false)
        setStopping(true)
        return
      }
      if (
        phase === 'completed' ||
        phase === 'cancelled' ||
        phase === 'error'
      ) {
        setRunningTaskId(null)
        setStarting(false)
        setStopping(false)
      }
    })
    return offNotification
  }, [rpcClient])

  const handleStart = async () => {
    if (!sessionId || rpcState !== 'open' || starting) return
    setStarting(true)
    try {
      const result = await rpcClient.sendRequest<{ task_id?: string }>(
        'task.run',
        {
          session_id: sessionId,
          tool_id: TOOL_ID,
          input: {},
        }
      )
      const taskId =
        typeof result?.task_id === 'string' ? result.task_id : null
      if (taskId) setRunningTaskId(taskId)
    } catch {
      toast.error('启动巅峰赛自动完成失败，请确认游戏已启动')
    } finally {
      setStarting(false)
    }
  }

  const handleStop = async () => {
    if (!runningTaskId || stopping) return
    setStopping(true)
    try {
      await rpcClient.sendRequest('task.stop', { task_id: runningTaskId })
    } catch {
      setStopping(false)
      toast.error('停止巅峰赛自动完成失败，请稍后重试')
    }
  }

  const backendReady = rpcState === 'open' && Boolean(sessionId)
  const running = Boolean(runningTaskId)

  return (
    <ScrollCenterLayout
      innerClassName="flex min-h-0 flex-1 flex-col gap-6 px-6 py-8 lg:px-10"
      scrollOuter
    >
      <SettingsPageLayout
        className="mx-auto w-full max-w-5xl"
        title="巅峰赛自动完成"
        description="自动进入奇迹之冠巅峰赛，使用推荐搭配连续完成当前可挑战关卡"
      >
        <div className="grid gap-6">
          <section className="overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-pink-50 p-6 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:via-slate-950 dark:to-pink-950/30">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                  <Trophy className="size-6" />
                </span>
                <div>
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                    {running ? '任务正在运行' : '一键完成巅峰赛'}
                  </h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    请先进入游戏。任务运行期间请暂时不要操作鼠标和键盘。
                  </p>
                </div>
              </div>

              <Button
                className="h-11 shrink-0 rounded-xl bg-pink-400 px-5 text-white shadow-sm hover:bg-pink-500"
                disabled={!backendReady || starting || stopping}
                onClick={running ? handleStop : handleStart}
              >
                {running ? (
                  <Square className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {running
                  ? stopping
                    ? '正在停止…'
                    : '停止任务'
                  : starting
                    ? '正在启动…'
                    : '开始自动完成'}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 text-sm leading-7 text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              使用说明
            </h2>
            <p className="mt-2">
              奇想盒会自动打开奇迹之冠、进入巅峰赛并使用推荐搭配完成挑战；已经完成的挑战会自动跳过。
            </p>
            {!backendReady ? (
              <p className="mt-2 text-amber-600 dark:text-amber-300">
                后端尚未连接，连接成功后即可启动任务。
              </p>
            ) : null}
          </section>
        </div>
      </SettingsPageLayout>
    </ScrollCenterLayout>
  )
}
