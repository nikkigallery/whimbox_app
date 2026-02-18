import { useEffect, useRef } from "react"
import type { UiMessage } from "renderer/hooks/use-home-conversation"

type ConversationPanelProps = {
  messages: UiMessage[]
}

export function ConversationPanel({ messages }: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto">
      {messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
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
                <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {message.title || "工具运行日志"}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm">
                    {message.content || (message.pending ? "处理中..." : "")}
                  </div>
                </div>
              ) : isUser ? (
                <div className="max-w-[75%] rounded-2xl bg-slate-100 px-4 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <div className="whitespace-pre-wrap">
                    {message.content || (message.pending ? "处理中..." : "")}
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-3 text-slate-700 dark:text-slate-200">
                  {message.blocks && message.blocks.length > 0 ? (
                    message.blocks.map((block, i) =>
                      block.type === "text" ? (
                        <div key={i} className="whitespace-pre-wrap">
                          {block.content || (message.pending && i === message.blocks!.length - 1 ? "处理中..." : "")}
                        </div>
                      ) : (
                        <div
                          key={i}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
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
