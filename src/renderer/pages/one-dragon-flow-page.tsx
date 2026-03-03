import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ScrollCenterLayout } from "renderer/components/scroll-center-layout"
import { SettingsPageLayout } from "renderer/components/settings-page-layout"
import { Button } from "renderer/components/ui/button"
import { Checkbox } from "renderer/components/ui/checkbox"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "renderer/components/ui/combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "renderer/components/ui/select"
import { Spinner } from "renderer/components/ui/spinner"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"

type CustomStepType = "path" | "macro" | "close_game"

type DefaultStepItem = {
  key: string
  label: string
  enabled: boolean
}

type CustomStepItem = {
  id: string
  enabled: boolean
  type: CustomStepType
  script_name: string
}

type OneDragonFlowResponse = {
  default_steps?: DefaultStepItem[]
  custom_steps?: CustomStepItem[]
}

type ScriptRow = {
  name: string
}

type OneDragonFlowPageProps = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
  backendReloadVersion?: number
}

const TYPE_LABELS: Record<CustomStepType, string> = {
  path: "执行跑图脚本",
  macro: "执行宏脚本",
  close_game: "关闭游戏",
}

const normalizeScripts = (payload: unknown): string[] => {
  if (!payload) return []
  const list = Array.isArray(payload)
    ? payload
    : typeof payload === "object"
        && payload !== null
        && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : []

  return list
    .map((item): ScriptRow | null => {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      const info =
        record.info && typeof record.info === "object"
          ? (record.info as Record<string, unknown>)
          : record
      const name = typeof info.name === "string" ? info.name : ""
      return name ? { name } : null
    })
    .filter((item): item is ScriptRow => item !== null)
    .map((item) => item.name)
}

const normalizeCustomSteps = (steps: CustomStepItem[] | undefined): CustomStepItem[] => {
  if (!Array.isArray(steps)) return []
  return steps
    .filter((step) => step && typeof step.id === "string")
    .map((step) => ({
      id: step.id,
      enabled: Boolean(step.enabled),
      type:
        step.type === "path" || step.type === "macro" || step.type === "close_game"
          ? step.type
          : "path",
      script_name: typeof step.script_name === "string" ? step.script_name : "",
    }))
}

const createStepId = () =>
  globalThis.crypto?.randomUUID?.()
  ?? `step_${Date.now()}_${Math.random().toString(16).slice(2)}`

