import { useEffect, useRef } from "react"
import { Bot } from "lucide-react"
import { Button } from "renderer/components/ui/button"
import { ConfigFormFields } from "renderer/components/config-form-fields"
import { useConfigForm } from "renderer/hooks/use-config-form"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import type { SettingSection, SettingContent } from "./types"
import { toast } from "sonner"

export const section: SettingSection = {
  id: "agent",
  label: "大模型",
  icon: Bot,
}

const AGENT_SECTION = "Agent"

function AgentConfigForm({
  rpcClient,
  renderTitleActions,
}: {
  rpcClient: IpcRpcClient
  renderTitleActions: (node: React.ReactNode) => void
}) {
  const {
    loading,
    loadError,
    items,
    draftConfig,
    saving,
    handleValueChange,
    handleSave,
  } = useConfigForm({ section: AGENT_SECTION, rpcClient })

  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  useEffect(() => {
    const showForm = !loading && !loadError && items.length > 0
    if (showForm) {
      renderTitleActions(
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={saving}
          onClick={async () => {
            try {
              const saved = await handleSaveRef.current({
                successMessage: "大模型配置已保存",
                noChangeMessage: "暂无需要保存的修改。",
              })
              if (saved) {
                await window.App.launcher.restartBackend("保存并应用")
              }
            } catch {
              toast.error("保存或重启失败，请稍后重试")
            }
          }}
        >
          保存并应用
        </Button>
      )
    } else {
      renderTitleActions(null)
    }
  }, [loading, loadError, items.length, saving, renderTitleActions])

  return (
    <ConfigFormFields
      items={items}
      draftConfig={draftConfig}
      onValueChange={handleValueChange}
      loading={loading}
      loadError={loadError}
      emptyMessage="暂无大模型配置项"
    />
  )
}

export const content: SettingContent = {
  title: "大模型",
  description: "大语言模型相关的配置",
  render: (props, slots) => {
    if (props.rpcClient) {
      return (
        <AgentConfigForm
          rpcClient={props.rpcClient}
          renderTitleActions={slots?.renderTitleActions ?? (() => {})}
        />
      )
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          奇想盒后端未连接，暂时无法配置
        </p>
      </div>
    )
  },
}
