import { useEffect, useRef } from "react"

type UiMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  pending?: boolean
}

type RpcEventLog = {
  id: string
  method: string
  detail: string
}

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
          return (
            <div
              key={message.id}
              className={`mr-2 flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              {isUser ? (
                <div className="max-w-[75%] rounded-2xl bg-slate-100 px-4 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <div className="whitespace-pre-wrap">
                    {message.content || (message.pending ? "处理中..." : "")}
                  </div>
                </div>
              ) : (
                <div className="w-full text-slate-700 dark:text-slate-200">
                  <div className="whitespace-pre-wrap">
                    {message.content || (message.pending ? "处理中..." : "")}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
