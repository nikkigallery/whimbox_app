import { useEffect, useRef } from "react"
import type { ComponentType } from "react"
import { useActivate } from "react-activation"

import { Bot, FileText, Gift, Send, Square, Target } from "lucide-react"

import { ConversationPanel } from "renderer/components/conversation-panel"
import type { UiMessage } from "renderer/hooks/use-home-conversation"
import { cn } from "renderer/lib/utils"

type QuickAction = {
  icon: ComponentType<{ className?: string }>
  title: string
}

type HomePageProps = {
  messages: UiMessage[]
  input: string
  setInput: (v: string) => void
  handleSend: (overrideText?: string) => void
  handleStop: () => void
  isConversationPending: boolean
  rpcState: string
  sessionId: string | null
}

export function HomePage({
  messages,
  input,
  setInput,
  handleSend,
  handleStop,
  isConversationPending,
  rpcState,
  sessionId,
}: HomePageProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const hasConversation = messages.length > 0
  const isSendDisabled = !input.trim() || rpcState !== "open" || !sessionId
  const isInputDisabled = isConversationPending || rpcState !== "open" || !sessionId

  useEffect(() => {
    if (!isConversationPending && rpcState === "open" && sessionId) {
      textareaRef.current?.focus()
    }
  }, [isConversationPending, rpcState, sessionId])

  useActivate(() => {
    const raf = window.requestAnimationFrame(() => {
      if (!isInputDisabled) {
        textareaRef.current?.focus()
      }
    })
    return () => window.cancelAnimationFrame(raf)
  })

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
              ref={textareaRef}
              rows={1}
              value={input}
              disabled={isInputDisabled}
              placeholder={
                rpcState === "open"
                  ? "请输入内容..."
                  : "奇想盒后端异常，无法发送消息"
              }
              onChange={(event) => {
                const target = event.currentTarget
                setInput(target.value)
                target.style.height = "auto"
                target.style.height = `${target.scrollHeight}px`
              }}
              onKeyDown={(event) => {
                if (isConversationPending) return
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  handleSend()
                }
              }}
              className="max-h-40 w-full resize-none bg-transparent text-sm text-slate-600 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onMouseDown={(event) => {
                // 避免点击按钮时把焦点从输入框抢走。
                event.preventDefault()
              }}
              onClick={isConversationPending ? handleStop : () => handleSend()}
              disabled={isConversationPending ? false : isSendDisabled}
              className={cn(
                "flex size-9 items-center justify-center rounded-xl text-white shadow transition disabled:cursor-not-allowed disabled:opacity-50",
                isConversationPending ? "bg-rose-500 hover:bg-rose-600" : "bg-pink-400"
              )}
            >
              {isConversationPending ? <Square className="size-4" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
