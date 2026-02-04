import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "renderer/components/ui/combobox"
import { ScrollCenterLayout } from "renderer/components/scroll-center-layout"
import { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { Button } from "renderer/components/ui/button"
import { Spinner } from "renderer/components/ui/spinner"

type ConfigItem = {
  value: string | number | boolean
  description?: string
}

type ConfigSection = Record<string, ConfigItem>

type ConfigMetaItem = {
  key: string
  description?: string
  type: "string" | "number" | "boolean"
  options?: string[]
}

type ConfigMeta = {
  section: string
  items: ConfigMetaItem[]
}

type OneDragonPageProps = {
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

const isBooleanLike = (value: unknown) =>
  value === true ||
  value === false ||
  value === "true" ||
  value === "false"

export function OneDragonPage({ sessionId, rpcState }: OneDragonPageProps) {
  const rpcRef = useRef<IpcRpcClient | null>(null)
  if (!rpcRef.current) {
    rpcRef.current = new IpcRpcClient()
  }
  const rpcClient = rpcRef.current

  const [gameConfig, setGameConfig] = useState<ConfigSection | null>(null)
  const [draftConfig, setDraftConfig] = useState<ConfigSection | null>(null)
  const [configMeta, setConfigMeta] = useState<ConfigMeta | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const originalConfigRef = useRef<ConfigSection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string>("")

  useEffect(() => {
    let active = true
    setLoading(true)
    setStatus("")
    rpcClient
      .sendRequest<{ value?: ConfigSection }>("config.get", { path: "Game" })
      .then((result) => {
        if (!active) return
        const value = result?.value ?? {}
        setGameConfig(value)
        setDraftConfig(value)
        originalConfigRef.current = value
      })
      .catch(() => {
        if (!active) return
        setStatus("读取配置失败，请稍后重试。")
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    rpcClient
      .sendRequest<ConfigMeta>("config.meta", { section: "Game" })
      .then((result) => {
        if (!active) return
        setConfigMeta(result)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [rpcClient])

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

  const items = useMemo(() => {
    if (configMeta?.items?.length) {
      return configMeta.items
    }
    const config = draftConfig ?? {}
    return Object.keys(config).map((key) => ({
      key,
      description: config[key]?.description,
      type: isBooleanLike(config[key]?.value) ? "boolean" : "string",
    })) as ConfigMetaItem[]
  }, [configMeta, draftConfig])

  const handleValueChange = (key: string, value: string | number | boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: {
          ...prev[key],
          value,
        },
      }
    })
  }

  const handleSave = async () => {
    if (!draftConfig) return
    const original = originalConfigRef.current ?? {}
    const updates = Object.entries(draftConfig)
      .filter(([key, item]) => {
        const originalValue = original[key]?.value
        return String(item.value) !== String(originalValue ?? "")
      })
      .map(([key, item]) => ({
        path: `Game.${key}`,
        value: item.value,
      }))
    if (updates.length === 0) {
      toast.info("暂无需要保存的修改。")
      return
    }
    setSaving(true)
    setStatus("")
    try {
      await rpcClient.sendRequest("config.update", { updates })
      originalConfigRef.current = draftConfig
      setGameConfig(draftConfig)
      toast.success("配置保存成功")
    } catch {
      toast.error("配置保存失败")
    } finally {
      setSaving(false)
    }
  }

  const handleRun = async () => {
    if (!sessionId || rpcState !== "open") {
      setStatus("RPC 未连接，暂无法启动任务。")
      return
    }
    setStatus("")
    try {
      await rpcClient.sendRequest("task.run", {
        session_id: sessionId,
        tool_id: "nikki.all_in_one",
        input: {},
      })
      setIsRunning(true)
    } catch {
      setStatus("启动失败，请稍后重试。")
    }
  }

  return (
    <ScrollCenterLayout innerClassName="flex flex-col gap-4 px-10 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            一条龙配置
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={loading || saving}
            variant="outline"
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
          <Button
            onClick={handleRun}
            disabled={rpcState !== "open" || !sessionId || isRunning}
            className="rounded-xl bg-pink-500 text-white shadow-sm transition hover:bg-pink-400"
          >
            {isRunning ? "一条龙运行中" : "开始一条龙"}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Spinner className="size-4" />
            正在读取配置...
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400">暂无可用配置</div>
        ) : (
          items.map((meta) => {
            const key = meta.key
            const value = draftConfig?.[key]?.value ?? ""
            const booleanLike =
              meta.type === "boolean" || isBooleanLike(value)
            const label = meta.description || key
            const options = meta.options ?? []
            return (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-100">
                      {label}
                    </div>
                  </div>
                  {booleanLike ? (
                    <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={String(value) === "true"}
                        onChange={(event) =>
                          handleValueChange(
                            key,
                            event.target.checked ? "true" : "false",
                          )
                        }
                        className="size-4 rounded border-slate-300 text-pink-500 focus:ring-pink-500"
                      />
                      {String(value) === "true" ? "开启" : "关闭"}
                    </label>
                  ) : options.length > 0 ? (
                    <Combobox
                      items={options}
                      value={
                        options.includes(String(value)) ? String(value) : null
                      }
                      inputValue={String(value)}
                      onValueChange={(nextValue) =>
                        handleValueChange(
                          key,
                          nextValue ? String(nextValue) : "",
                        )
                      }
                      onInputValueChange={(inputValue) =>
                        handleValueChange(key, inputValue)
                      }
                    >
                      <ComboboxInput
                        className="w-full"
                        placeholder="请输入或选择"
                      />
                      <ComboboxContent>
                        <ComboboxList>
                          {(option, index) => (
                            <ComboboxItem
                              key={`${String(option)}-${index}`}
                              value={option}
                            >
                              {String(option)}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                        <ComboboxEmpty>没有匹配项</ComboboxEmpty>
                      </ComboboxContent>
                    </Combobox>
                  ) : (
                    <input
                      value={String(value)}
                      onChange={(event) =>
                        handleValueChange(key, event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </ScrollCenterLayout>
  )
}
