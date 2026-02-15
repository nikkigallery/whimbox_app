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

  const {
    loading,
    loadError,
    items,
    draftConfig,
    handleValueChangeAndSave,
  } = useConfigForm({ section: "Game", rpcClient })

  useEffect(() => {
    const offNotification = rpcClient.on("notification", (notification) => {
      if (notification.method !== "event.task.progress") return
      const params =
        notification.params && typeof notification.params === "object"
          ? (notification.params as Record<string, unknown>)
          : undefined
      const toolId = typeof params?.tool_id === "string" ? params.tool_id : ""
      if (toolId !== "nikki.all_in_one") return
      const detail = typeof params?.detail === "string" ? params.detail : ""
      if (detail === "started") {
        setIsRunning(true)
      } else if (detail === "completed" || detail === "cancelled") {
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
      await rpcClient.sendRequest("task.run", {
        session_id: sessionId,
        tool_id: "nikki.all_in_one",
        input: {},
      })
      setIsRunning(true)
    } catch {
      toast.error("启动失败")
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
            onClick={handleRun}
            disabled={rpcState !== "open" || !sessionId || isRunning}
            className="rounded-xl bg-pink-400 text-white shadow-sm transition hover:bg-pink-500"
          >
            {isRunning ? "一条龙运行中" : "开始一条龙"}
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
