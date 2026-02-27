import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"

export type ConfigItem = {
  value: string | number | boolean
  description?: string
}

export type ConfigSection = Record<string, ConfigItem>

export type ConfigMetaItem = {
  key: string
  description?: string
  type: "string" | "number" | "boolean"
  options?: string[]
}

export type ConfigMeta = {
  section: string
  items: ConfigMetaItem[]
}

export function isBooleanLike(value: unknown): boolean {
  return (
    value === true ||
    value === false ||
    value === "true" ||
    value === "false"
  )
}

type UseConfigFormOptions = {
  /** 配置段名，如 "OneDragon"、"Agent" */
  section: string
  rpcClient: IpcRpcClient
  /** 外部触发重新加载配置的版本号 */
  reloadVersion?: number
}

export function useConfigForm({ section, rpcClient, reloadVersion }: UseConfigFormOptions) {
  const [config, setConfig] = useState<ConfigSection | null>(null)
  const [draftConfig, setDraftConfig] = useState<ConfigSection | null>(null)
  const [configMeta, setConfigMeta] = useState<ConfigMeta | null>(null)
  const originalConfigRef = useRef<ConfigSection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string>("")

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError("")
    rpcClient
      .sendRequest<{ value?: ConfigSection }>("config.get", { path: section })
      .then((result) => {
        if (!active) return
        const value = result?.value ?? {}
        setConfig(value)
        setDraftConfig(value)
        originalConfigRef.current = value
      })
      .catch(() => {
        if (!active) return
        setLoadError("奇想盒未安装，读取配置失败。")
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    rpcClient
      .sendRequest<ConfigMeta>("config.meta", { section })
      .then((result) => {
        if (!active) return
        setConfigMeta(result)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [rpcClient, section, reloadVersion])

  const items = useMemo(() => {
    if (configMeta?.items?.length) {
      return configMeta.items
    }
    const cfg = draftConfig ?? {}
    return Object.keys(cfg).map((key) => ({
      key,
      description: cfg[key]?.description,
      type: isBooleanLike(cfg[key]?.value) ? ("boolean" as const) : ("string" as const),
      options: undefined as string[] | undefined,
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

  /** 修改后立即保存单条（用于「改完即存」模式，不弹成功 toast） */
  const handleValueChangeAndSave = async (
    key: string,
    value: string | number | boolean
  ) => {
    if (!draftConfig) return
    const prevValue = draftConfig[key]?.value
    if (String(value) === String(prevValue ?? "")) return

    setDraftConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: { ...prev[key], value },
      }
    })
    setSaving(true)
    try {
      await rpcClient.sendRequest("config.update", {
        path: `${section}.${key}`,
        value,
      })
      originalConfigRef.current = {
        ...originalConfigRef.current,
        [key]: { ...(originalConfigRef.current?.[key] ?? {}), value },
      }
    } catch {
      toast.error("保存失败，请稍后重试")
      setDraftConfig((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          [key]: { ...prev[key], value: prevValue },
        }
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (options?: {
    successMessage?: string
    noChangeMessage?: string
  }): Promise<boolean> => {
    if (!draftConfig) return false
    const original = originalConfigRef.current ?? {}
    const updates = Object.entries(draftConfig)
      .filter(([key, item]) => {
        const originalValue = original[key]?.value
        return String(item.value) !== String(originalValue ?? "")
      })
      .map(([key, item]) => ({
        path: `${section}.${key}`,
        value: item.value,
      }))
    if (updates.length === 0) {
      toast.info(options?.noChangeMessage ?? "暂无需要保存的修改。")
      return false
    }
    setSaving(true)
    try {
      await rpcClient.sendRequest("config.update", { updates })
      originalConfigRef.current = draftConfig
      setConfig(draftConfig)
      toast.success(options?.successMessage ?? "配置已保存")
      return true
    } catch {
      toast.error("保存失败，请稍后重试")
      return false
    } finally {
      setSaving(false)
    }
  }

  return {
    loading,
    loadError,
    config,
    draftConfig,
    items,
    saving,
    handleValueChange,
    handleValueChangeAndSave,
    handleSave,
    originalConfigRef,
  }
}
