import { useCallback, useEffect, useMemo, useState } from "react"
import { Link2, MessageSquare, RefreshCw, Unplug } from "lucide-react"
import QRCode from "qrcode"
import { Button } from "renderer/components/ui/button"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { cn } from "renderer/lib/utils"
import { toast } from "sonner"
import type { SettingContent, SettingSection } from "./types"


type WeixinStatus = {
  login_state: string
  monitor_state: string
  account_id?: string | null
  last_error?: string | null
  qrcode_url?: string | null
}

export const section: SettingSection = {
  id: "weixin",
  label: "连接微信",
  icon: MessageSquare,
}

function isConnected(status: WeixinStatus | null) {
  return status?.monitor_state === "running"
}

function renderConnectionLabel(status: WeixinStatus | null) {
  if (status?.monitor_state === "running") return "已连接"
  if (status?.login_state === "scan_confirmed") return "已扫码，等待确认"
  if (status?.login_state === "pending_scan") return "等待扫码"
  if (status?.login_state === "expired") return "二维码已过期"
  if (status?.monitor_state === "error") return "连接异常"
  if (status?.login_state === "logged_in") return "已登录，连接中"
  return "未连接"
}

function renderHint(status: WeixinStatus | null) {
  if (status?.monitor_state === "running") {
    return "ok啦，你现在可以用微信给奇想盒发消息"
  }
  if (status?.login_state === "scan_confirmed") {
    return "请在手机微信中确认授权，确认后会自动连接。"
  }
  if (status?.login_state === "pending_scan") {
    return "使用手机微信扫码，确认后就可以用微信给奇想盒发消息"
  }
  if (status?.login_state === "expired") {
    return "二维码已过期，请重新扫码连接微信。"
  }
  return "扫码后会自动恢复连接，下次启动 App 也会尝试自动连上。"
}

function WeixinSettingsContent({ rpcClient }: { rpcClient: IpcRpcClient }) {
  const [status, setStatus] = useState<WeixinStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [polling, setPolling] = useState(false)
  const [qrImageUrl, setQrImageUrl] = useState("")
  const [lastToastError, setLastToastError] = useState("")

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpcClient.sendRequest<WeixinStatus>("weixin.status.get")
      setStatus(result)
    } finally {
      setLoading(false)
    }
  }, [rpcClient])

  const startLogin = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpcClient.sendRequest<WeixinStatus>("weixin.login.start")
      setStatus(result)
    } finally {
      setLoading(false)
    }
  }, [rpcClient])

  const disconnect = useCallback(async () => {
    setLoading(true)
    try {
      const result = await rpcClient.sendRequest<WeixinStatus>("weixin.disconnect")
      setStatus(result)
    } finally {
      setLoading(false)
    }
  }, [rpcClient])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (status == null) return
    const needsAutoQr =
      (status.login_state === "logged_out" || status.login_state === "expired")
      && !status.qrcode_url
      && !loading
      && !polling
    if (!needsAutoQr) return
    void startLogin()
  }, [loading, polling, startLogin, status])

  useEffect(() => {
    if (!status || (status.login_state !== "pending_scan" && status.login_state !== "scan_confirmed")) {
      return
    }
    setPolling(true)
    const timer = window.setInterval(async () => {
      try {
        const result = await rpcClient.sendRequest<WeixinStatus>("weixin.login.poll")
        setStatus(result)
      } catch {
        // next tick retries
      }
    }, 2000)
    return () => {
      setPolling(false)
      window.clearInterval(timer)
    }
  }, [rpcClient, status])

  useEffect(() => {
    let cancelled = false

    async function buildQrImage() {
      if (!status?.qrcode_url || isConnected(status)) {
        setQrImageUrl("")
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(status.qrcode_url, {
          width: 260,
          margin: 2,
        })
        if (!cancelled) {
          setQrImageUrl(dataUrl)
        }
      } catch {
        if (!cancelled) {
          setQrImageUrl("")
        }
      }
    }

    void buildQrImage()
    return () => {
      cancelled = true
    }
  }, [status])

  const connected = isConnected(status)
  const connectionLabel = useMemo(() => renderConnectionLabel(status), [status])
  const hint = useMemo(() => renderHint(status), [status])

  useEffect(() => {
    const error = (status?.last_error || "").trim()
    if (!error || error === lastToastError) return
    toast.error(error)
    setLastToastError(error)
  }, [lastToastError, status?.last_error])

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-stretch">
          <div className="flex-1 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                    connected
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      connected ? "bg-emerald-500" : "bg-slate-400",
                    )}
                  />
                  连接状态：{connectionLabel}
                </div>
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                  用微信控制奇想盒
                </h3>
                <p className="max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {hint}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {connected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={loading}
                    onClick={() => {
                      void disconnect()
                    }}
                  >
                    <Unplug className="mr-2 size-4" />
                    断开连接微信
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
                    disabled={loading || polling}
                    onClick={() => {
                      void startLogin()
                    }}
                  >
                    <Link2 className="mr-2 size-4" />
                    扫码连接微信
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  disabled={loading}
                  onClick={() => {
                    void refreshStatus()
                  }}
                >
                  <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:w-[320px]">
            <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
              {connected ? (
                <div className="space-y-3 text-center">
                  <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <MessageSquare className="size-8" />
                  </div>
                  <div className="text-base font-semibold text-slate-700 dark:text-slate-100">
                    微信已连接
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    当前无需扫码
                  </div>
                </div>
              ) : qrImageUrl ? (
                <img src={qrImageUrl} alt="微信登录二维码" className="h-[260px] w-[260px] rounded-2xl bg-white p-4" />
              ) : (
                <div className="text-center text-sm text-slate-500 dark:text-slate-400">
                  正在准备二维码...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const content: SettingContent = {
  title: "连接微信",
  description: "需要微信最低版本8.0.70，扫码后即可通过微信连接奇想盒",
  render: (props) => {
    if (!props.rpcClient) {
      return (
        <div className="text-sm text-slate-500 dark:text-slate-400">
          奇想盒后端异常，暂时无法连接微信。
        </div>
      )
    }
    return <WeixinSettingsContent rpcClient={props.rpcClient} />
  },
}
