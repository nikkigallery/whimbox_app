import { useEffect, useState } from "react"
import { Keyboard } from "lucide-react"
import { toast } from "sonner"
import { KeybindInput } from "./keybind-input"
import type { SettingSection, SettingContent, SettingsDialogProps } from "./types"
import type { ConfigSection } from "renderer/hooks/use-config-form"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"

const KEYBINDS_SECTION = "Keybinds"

export const section: SettingSection = {
  id: "shortcuts",
  label: "键位设置",
  icon: Keyboard,
}

export const content: SettingContent = {
  title: "键位设置",
  description: "如果修改了游戏的键位设置，请在这里同步修改",
  render: (props: SettingsDialogProps) => {
    if (!props.rpcClient) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            奇想盒未安装，暂时无法设置键位
          </p>
        </div>
      )
    }
    return (
      <ShortcutsForm rpcClient={props.rpcClient} />
    )
  },
}

function ShortcutsForm({ rpcClient }: { rpcClient: IpcRpcClient }) {
  const [config, setConfig] = useState<ConfigSection | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError("")
    rpcClient
      .sendRequest<{ value?: ConfigSection }>("config.get", { path: KEYBINDS_SECTION })
      .then((result) => {
        if (!active) return
        setConfig(result?.value ?? {})
      })
      .catch(() => {
        if (!active) return
        setLoadError("奇想盒未安装，读取键位设置失败")
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [rpcClient])

  const handleChange = async (key: string, value: string) => {
    if (!config) return
    setConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: { ...prev[key], value },
      }
    })
    try {
      await rpcClient.sendRequest("config.update", {
        path: `${KEYBINDS_SECTION}.${key}`,
        value,
      })
    } catch {
      toast.error("保存失败，请稍后重试")
      setConfig((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          [key]: { ...prev[key], value: config[key]?.value ?? "" },
        }
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        加载中…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        {loadError}
      </div>
    )
  }

  if (!config || Object.keys(config).length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">暂无键位设置</p>
    )
  }

  // const entries = Object.entries(config).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(config).map(([key, item]) => (
        <KeybindInput
          key={key}
          label={item.description ?? key}
          value={typeof item.value === "string" ? item.value : String(item.value ?? "")}
          onChange={(value) => handleChange(key, value)}
        />
      ))}
    </div>
  )
}