export function OneDragonFlowPage({
  rpcClient,
  sessionId,
  rpcState,
  backendReloadVersion,
}: OneDragonFlowPageProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [defaultSteps, setDefaultSteps] = useState<DefaultStepItem[]>([])
  const [customSteps, setCustomSteps] = useState<CustomStepItem[]>([])
  const [pathScripts, setPathScripts] = useState<string[]>([])
  const [macroScripts, setMacroScripts] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [isStopping, setIsStopping] = useState(false)

  const loadFlow = async () => {
    setLoading(true)
    setLoadError("")
    try {
      const [flowResult, pathResult, macroResult] = await Promise.all([
        rpcClient.sendRequest<OneDragonFlowResponse>("one_dragon.flow.get", {}),
        rpcClient.sendRequest<unknown>("script.query_path", { show_default: true }),
        rpcClient.sendRequest<unknown>("script.query_macro", { show_default: true }),
      ])
      setDefaultSteps(Array.isArray(flowResult?.default_steps) ? flowResult.default_steps : [])
      setCustomSteps(normalizeCustomSteps(flowResult?.custom_steps))
      setPathScripts(normalizeScripts(pathResult))
      setMacroScripts(normalizeScripts(macroResult))
    } catch {
      setLoadError("奇想盒后端异常，读取流程配置失败。")
      setDefaultSteps([])
      setCustomSteps([])
      setPathScripts([])
      setMacroScripts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFlow()
  }, [rpcClient, backendReloadVersion])

  useEffect(() => {
    const offNotification = rpcClient.on("notification", (notification) => {
      if (notification.method !== "event.run.status") return
      const params =
        notification.params && typeof notification.params === "object"
          ? (notification.params as Record<string, unknown>)
          : undefined
      const source = typeof params?.source === "string" ? params.source : ""
      if (source !== "task") return
      const toolId = typeof params?.tool_id === "string" ? params.tool_id : ""
      if (toolId && toolId !== "nikki.all_in_one") return
      const phase = typeof params?.phase === "string" ? params.phase : ""
      if (phase === "started") {
        const taskId = typeof params?.task_id === "string" ? params.task_id : null
        if (taskId) setRunningTaskId(taskId)
        setIsStopping(false)
        setIsRunning(true)
      } else if (phase === "stopping") {
        setIsStopping(true)
      } else if (phase === "completed" || phase === "cancelled" || phase === "error") {
        setRunningTaskId(null)
        setIsStopping(false)
        setIsRunning(false)
      }
    })
    return () => {
      offNotification()
    }
  }, [rpcClient])

  const persistFlow = async (nextDefaultSteps: DefaultStepItem[], nextCustomSteps: CustomStepItem[]) => {
    setDefaultSteps(nextDefaultSteps)
    setCustomSteps(nextCustomSteps)
    setSaving(true)
    try {
      const result = await rpcClient.sendRequest<OneDragonFlowResponse>("one_dragon.flow.update", {
        default_steps: Object.fromEntries(nextDefaultSteps.map((item) => [item.key, item.enabled])),
        custom_steps: nextCustomSteps,
      })
      setDefaultSteps(Array.isArray(result?.default_steps) ? result.default_steps : nextDefaultSteps)
      setCustomSteps(normalizeCustomSteps(result?.custom_steps ?? nextCustomSteps))
    } catch {
      toast.error("保存失败，请稍后重试")
      void loadFlow()
    } finally {
      setSaving(false)
    }
  }

  const handleToggleDefaultStep = (key: string, enabled: boolean) => {
    const nextDefaultSteps = defaultSteps.map((item) =>
      item.key === key ? { ...item, enabled } : item,
    )
    void persistFlow(nextDefaultSteps, customSteps)
  }

  const handleAddCustomStep = () => {
    const nextCustomSteps = [
      ...customSteps,
      {
        id: createStepId(),
        enabled: true,
        type: "path" as const,
        script_name: "",
      },
    ]
    void persistFlow(defaultSteps, nextCustomSteps)
  }

  const handleRemoveCustomStep = (id: string) => {
    const nextCustomSteps = customSteps.filter((item) => item.id !== id)
    void persistFlow(defaultSteps, nextCustomSteps)
  }

  const updateCustomStepLocal = (id: string, updater: (item: CustomStepItem) => CustomStepItem) => {
    setCustomSteps((prev) => prev.map((item) => (item.id === id ? updater(item) : item)))
  }

  const persistCustomSteps = (nextCustomSteps: CustomStepItem[]) => {
    void persistFlow(defaultSteps, nextCustomSteps)
  }

  const handleToggleCustomStep = (id: string, enabled: boolean) => {
    const nextCustomSteps = customSteps.map((item) =>
      item.id === id ? { ...item, enabled } : item,
    )
    persistCustomSteps(nextCustomSteps)
  }

  const handleChangeCustomStepType = (id: string, type: CustomStepType) => {
    const nextCustomSteps = customSteps.map((item) =>
      item.id === id
        ? { ...item, type, script_name: type === "close_game" ? "" : item.script_name }
        : item,
    )
    persistCustomSteps(nextCustomSteps)
  }

  const handleCommitScriptName = (id: string, scriptName: string) => {
    const nextCustomSteps = customSteps.map((item) =>
      item.id === id ? { ...item, script_name: scriptName.trim() } : item,
    )
    persistCustomSteps(nextCustomSteps)
  }

  const handleRun = async () => {
    if (!sessionId || rpcState !== "open") return
    try {
      const result = await rpcClient.sendRequest<{ task_id?: string }>("task.run", {
        session_id: sessionId,
        tool_id: "nikki.all_in_one",
        input: {},
      })
      const taskId = typeof result?.task_id === "string" ? result.task_id : null
      if (taskId) setRunningTaskId(taskId)
      setIsStopping(false)
      setIsRunning(true)
    } catch {
      toast.error("启动失败")
    }
  }

  const handleStop = async () => {
    if (!runningTaskId) return
    try {
      setIsStopping(true)
      await rpcClient.sendRequest("task.stop", { task_id: runningTaskId })
    } catch {
      setIsStopping(false)
      toast.error("停止失败")
    }
  }

  return (
    <ScrollCenterLayout
      scrollOuter={false}
      innerClassName="flex flex-1 flex-col min-h-0 gap-4 px-10 py-8"
    >
      <SettingsPageLayout
        className="flex-1 min-h-0"
        title="一条龙流程"
        actions={
          <div className="flex items-center gap-3">
            {saving ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Spinner className="size-4" />
                保存中...
              </div>
            ) : null}
            <Button
              onClick={runningTaskId ? handleStop : handleRun}
              disabled={rpcState !== "open" || !sessionId || (runningTaskId ? isStopping : isRunning)}
              className="rounded-xl bg-pink-400 text-white shadow-sm transition hover:bg-pink-500"
            >
              {runningTaskId ? (isStopping ? "结束中..." : "停止任务") : "开始一条龙"}
            </Button>
          </div>
        }
      >
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">默认步骤</h2>
          <p className="mt-1 text-xs text-slate-400">一条龙默认流程，可以单独控制每个步骤是否执行。</p>
          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Spinner className="size-4" />
                正在读取流程配置...
              </div>
            ) : loadError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {loadError}
              </div>
            ) : defaultSteps.length === 0 ? (
              <div className="text-sm text-slate-400">暂无默认步骤</div>
            ) : (
              <div className="space-y-3">
                {defaultSteps.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-100">
                      {item.label}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <Checkbox
                        checked={item.enabled}
                        onCheckedChange={(checked) => handleToggleDefaultStep(item.key, Boolean(checked))}
                        className="data-[state=checked]:bg-pink-400 data-[state=checked]:border-pink-400 data-[state=checked]:text-white"
                      />
                      启用
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">自定义步骤</h2>
              <p className="mt-1 text-xs text-slate-400">按顺序在默认步骤结束后依次执行。</p>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={handleAddCustomStep} disabled={loading || !!loadError}>
              新增步骤
            </Button>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Spinner className="size-4" />
                正在读取自定义步骤...
              </div>
            ) : loadError ? (
              <div className="text-sm text-slate-400">请先恢复后端连接后再编辑自定义步骤。</div>
            ) : customSteps.length === 0 ? (
              <div className="text-sm text-slate-400">暂无自定义步骤</div>
            ) : (
              <div className="space-y-2">
                {customSteps.map((step) => {
                  const scriptOptions = step.type === "path" ? pathScripts : macroScripts
                  return (
                    <div
                      key={step.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <Select
                        value={step.type}
                        onValueChange={(value) => handleChangeCustomStepType(step.id, value as CustomStepType)}
                      >
                        <SelectTrigger className="w-[10rem] rounded-xl">
                          <SelectValue placeholder="选择步骤类型" />
                        </SelectTrigger>
                        <SelectContent>
                          {(["path", "macro", "close_game"] as CustomStepType[]).map((type) => (
                            <SelectItem key={type} value={type}>
                              {TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="min-w-[16rem] flex-1">
                        <Combobox
                          items={scriptOptions}
                          value={scriptOptions.includes(step.script_name) ? step.script_name : null}
                          inputValue={step.script_name}
                          onValueChange={(nextValue) =>
                            handleCommitScriptName(step.id, nextValue ? String(nextValue) : "")
                          }
                          onInputValueChange={(nextValue) => {
                            if (step.type === "close_game") return
                            updateCustomStepLocal(step.id, (item) => ({
                              ...item,
                              script_name: nextValue,
                            }))
                          }}
                        >
                          <ComboboxInput
                            className="w-full"
                            disabled={step.type === "close_game"}
                            placeholder={step.type === "close_game"
                              ? "关闭游戏无需脚本"
                              : step.type === "path"
                                ? "请输入跑图脚本名"
                                : "请输入宏脚本名"}
                            onBlur={(event) => {
                              if (step.type === "close_game") return
                              handleCommitScriptName(step.id, event.target.value)
                            }}
                          />
                          <ComboboxContent>
                            <ComboboxList>
                              {(option, optionIndex) => (
                                <ComboboxItem
                                  key={`${String(option)}-${optionIndex}`}
                                  value={option}
                                >
                                  {String(option)}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                            <ComboboxEmpty>没有匹配项</ComboboxEmpty>
                          </ComboboxContent>
                        </Combobox>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-slate-500">
                        <Checkbox
                          checked={step.enabled}
                          onCheckedChange={(checked) => handleToggleCustomStep(step.id, Boolean(checked))}
                          className="data-[state=checked]:bg-pink-400 data-[state=checked]:border-pink-400 data-[state=checked]:text-white"
                        />
                        启用
                      </label>

                      <Button
                        variant="outline"
                        className="rounded-xl text-red-500 hover:text-red-600"
                        onClick={() => handleRemoveCustomStep(step.id)}
                      >
                        删除
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </SettingsPageLayout>
    </ScrollCenterLayout>
  )
}
