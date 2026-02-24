import { useEffect, useState } from "react"
import { ScrollCenterLayout } from "renderer/components/scroll-center-layout"
import { SettingsPageLayout } from "renderer/components/settings-page-layout"
import { ConfigFormFields } from "renderer/components/config-form-fields"
import { useConfigForm } from "renderer/hooks/use-config-form"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { Button } from "renderer/components/ui/button"
import { toast } from "sonner"

type OneDragonPageProps = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

export function OneDragonPage({ rpcClient, sessionId, rpcState }: OneDragonPageProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [isStopping, setIsStopping] = useState(false)

  const {
    loading,
    loadError,
    items,
    draftConfig,
    handleValueChangeAndSave,
  } = useConfigForm({ section: "OneDragon", rpcClient })

  useEffect(() => {
    const offNotification = rpcClient.on("notification", (notification) => {
      if (notification.method !== "event.run.status") return
      const params =
        notification.params && typeof notification.params === "object"
          ? (notification.params as Record<string, unknown>)
          : undefined
      const source = typeof params?.source === "string" ? params.source : ""
      if (source !== "task") return
      const toolId = typeof params?.tool_id === "string" ? params.tool_id : ""
      if (toolId && toolId !== "nikki.all_in_one") return
      const phase = typeof params?.phase === "string" ? params.phase : ""
      if (phase === "started") {
        const taskId = typeof params?.task_id === "string" ? params.task_id : null
        if (taskId) setRunningTaskId(taskId)
        setIsStopping(false)
        setIsRunning(true)
      } else if (phase === "stopping") {
        setIsStopping(true)
      } else if (phase === "completed" || phase === "cancelled" || phase === "error") {
        setRunningTaskId(null)
        setIsStopping(false)
        setIsRunning(false)
      }
    })
    return () => {
      offNotification()
    }
  }, [rpcClient])

  const handleRun = async () => {
    if (!sessionId || rpcState !== "open") return
    try {
      const result = await rpcClient.sendRequest<{ task_id?: string }>("task.run", {
        session_id: sessionId,
        tool_id: "nikki.all_in_one",
        input: {},
      })
      const taskId = typeof result?.task_id === "string" ? result.task_id : null
      if (taskId) setRunningTaskId(taskId)
      setIsStopping(false)
      setIsRunning(true)
    } catch {
      toast.error("启动失败")
    }
  }

  const handleStop = async () => {
    if (!runningTaskId) return
    try {
      setIsStopping(true)
      await rpcClient.sendRequest("task.stop", { task_id: runningTaskId })
    } catch {
      setIsStopping(false)
      toast.error("停止失败")
    }
  }

  return (
    <ScrollCenterLayout
      scrollOuter={false}
      innerClassName="flex flex-1 flex-col min-h-0 gap-4 px-10 py-8"
    >
      <SettingsPageLayout
        className="flex-1 min-h-0"
        title="一条龙配置"
        actions={
          <Button
            onClick={runningTaskId ? handleStop : handleRun}
            disabled={rpcState !== "open" || !sessionId || (runningTaskId ? isStopping : isRunning)}
            className="rounded-xl bg-pink-400 text-white shadow-sm transition hover:bg-pink-500"
          >
            {runningTaskId ? (isStopping ? "结束中..." : "停止任务") : "开始一条龙"}
          </Button>
        }
      >
        <ConfigFormFields
          items={items}
          draftConfig={draftConfig}
          onValueChange={handleValueChangeAndSave}
          loading={loading}
          loadError={loadError}
          emptyMessage="暂无可用配置"
          itemClassName="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950/40"
        />
      </SettingsPageLayout>
    </ScrollCenterLayout>
  )
}
