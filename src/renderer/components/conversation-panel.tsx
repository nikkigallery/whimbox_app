import { useEffect, useRef } from "react"
import type { UiMessage } from "renderer/hooks/use-home-conversation"
import { cn } from "renderer/lib/utils"

type ConversationPanelProps = {
  messages: UiMessage[]
  variant?: "default" | "overlay"
}

export function ConversationPanel({
  messages,
  variant = "default",
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isOverlay = variant === "overlay"

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto select-text">
      {messages.length === 0 ? (
        <div
          className={cn(
            "rounded-xl border border-dashed px-4 py-6 text-center text-sm",
            isOverlay
              ? "border-white/20 text-[13px] text-white/60"
              : "border-slate-200 text-slate-400 dark:border-slate-700",
          )}
        >
          暂无对话内容
        </div>
      ) : (
        messages.map((message) => {
          const isUser = message.role === "user"
          const isSystem = message.role === "system"
          return (
            <div
              key={message.id}
              className={`mr-2 flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              {isSystem ? (
                <div
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 shadow-sm",
                    isOverlay
                      ? "border-white/15 bg-slate-700/35 text-[13px] text-white/90 leading-5"
                      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      isOverlay ? "text-[11px] text-white/60" : "text-slate-400 dark:text-slate-500",
                    )}
                  >
                    {message.title || "工具运行日志"}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm">
                    {message.content || (message.pending ? "处理中..." : "")}
                  </div>
                </div>
              ) : isUser ? (
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2",
                    isOverlay
                      ? "border border-white/15 bg-slate-700/45 text-[13px] text-white/95 leading-5"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                  )}
                >
                  <div className="whitespace-pre-wrap">
                    {message.content || (message.pending ? "处理中..." : "")}
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "w-full space-y-3",
                    isOverlay ? "text-[13px] text-white/90 leading-5" : "text-slate-700 dark:text-slate-200",
                  )}
                >
                  {message.blocks && message.blocks.length > 0 ? (
                    message.blocks.map((block, i) =>
                      block.type === "text" ? (
                        <div key={i} className="whitespace-pre-wrap">
                          {block.content || (message.pending && i === message.blocks!.length - 1 ? "处理中..." : "")}
                        </div>
                      ) : (
                        <div
                          key={i}
                          className={cn(
                            "rounded-2xl border px-4 py-3 shadow-sm",
                            isOverlay
                              ? "border-white/15 bg-slate-700/35 text-[13px] text-white/90 leading-5"
                              : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
                          )}
                        >
                          <div
                            className={cn(
                              "text-xs font-semibold uppercase tracking-wide",
                              isOverlay ? "text-[11px] text-white/60" : "text-slate-400 dark:text-slate-500",
                            )}
                          >
                            {block.title ? `工具 · ${block.title}` : "工具运行日志"}
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm">
                            {block.content || (message.pending ? "处理中..." : "")}
                          </div>
                        </div>
                      )
                    )
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {message.content || (message.pending ? "处理中..." : "")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
