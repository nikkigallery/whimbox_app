import { Settings } from "lucide-react"
import { Button } from "renderer/components/ui/button"
import { ThemeToggle } from "renderer/components/theme-provider"
import { ConfigFormFields } from "renderer/components/config-form-fields"
import { KeybindInput } from "renderer/components/settings-dialog/keybind-input"
import { useConfigForm } from "renderer/hooks/use-config-form"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { APP_RELEASE_PAGE_URL } from "shared/constants"
import type { SettingSection, SettingContent, SettingsDialogProps } from "./types"

const WHIMBOX_SECTION = "Whimbox"

export const section: SettingSection = {
  id: "whimbox",
  label: "奇想盒",
  icon: Settings,
}

function WhimboxConfigForm({ rpcClient }: { rpcClient: IpcRpcClient }) {
  const {
    loading,
    loadError,
    items,
    draftConfig,
    handleValueChangeAndSave,
  } = useConfigForm({ section: WHIMBOX_SECTION, rpcClient })

  const stopKeyItem = items.find((item) => item.key === "stop_key")
  const otherItems = items.filter((item) => item.key !== "stop_key")

  if (items.length === 0 && !loading && !loadError) return null

  return (
    <div className="space-y-3">
      {stopKeyItem ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <KeybindInput
            label={stopKeyItem.description || "停止任务快捷键"}
            value={String(draftConfig?.stop_key?.value ?? "")}
            onChange={(value) => handleValueChangeAndSave("stop_key", value)}
            className="bg-transparent px-0 py-0 dark:bg-transparent"
          />
        </div>
      ) : null}
      {loading || loadError || otherItems.length > 0 ? (
        <ConfigFormFields
          items={otherItems}
          draftConfig={draftConfig}
          onValueChange={handleValueChangeAndSave}
          loading={loading}
          loadError={loadError}
          emptyMessage="暂无运行配置项"
          itemClassName="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50"
        />
      ) : null}
    </div>
  )
}

export const content: SettingContent = {
  title: "奇想盒设置",
  description: "奇想盒本身的设置",
  render: (
    {
      isProcessing,
      updateState,
      onCheckUpdate,
      onManualUpdate,
      onSyncScripts,
      rpcClient,
    }: SettingsDialogProps,
    slots
  ) => (
    <div className="space-y-3">
      <ThemeToggle />
      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-100">脚本</p>
            <p className="text-xs text-slate-400">订阅/导入脚本后看不到？来这里刷新一下</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={onSyncScripts}
            >
              刷新脚本
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => window.App?.launcher?.openScriptsFolder?.()}
            >
              打开脚本目录
            </Button>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-100">日志</p>
            <p className="text-xs text-slate-400">奇想盒运行产生的日志</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            onClick={() => window.App?.launcher?.openLogsFolder?.()}
          >
            打开日志目录
          </Button>
        </div>
      </div>
      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-100">更新</p>
            <p className="text-xs text-slate-400">如果之前忽略了更新，可以在这里重新检查</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCheckUpdate}
              disabled={isProcessing || updateState.status === "checking"}
            >
              自动更新
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.App?.launcher?.openExternal(APP_RELEASE_PAGE_URL)}
              disabled={isProcessing}
            >
              手动更新前端
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onManualUpdate}
              disabled={isProcessing}
            >
              手动更新后端
            </Button>
          </div>
        </div>
      </div>
      {rpcClient ? <WhimboxConfigForm rpcClient={rpcClient} /> : null}
    </div>
  ),
}
