import { useEffect, useRef } from "react"
import { useActivate } from "react-activation"
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

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useActivate(() => {
    // KeepAlive 恢复时先完成布局，再强制滚到最新内容
    const raf = window.requestAnimationFrame(() => {
      scrollToBottom()
    })
    return () => window.cancelAnimationFrame(raf)
  })

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
                  {message.attachments && message.attachments.length > 0 ? (
                    <div className="mb-2 space-y-2">
                      {message.attachments.map((attachment) => (
                        <LocalImagePreview
                          key={attachment.path}
                          path={attachment.path}
                          previewUrl={attachment.previewUrl}
                          loading={attachment.loading}
                        />
                      ))}
                    </div>
                  ) : null}
                  {message.content ? (
                    <div className="whitespace-pre-wrap">
                      {message.content}
                    </div>
                  ) : message.pending ? (
                    <div className="whitespace-pre-wrap">处理中...</div>
                  ) : null}
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

function LocalImagePreview({
  path,
  previewUrl,
  loading,
}: {
  path: string
  previewUrl?: string
  loading?: boolean
}) {
  const src = previewUrl || ""
  if (!src) {
    return (
      <div className="flex min-h-28 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-300">
        {loading ? "图片预览加载中..." : "图片附件不可预览"}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt="用户上传图片"
      className="max-h-64 w-full rounded-2xl object-cover"
      onError={(event) => {
        const target = event.currentTarget
        target.style.display = "none"
        const parent = target.parentElement
        if (parent && !parent.querySelector("[data-image-fallback='true']")) {
          const fallback = document.createElement("div")
          fallback.dataset.imageFallback = "true"
          fallback.className = "rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-300"
          fallback.textContent = "图片附件不可预览"
          parent.appendChild(fallback)
        }
      }}
    />
  )
}
