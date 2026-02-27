import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ScrollCenterLayout } from "renderer/components/scroll-center-layout"
import { Checkbox } from "renderer/components/ui/checkbox"
import { Spinner } from "renderer/components/ui/spinner"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"

type BackgroundState = {
  running: boolean
  features: Record<string, boolean>
}

const FEATURE_ITEMS = [
  { key: "auto_fishing", label: "自动钓鱼" },
  { key: "auto_dialogue", label: "自动对话" },
  { key: "auto_pickup", label: "自动采集" },
  { key: "auto_clear", label: "自动清洁跳过" },
  { key: "auto_flourish", label: "自动芳间巡游（按鼠标右键启停）" },
]

type AutoTriggerPageProps = {
  rpcClient: IpcRpcClient
  backendReloadVersion?: number
}

export function AutoTriggerPage({
  rpcClient,
  backendReloadVersion,
}: AutoTriggerPageProps) {

  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [state, setState] = useState<BackgroundState>({
    running: false,
    features: {},
  })

  useEffect(() => {
    let active = true
    setLoading(true)
    rpcClient
      .sendRequest<BackgroundState>("background.get")
      .then((result) => {
        if (!active) return
        setState(result)
      })
      .catch(() => {
        if (!active) return
        toast.error("读取自动触发状态失败")
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [rpcClient, backendReloadVersion])

  const toggleFeature = async (featureKey: string) => {
    const current = state.features[featureKey] ?? false
    const nextValue = !current
    setSavingKey(featureKey)
    setState((prev) => ({
      ...prev,
      features: { ...prev.features, [featureKey]: nextValue },
    }))
    try {
      const nextState = await rpcClient.sendRequest<BackgroundState>(
        "background.set",
        { feature: featureKey, enabled: nextValue },
      )
      setState(nextState)
      // toast.success(nextValue ? "成功开启" : "成功关闭")
    } catch {
      setState((prev) => ({
        ...prev,
        features: { ...prev.features, [featureKey]: current },
      }))
      toast.error("设置失败，请稍后重试")
    } finally {
      setSavingKey(null)
    }
  }

  const featureRows = useMemo(() => {
    return FEATURE_ITEMS
  }, [])

  return (
    <ScrollCenterLayout innerClassName="flex flex-col gap-4 px-10 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            自动触发
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            觉得太慢了？可在设置中开启“高性能模式”
          </p>
        </div>
      </div>

      <div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Spinner className="size-4" />
            正在读取自动触发功能状态...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {featureRows.map((item) => {
              const checked = state.features[item.key] ?? false
              const isSaving = savingKey === item.key
              return (
                <label
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:border-pink-200 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100"
                >
                  <span className="flex-1">{item.label}</span>
                  <span className="flex items-center gap-2">
                    {isSaving ? (
                      <Spinner className="size-4 text-pink-400" />
                    ) : null}
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleFeature(item.key)}
                      className="data-[state=checked]:bg-pink-400 data-[state=checked]:border-pink-400 data-[state=checked]:text-white"
                    />
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </ScrollCenterLayout>
  )
}
