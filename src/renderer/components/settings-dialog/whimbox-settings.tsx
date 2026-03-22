import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { Button } from "renderer/components/ui/button"
import { ThemeToggle } from "renderer/components/theme-provider"
import { ConfigFormFields } from "renderer/components/config-form-fields"
import { KeybindInput } from "renderer/components/settings-dialog/keybind-input"
import { useConfigForm } from "renderer/hooks/use-config-form"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { toast } from "sonner"
import { APP_RELEASE_PAGE_URL } from "shared/constants"
import type { SettingSection, SettingContent, SettingsDialogProps } from "./types"

const WHIMBOX_SECTION = "Whimbox"
type CloudState = {
  status: "idle" | "connecting" | "connected" | "error"
  deviceId: string | null
  expiresAt: string | null
  lastError: string | null
}

type CloudDeviceStatusResponse = {
  device: {
    device_id: string
    device_name: string
    session_id: string
    is_online: boolean
    last_seen_at: string | null
    last_event_at: string | null
  } | null
  binding: {
    external_userid: string
    open_kfid: string
    session_id: string
    last_message_at: string | null
  } | null
}

type BindCodeResponse = {
  device_id: string
  bind_code: string
  expires_at: string
}

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

function formatTime(value: string | null | undefined) {
  if (!value) return "暂无"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function CloudWechatBindingCard() {
  const [cloudState, setCloudState] = useState<CloudState>({
    status: "idle",
    deviceId: null,
    expiresAt: null,
    lastError: null,
  })
  const [deviceStatus, setDeviceStatus] = useState<CloudDeviceStatusResponse | null>(null)
  const [bindCode, setBindCode] = useState<string>("")
  const [bindExpiresAt, setBindExpiresAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const loadStatus = async () => {
    try {
      const [nextCloudState, nextDeviceStatus] = await Promise.all([
        window.App.launcher.getCloudState(),
        window.App.launcher.apiRequest("/whimbox/cloud/device/status", {
          method: "GET",
          requireAuth: true,
        }) as Promise<CloudDeviceStatusResponse>,
      ])
      setCloudState(nextCloudState)
      setDeviceStatus(nextDeviceStatus)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取云控状态失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
    const off = window.App.launcher.onCloudState((nextState) => {
      setCloudState(nextState)
    })
    return () => {
      off?.()
    }
  }, [])

  const handleCreateBindCode = async () => {
    setSubmitting(true)
    try {
      const result = await window.App.launcher.apiRequest("/whimbox/cloud/bind-code/create", {
        method: "POST",
        requireAuth: true,
      }) as BindCodeResponse
      setBindCode(result.bind_code)
      setBindExpiresAt(result.expires_at)
      await loadStatus()
      toast.success("绑定码已生成")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成绑定码失败")
    } finally {
      setSubmitting(false)
    }
  }

  const connectedText =
    cloudState.status === "connected"
      ? "已连接"
      : cloudState.status === "connecting"
        ? "连接中"
        : cloudState.status === "error"
          ? "连接异常"
          : "未连接"

  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold text-slate-700 dark:text-slate-100">绑定微信</p>
          <p className="text-xs text-slate-400">生成短期绑定码，在微信客服中发送该绑定码完成绑定</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateBindCode}
          disabled={submitting || cloudState.status !== "connected"}
        >
          {submitting ? "生成中..." : "生成绑定码"}
        </Button>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <span>云控连接</span>
          <span className="font-medium text-slate-700 dark:text-slate-100">{connectedText}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <span>设备 ID</span>
          <span className="font-mono text-[11px] text-slate-700 dark:text-slate-100">
            {cloudState.deviceId || deviceStatus?.device?.device_id || "暂无"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <span>微信绑定</span>
          <span className="font-medium text-slate-700 dark:text-slate-100">
            {deviceStatus?.binding ? "已绑定" : loading ? "读取中" : "未绑定"}
          </span>
        </div>
        {bindCode ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-emerald-700 dark:text-emerald-300">当前绑定码</span>
              <span className="font-mono text-lg font-semibold tracking-[0.2em] text-emerald-800 dark:text-emerald-200">
                {bindCode}
              </span>
            </div>
            <p className="mt-2 text-xs text-emerald-700/80 dark:text-emerald-300/80">
              过期时间：{formatTime(bindExpiresAt)}
            </p>
          </div>
        ) : null}
        {deviceStatus?.binding ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
            <p>已绑定用户：{deviceStatus.binding.external_userid}</p>
            <p className="mt-1">最近消息：{formatTime(deviceStatus.binding.last_message_at)}</p>
          </div>
        ) : null}
        {cloudState.lastError ? (
          <p className="text-xs text-rose-500">最近错误：{cloudState.lastError}</p>
        ) : null}
        {cloudState.status !== "connected" ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">云控未连接时无法生成绑定码。</p>
        ) : null}
      </div>
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
      <CloudWechatBindingCard />
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
