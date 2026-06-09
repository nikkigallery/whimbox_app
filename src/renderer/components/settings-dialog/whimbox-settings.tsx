import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { Button } from "renderer/components/ui/button"
import { Checkbox } from "renderer/components/ui/checkbox"
import { ThemeToggle } from "renderer/components/theme-provider"
import { ConfigFormFields } from "renderer/components/config-form-fields"
import { KeybindInput } from "renderer/components/settings-dialog/keybind-input"
import { useConfigForm } from "renderer/hooks/use-config-form"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { toast } from "sonner"
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

async function handleRunUninstaller() {
  const confirmed = window.confirm("即将启动卸载程序，当前应用会关闭。是否继续？")
  if (!confirmed) return

  try {
    await window.App.launcher.runUninstaller()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "启动卸载程序失败")
  }
}

function AutoStartSetting() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let disposed = false

    window.App.launcher
      .getAutoStart()
      .then((value) => {
        if (!disposed) setEnabled(value)
      })
      .catch((error) => {
        if (!disposed) {
          toast.error(error instanceof Error ? error.message : "读取开机自启动设置失败")
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [])

  async function handleChange(value: boolean) {
    const previous = enabled
    setEnabled(value)
    setSaving(true)

    try {
      const actual = await window.App.launcher.setAutoStart(value)
      setEnabled(actual)
    } catch (error) {
      setEnabled(previous)
      toast.error(error instanceof Error ? error.message : "保存开机自启动设置失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-100">开机自启动</p>
          <p className="text-xs text-slate-400">开机后自动启动奇想盒</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-200">
          <Checkbox
            checked={enabled}
            disabled={loading || saving}
            onCheckedChange={(checked) => handleChange(checked === true)}
            className="data-[state=checked]:bg-pink-400 data-[state=checked]:border-pink-400 data-[state=checked]:text-white"
          />
          <span>{enabled ? "已开启" : "已关闭"}</span>
        </label>
      </div>
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
      <AutoStartSetting />
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
              github地址
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
      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-100">卸载</p>
            <p className="text-xs text-slate-400">启动卸载程序，卸载整个奇想盒APP</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={isProcessing}
            onClick={handleRunUninstaller}
          >
            卸载奇想盒
          </Button>
        </div>
      </div>
      {rpcClient ? <WhimboxConfigForm rpcClient={rpcClient} /> : null}
    </div>
  ),
}
