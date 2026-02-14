import { useEffect, useRef } from "react"
import { Bot } from "lucide-react"
import { Button } from "renderer/components/ui/button"
import { Spinner } from "renderer/components/ui/spinner"
import { ConfigFormFields } from "renderer/components/config-form-fields"
import { useConfigForm } from "renderer/hooks/use-config-form"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import type { SettingSection, SettingContent } from "./types"

export const section: SettingSection = {
  id: "agent",
  label: "Agent",
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
          onClick={() => handleSaveRef.current({ successMessage: "大模型配置已保存" })}
          disabled={saving}
          className="rounded-xl"
        >
          {saving ? (
            <>
              <Spinner className="size-4" />
              保存中...
            </>
          ) : (
            "保存设置"
          )}
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
  title: "Agent 设置",
  description: "大模型与 API 配置，以及 Agent 行为与输出偏好。",
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
