import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "renderer/components/ui/button"
import { Checkbox } from "renderer/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "renderer/components/ui/dialog"
import { Input } from "renderer/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "renderer/components/ui/select"
import { Spinner } from "renderer/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "renderer/components/ui/table"
import { apiClient, type ScriptListItem } from "renderer/lib/api-client"
import { cn } from "renderer/lib/utils"

const TYPE_OPTIONS = [
  { label: "全部类型", value: "" },
  { label: "采集", value: "采集" },
  { label: "捕虫", value: "捕虫" },
  { label: "清洁", value: "清洁" },
  { label: "钓鱼", value: "钓鱼" },
  { label: "战斗", value: "战斗" },
  { label: "综合", value: "综合" },
  { label: "宏", value: "宏" },
  { label: "乐谱", value: "乐谱" },
]

const ORDER_OPTIONS = [
  { label: "订阅数降序", value: "-subscribe_count" },
  { label: "订阅数升序", value: "subscribe_count" },
  { label: "数量降序", value: "-count" },
  { label: "数量升序", value: "count" },
  { label: "更新时间降序", value: "-update_time" },
  { label: "更新时间升序", value: "update_time" },
]

const PAGE_SIZE = 20

type SearchParams = {
  page: number
  page_size: number
  subscribed: boolean
  type: string
  target: string
  min_count: number
  uploader_name: string
  order_by: string
}

const defaultSearchParams: SearchParams = {
  page: 1,
  page_size: PAGE_SIZE,
  subscribed: false,
  type: "",
  target: "",
  min_count: 0,
  uploader_name: "",
  order_by: "-subscribe_count",
}

function formatTime(time: string | undefined) {
  if (!time) return ""
  const date = new Date(time)
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function SubscribeCountBadge({ value }: { value: number | string }) {
  const v = String(value)
  const variant =
    v === "高" ? "destructive" : v === "中" ? "default" : "secondary"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "destructive" &&
          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
        variant === "default" &&
          "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
        variant === "secondary" &&
          "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
      )}
    >
      {v}
    </span>
  )
}

type ScriptSubscribePageProps = {
  onOpenExternal?: (url: string) => void
  /** 订阅/取消订阅/同步脚本后刷新后端脚本列表（调用 script.refresh） */
  onRefreshBackendScripts?: () => void | Promise<void>
  /** 登录态变更版本号（用于 keepalive 页面触发刷新） */
  authStateVersion?: number
}

