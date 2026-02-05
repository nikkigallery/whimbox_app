import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ScrollCenterLayout } from "renderer/components/scroll-center-layout"
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
import { Input } from "renderer/components/ui/input"
import { Spinner } from "renderer/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "renderer/components/ui/table"
import { IpcRpcClient } from "renderer/lib/ipc-rpc"

type ScriptMode = "path" | "macro" | "music"

type ScriptRow = {
  name: string
  type?: string
  target?: string
  count?: number
  region?: string
  map?: string
}

type ScriptSelectPageProps = {
  mode: ScriptMode
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

const PATH_TYPES = ["不限", "采集", "捕虫", "清洁", "战斗", "钓鱼", "综合"]

const toolIdMap: Record<ScriptMode, string> = {
  path: "nikki.load_path",
  macro: "nikki.run_macro",
  music: "nikki.play_music",
}

const startLabelMap: Record<ScriptMode, string> = {
  path: "开始跑图",
  macro: "运行宏",
  music: "演奏乐谱",
}

const titleMap: Record<ScriptMode, string> = {
  path: "自动跑图",
  macro: "键鼠宏",
  music: "自动演奏",
}

const deleteLabelMap: Record<ScriptMode, string> = {
  path: "删除路线",
  macro: "删除宏",
  music: "删除乐谱",
}

const namePlaceholderMap: Record<ScriptMode, string> = {
  path: "路线名称",
  macro: "宏名称",
  music: "乐谱名称",
}

const showDefaultLabelMap: Record<"path" | "macro", string> = {
  path: "显示一条龙路线",
  macro: "显示一条龙宏",
}

const normalizeScripts = (payload: unknown): ScriptRow[] => {
  if (!payload) return []
  const list = Array.isArray(payload)
    ? payload
    : typeof payload === "object" &&
        payload !== null &&
        Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : []
  const rows = list
    .map((item): ScriptRow | null => {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      const info =
        record.info && typeof record.info === "object"
          ? (record.info as Record<string, unknown>)
          : record
      const name = typeof info.name === "string" ? info.name : ""
      if (!name) return null
      return {
        name,
        type: typeof info.type === "string" ? info.type : undefined,
        target: typeof info.target === "string" ? info.target : undefined,
        count: typeof info.count === "number" ? info.count : undefined,
        region: typeof info.region === "string" ? info.region : undefined,
        map: typeof info.map === "string" ? info.map : undefined,
      }
    })
    .filter((item): item is ScriptRow => item !== null)
  return rows
}

export function ScriptSelectPage({
  mode,
  sessionId,
  rpcState,
}: ScriptSelectPageProps) {
  const rpcRef = useRef<IpcRpcClient | null>(null)
  if (!rpcRef.current) {
    rpcRef.current = new IpcRpcClient()
  }
  const rpcClient = rpcRef.current

  const [loading, setLoading] = useState(true)
  const [scripts, setScripts] = useState<ScriptRow[]>([])
  const [error, setError] = useState<string>("")
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const [nameFilter, setNameFilter] = useState("")
  const [targetFilter, setTargetFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("不限")
  const [countFilter, setCountFilter] = useState("")
  const [showDefault, setShowDefault] = useState(false)

  const showDefaultToggle = mode !== "music"
  const toolId = toolIdMap[mode]

  const loadScripts = async () => {
    setLoading(true)
    setError("")
    try {
      const params =
        mode === "path"
          ? {
              name: nameFilter.trim() || undefined,
              target: targetFilter.trim() || undefined,
              type: typeFilter === "不限" ? undefined : typeFilter,
              count: (() => {
                if (countFilter.trim().length === 0) return undefined
                const parsed = Number(countFilter)
                return Number.isNaN(parsed) ? undefined : parsed
              })(),
              show_default: showDefault,
            }
          : {
              name: nameFilter.trim() || undefined,
              is_play_music: mode === "music",
              show_default: showDefault,
            }
      const method = mode === "path" ? "script.query_path" : "script.query_macro"
      const result = await rpcClient.sendRequest<unknown>(method, params)
      const nextScripts = normalizeScripts(result)
      setScripts(nextScripts)
      if (selectedName && !nextScripts.some((item) => item.name === selectedName)) {
        setSelectedName(null)
      }
    } catch (err) {
      setScripts([])
      setSelectedName(null)
      setError("读取脚本列表失败，请稍后重试。")
      toast.error("读取脚本列表失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadScripts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nameFilter, targetFilter, typeFilter, countFilter, showDefault])

  useEffect(() => {
    const offNotification = rpcClient.on("notification", (notification) => {
      if (notification.method !== "event.task.progress") return
      const params =
        notification.params && typeof notification.params === "object"
          ? (notification.params as Record<string, unknown>)
          : undefined
      const toolIdValue = typeof params?.tool_id === "string" ? params.tool_id : ""
      const detail = typeof params?.detail === "string" ? params.detail : ""
      if (toolIdValue !== toolId) return
      if (detail === "started") {
        setIsRunning(true)
      } else if (detail === "completed" || detail === "cancelled") {
        setIsRunning(false)
      }
    })
    return () => {
      offNotification()
    }
  }, [rpcClient, toolId])

  const handleReset = () => {
    setNameFilter("")
    setTargetFilter("")
    setTypeFilter("不限")
    setCountFilter("")
    setShowDefault(false)
  }

  const handleDelete = async () => {
    if (!selectedName) {
      toast.warning("请先选择一条记录")
      return
    }
    try {
      await rpcClient.sendRequest("script.delete", {
        name: selectedName,
        category: mode,
      })
      toast.success("删除成功")
      void loadScripts()
    } catch {
      toast.error("删除失败，请稍后重试")
    }
  }

  const handleStart = async () => {
    if (!selectedName) {
      toast.warning("请先选择一条记录")
      return
    }
    if (rpcState !== "open" || !sessionId) {
      toast.error("RPC 未连接，暂无法启动任务。")
      return
    }
    try {
      await rpcClient.sendRequest("task.run", {
        session_id: sessionId,
        tool_id: toolId,
        input:
          mode === "path"
            ? { path_name: selectedName }
            : { macro_name: selectedName },
      })
      setIsRunning(true)
      toast.success("任务已启动")
    } catch {
      toast.error("启动失败，请稍后重试")
    }
  }

  const columns = useMemo(() => {
    if (mode === "path") {
      return [
        { key: "name", label: "路线名" },
        { key: "type", label: "类型" },
        { key: "target", label: "目标" },
        { key: "count", label: "数量" },
        { key: "region", label: "区域" },
      ] as const
    }
    return [{ key: "name", label: mode === "music" ? "乐谱名称" : "宏名称" }] as const
  }, [mode])

  return (
    <ScrollCenterLayout innerClassName="flex flex-1 flex-col min-h-0 gap-4 px-10 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            {titleMap[mode]}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => void loadScripts()}
            disabled={loading}
          >
            刷新列表
          </Button>
          <Button
            variant="outline"
            className="rounded-xl text-red-500 hover:text-red-600"
            onClick={handleDelete}
            disabled={!selectedName}
          >
            {deleteLabelMap[mode]}
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={handleReset}>
            重置筛选
          </Button>
          <Button
            className="rounded-xl bg-pink-400 text-white shadow-sm transition hover:bg-pink-500"
            onClick={handleStart}
            disabled={!selectedName || rpcState !== "open" || !sessionId || isRunning}
          >
            {isRunning ? "任务运行中" : startLabelMap[mode]}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <span className="text-xs text-slate-500">名称</span>
            <Input
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder={namePlaceholderMap[mode]}
            />
          </div>
          {mode === "path" ? (
            <>
              <div className="space-y-1.5">
                <span className="text-xs text-slate-500">目标素材</span>
                <Input
                  value={targetFilter}
                  onChange={(event) => setTargetFilter(event.target.value)}
                  placeholder="输入素材名"
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs text-slate-500">路线类型</span>
                <Combobox
                  items={PATH_TYPES}
                  value={PATH_TYPES.includes(typeFilter) ? typeFilter : null}
                  inputValue={typeFilter}
                  onValueChange={(next) => next && setTypeFilter(next)}
                  onInputValueChange={setTypeFilter}
                >
                  <ComboboxInput className="w-full" placeholder="选择路线类型"/>
                  <ComboboxContent>
                    <ComboboxList>
                      {(option, index) => (
                        <ComboboxItem
                          key={`${option}-${index}`}
                          value={option}
                        >
                          {option}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                    <ComboboxEmpty>没有匹配项</ComboboxEmpty>
                  </ComboboxContent>
                </Combobox>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs text-slate-500">目标数量</span>
                <Input
                  type="number"
                  min={0}
                  value={countFilter}
                  onChange={(event) => setCountFilter(event.target.value)}
                  placeholder="不限"
                />
              </div>
            </>
          ) : null}
        </div>
        {showDefaultToggle ? (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <Checkbox
              checked={showDefault}
              onCheckedChange={(checked) => setShowDefault(Boolean(checked))}
              className="data-[state=checked]:bg-pink-400 data-[state=checked]:border-pink-400 data-[state=checked]:text-white"
            />
            {showDefaultLabelMap[mode === "path" ? "path" : "macro"]}
          </label>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Spinner className="size-4" />
            正在读取脚本列表...
          </div>
        ) : scripts.length === 0 ? (
          <div className="text-sm text-slate-400">
            {error || "暂无符合条件的脚本"}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {scripts.map((item) => {
                const isSelected = item.name === selectedName
                const regionText = item.region || item.map || "-"
                return (
                  <TableRow
                    key={item.name}
                    data-state={isSelected ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => setSelectedName(item.name)}
                  >
                    <TableCell className="font-medium">{item.name}</TableCell>
                    {mode === "path" ? (
                      <>
                        <TableCell>{item.type || "-"}</TableCell>
                        <TableCell>{item.target || "-"}</TableCell>
                        <TableCell>{item.count ?? "-"}</TableCell>
                        <TableCell>{regionText}</TableCell>
                      </>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </div>
        )}
      </div>
    </ScrollCenterLayout>
  )
}
