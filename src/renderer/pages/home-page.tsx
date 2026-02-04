import type { ComponentType } from "react"

import { Gift, Send } from "lucide-react"

import { ConversationPanel } from "renderer/components/conversation-panel"

import { cn } from "renderer/lib/utils"

type UiMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  pending?: boolean
  title?: string
}

type RpcEventLog = {
  id: string
  method: string
  detail: string
}

type QuickAction = {
  icon: ComponentType<{ className?: string }>
  title: string
}

type HomePageProps = {
  quickActions: QuickAction[]
  messages: UiMessage[]
  input: string
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
  sessionId: string | null
  onInputChange: (value: string) => void
  onSend: () => void
}

export function HomePage({
  quickActions,
  messages,
  input,
  rpcState,
  sessionId,
  onInputChange,
  onSend,
}: HomePageProps) {
  const hasConversation = messages.length > 0
  const isSendDisabled = !input.trim() || rpcState !== "open" || !sessionId
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div
        className={cn(
          "flex flex-1 flex-col min-h-0 px-10",
          hasConversation ? "justify-start gap-6 py-8" : "items-center justify-center gap-6 py-8"
        )}
      >
        {!hasConversation ? (
          <>
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-20 items-center justify-center rounded-3xl bg-pink-100 text-pink-400 dark:bg-pink-500/20 dark:text-pink-300">
                <Gift className="size-10" />
              </div>
              <p className="text-sm text-slate-400 dark:text-slate-400">
                你好，我是奇想盒
              </p>
              <h1 className="text-xl font-semibold text-slate-700 dark:text-slate-100">
                今天需要我帮你做点什么吗？
              </h1>
            </div>

            <div className="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-3">
              {quickActions.map((action) => (
                <div
                  key={action.title}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-pink-50 text-pink-400 dark:bg-pink-500/15 dark:text-pink-300">
                    <action.icon className="size-5" />
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-300">
                    {action.title}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {hasConversation ? (
          <div className="flex w-full max-w-4xl flex-1 min-h-0 mx-auto">
            <ConversationPanel messages={messages} />
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 bg-white px-3 pt-3 pb-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-end gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex-1">
            <textarea
              rows={1}
              value={input}
              placeholder={
                rpcState === "open"
                  ? "请输入内容..."
                  : "RPC 未连接，暂无法发送"
              }
              onChange={(event) => {
                const target = event.currentTarget
                onInputChange(target.value)
                target.style.height = "auto"
                target.style.height = `${target.scrollHeight}px`
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  onSend()
                }
              }}
              className="max-h-40 w-full resize-none bg-transparent text-sm text-slate-600 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSend}
              disabled={isSendDisabled}
              className="flex size-9 items-center justify-center rounded-xl bg-pink-400 text-white shadow transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