export function ScriptSubscribePage({
  onOpenExternal,
  onRefreshBackendScripts,
  authStateVersion,
}: ScriptSubscribePageProps) {
  const [searchParams, setSearchParams] = useState<SearchParams>(defaultSearchParams)
  const [tableData, setTableData] = useState<ScriptListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [subscribingIds, setSubscribingIds] = useState<Set<number>>(new Set())
  const [detailScript, setDetailScript] = useState<ScriptListItem | null>(null)

  const fetchScripts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.searchScripts({
        page: searchParams.page,
        page_size: searchParams.page_size,
        subscribed: searchParams.subscribed,
        type: searchParams.type || undefined,
        target: searchParams.target || undefined,
        min_count: searchParams.min_count || undefined,
        uploader_name: searchParams.uploader_name || undefined,
        order_by: searchParams.order_by,
      })
      setTableData(res.scripts ?? [])
      setTotal(res.pagination?.total_count ?? 0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "获取脚本列表失败"
      if (msg.includes("401") || msg.includes("登录")) {
        toast.error("请先登录")
      } else {
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }, [
    searchParams.page,
    searchParams.page_size,
    searchParams.subscribed,
    searchParams.type,
    searchParams.target,
    searchParams.min_count,
    searchParams.uploader_name,
    searchParams.order_by,
  ])

  useEffect(() => {
    fetchScripts()
  }, [fetchScripts])

  useEffect(() => {
    if (!authStateVersion) return
    fetchScripts()
  }, [authStateVersion, fetchScripts])

  const handlePageChange = (page: number) => {
    setSearchParams((p) => ({ ...p, page }))
  }

  const toggleSubscribe = async (row: ScriptListItem) => {
    if (subscribingIds.has(row.id)) return
    setSubscribingIds((s) => new Set(s).add(row.id))
    try {
      const res = await apiClient.subscribeScript({
        script_id: row.id,
        subscribe: !row.is_subscribed,
      })
      row.is_subscribed = res.is_subscribed
      setTableData((prev) => prev.slice())
      if (detailScript?.id === row.id) {
        setDetailScript({ ...detailScript, is_subscribed: res.is_subscribed })
      }
      // toast.success(res.message ?? (res.is_subscribed ? "订阅成功" : "取消订阅成功"))
      if (res.is_subscribed && res.md5) {
        try {
          await window.App.launcher.downloadScript({ name: row.name, md5: res.md5 })
          onRefreshBackendScripts?.()
        } catch {
          toast.error("脚本下载失败，可在设置中重新同步")
        }
      } else if (!res.is_subscribed && res.md5) {
        try {
          await window.App.launcher.deleteScript(res.md5)
          onRefreshBackendScripts?.()
        } catch {
          toast.error("删除本地脚本失败")
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      if (msg.includes("403") || msg.includes("自动更新")) {
        toast.error("请开通自动更新")
      } else if(msg.includes("401")){
        toast.error("请先登录")
      }else {
        toast.error("操作失败，请稍后重试")
      }
    } finally {
      setSubscribingIds((s) => {
        const next = new Set(s)
        next.delete(row.id)
        return next
      })
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-1 flex-col min-h-0 w-full max-w-full">
      <div className="flex flex-1 flex-col min-h-0 px-6 py-4">
        {/* 搜索区 */}
        <div className="shrink-0">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                <span className="w-16">类型</span>
                <Select
                  value={searchParams.type || "__all__"}
                  onValueChange={(v) =>
                    setSearchParams((p) => ({ ...p, type: v === "__all__" ? "" : v }))
                  }
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value || "__all__"} value={o.value || "__all__"}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                <span className="w-16">目标</span>
                <Input
                  value={searchParams.target}
                  onChange={(e) =>
                    setSearchParams((p) => ({ ...p, target: e.target.value }))
                  }
                  className="w-40"
                />
              </label>
              <label className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                <span className="w-16">最小数量</span>
                <Input
                  type="number"
                  min={0}
                  value={searchParams.min_count}
                  onChange={(e) =>
                    setSearchParams((p) => ({
                      ...p,
                      min_count: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-24"
                />
              </label>
              <label className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                <span className="w-16">作者</span>
                <Input
                  value={searchParams.uploader_name}
                  onChange={(e) =>
                    setSearchParams((p) => ({ ...p, uploader_name: e.target.value }))
                  }
                  className="w-40"
                />
              </label>
              <label className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                <span className="w-16">排序</span>
                <Select
                  value={searchParams.order_by}
                  onValueChange={(v) =>
                    setSearchParams((p) => ({ ...p, order_by: v }))
                  }
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="排序方式" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Checkbox
                  checked={searchParams.subscribed}
                  onCheckedChange={(checked) =>
                    setSearchParams((p) => ({ ...p, subscribed: checked === true }))
                  }
                />
                <span>只看我的订阅</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setSearchParams((p) => ({ ...p, page: 1 }))}
                className="bg-pink-400 hover:bg-pink-500"
              >
                搜索
              </Button>
              <Button
                variant="outline"
                onClick={() => setSearchParams(defaultSearchParams)}
              >
                重置
              </Button>
            </div>
          </div>
        </div>

        {/* 表格：占据剩余空间，超出时纵向滚动 */}
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="size-8 text-pink-400" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-20 max-w-52">脚本名称</TableHead>
                    <TableHead className="w-10">类型</TableHead>
                    <TableHead className="w-24">目标</TableHead>
                    <TableHead className="w-10">数量</TableHead>
                    <TableHead className="w-20 hidden xl:table-cell">作者</TableHead>
                    <TableHead className="w-10">订阅数</TableHead>
                    <TableHead className="min-w-20 max-w-52">描述</TableHead>
                    <TableHead className="w-10 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-slate-500">
                        暂无数据，请调整搜索条件或先登录
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableData.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="min-w-20 max-w-52 truncate">
                          {row.name}
                        </TableCell>
                        <TableCell className="w-10">{row.type ?? "-"}</TableCell>
                        <TableCell className="w-24 truncate">
                          {row.target ?? "-"}
                        </TableCell>
                        <TableCell className="w-10">{row.count ?? "-"}</TableCell>
                        <TableCell className="w-20 truncate hidden xl:table-cell">
                          {row.uploader_name ?? "-"}
                        </TableCell>
                        <TableCell className="w-10">
                          <SubscribeCountBadge value={row.subscribe_count} />
                        </TableCell>
                        <TableCell className="min-w-20 max-w-52 truncate text-slate-500">
                          {row.description || "暂无描述"}
                        </TableCell>
                        <TableCell className="w-10 text-center">
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setDetailScript(row)}
                            >
                              详情
                            </Button>
                            <Button
                              size="xs"
                              variant={row.is_subscribed ? "outline" : "default"}
                              className={
                                !row.is_subscribed
                                  ? "bg-pink-400 hover:bg-pink-500"
                                  : "text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                              }
                              disabled={subscribingIds.has(row.id)}
                              onClick={() => toggleSubscribe(row)}
                            >
                              {subscribingIds.has(row.id) ? (
                                <Spinner className="size-3" />
                              ) : row.is_subscribed ? (
                                "取消"
                              ) : (
                                "订阅"
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate-500">
              共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={searchParams.page <= 1}
                onClick={() => handlePageChange(searchParams.page - 1)}
              >
                上一页
              </Button>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {searchParams.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={searchParams.page >= totalPages}
                onClick={() => handlePageChange(searchParams.page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        )}

        {onOpenExternal && (
          <p className="shrink-0 pt-2 text-center text-sm text-slate-400">
            <button
              type="button"
              onClick={() => onOpenExternal("https://nikkigallery.vip/whimbox/scripts")}
              className="text-pink-400 hover:underline"
            >
              在浏览器中打开脚本仓库
            </button>
          </p>
        )}
      </div>

      {/* 详情弹窗 */}
      <Dialog open={!!detailScript} onOpenChange={(open) => !open && setDetailScript(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailScript?.name ?? "脚本详情"}</DialogTitle>
          </DialogHeader>
          {detailScript && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-slate-500">类型</span>
                <span>{detailScript.type ?? "-"}</span>
                <span className="text-slate-500">目标</span>
                <span>{detailScript.target ?? "-"}</span>
                <span className="text-slate-500">数量</span>
                <span>{detailScript.count ?? "-"}</span>
                <span className="text-slate-500">作者</span>
                <span>{detailScript.uploader_name ?? "-"}</span>
                <span className="text-slate-500">订阅数</span>
                <span>
                  <SubscribeCountBadge value={detailScript.subscribe_count} />
                </span>
                <span className="text-slate-500">更新时间</span>
                <span>{formatTime(detailScript.update_time)}</span>
              </div>
              <div>
                <span className="text-slate-500">描述</span>
                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-slate-100 p-2 dark:border-slate-700">
                  {detailScript.description || "暂无描述"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter showCloseButton={false}>
            <Button variant="outline" onClick={() => setDetailScript(null)}>
              关闭
            </Button>
            {detailScript && (
              <Button
                variant={detailScript.is_subscribed ? "destructive" : "default"}
                className={
                  !detailScript.is_subscribed ? "bg-pink-400 hover:bg-pink-500" : ""
                }
                disabled={subscribingIds.has(detailScript.id)}
                onClick={() => toggleSubscribe(detailScript)}
              >
                {subscribingIds.has(detailScript.id) ? (
                  <Spinner className="size-3" />
                ) : detailScript.is_subscribed ? (
                  "取消订阅"
                ) : (
                  "订阅"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
