import { useCallback, useRef, useState } from 'react'
import type { IpcRpcClient } from 'renderer/lib/ipc-rpc'

export type AssistantBlock =
  | { type: 'text'; content: string }
  | { type: 'log'; content: string; title?: string }

export type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  pending?: boolean
  title?: string
  /** 仅 assistant：按 event 到达顺序的块，有则按块渲染，无则只渲染 content */
  blocks?: AssistantBlock[]
}

const createId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

export type UseHomeConversationOptions = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: string
}

export function useHomeConversation({
  rpcClient,
  sessionId,
  rpcState,
}: UseHomeConversationOptions) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const pendingAssistantIdRef = useRef<string | null>(null)

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || rpcState !== 'open' || !sessionId) return
    setInput('')
    const assistantId = createId()
    pendingAssistantIdRef.current = assistantId
    setMessages((prev) => [
      ...prev,
      { id: createId(), role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ])
    try {
      const result = await rpcClient.sendStreamingRequest<{ message?: string }>(
        'agent.send_message',
        { session_id: sessionId, message: text },
        (notification) => {
          const params =
            notification.params && typeof notification.params === 'object'
              ? (notification.params as Record<string, unknown>)
              : undefined

          if (notification.method === 'event.agent.message') {
            const chunk =
              (params?.message as { message?: string } | undefined)?.message ??
              ''
            if (!chunk) return
            setMessages((prev) => {
              const index = prev.findIndex((m) => m.id === assistantId)
              if (index < 0) return prev
              const cur = prev[index]
              const blocks = cur.blocks ?? []
              const last = blocks[blocks.length - 1]
              let nextBlocks: AssistantBlock[]
              if (last?.type === 'text') {
                nextBlocks = blocks.slice(0, -1).concat({
                  type: 'text',
                  content: last.content + chunk,
                })
              } else {
                nextBlocks = [...blocks, { type: 'text', content: chunk }]
              }
              const next = [...prev]
              next[index] = {
                ...cur,
                content: cur.content + chunk,
                blocks: nextBlocks,
                pending: true,
              }
              return next
            })
            return
          }

          if (notification.method === 'event.agent.status') {
            const status = typeof params?.status === 'string' ? params.status : ''
            const detailText =
              typeof params?.detail === 'string' && params.detail
                ? params.detail
                : ''
            if (status === 'on_tool_start') {
              if (pendingAssistantIdRef.current) {
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === pendingAssistantIdRef.current
                      ? { ...message, pending: false }
                      : message,
                  ),
                )
                pendingAssistantIdRef.current = null
              }
              setMessages((prev) => {
                const index = prev.findIndex((m) => m.id === assistantId)
                if (index < 0) return prev
                const cur = prev[index]
                const blocks = cur.blocks ?? []
                const nextBlocks: AssistantBlock[] = [
                  ...blocks,
                  { type: 'log', content: '', title: detailText },
                ]
                const next = [...prev]
                next[index] = {
                  ...cur,
                  blocks: nextBlocks,
                  pending: true,
                }
                return next
              })
            }
            if (status === 'on_tool_end' || status === 'on_tool_error') {
              if (pendingAssistantIdRef.current) {
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === pendingAssistantIdRef.current
                      ? { ...message, pending: false }
                      : message,
                  ),
                )
                pendingAssistantIdRef.current = null
              }
            }
            return
          }

          if (notification.method === 'event.task.log') {
            const targetSessionId =
              typeof params?.session_id === 'string' ? params.session_id : null
            if (targetSessionId && sessionId && targetSessionId !== sessionId) {
              return
            }
            const logLine =
              typeof params?.message === 'string'
                ? params.message
                : typeof params?.raw_message === 'string'
                  ? params.raw_message
                  : ''
            if (!logLine) return
            setMessages((prev) => {
              const index = prev.findIndex((m) => m.id === assistantId)
              if (index < 0) return prev
              const cur = prev[index]
              const blocks = cur.blocks ?? []
              const last = blocks[blocks.length - 1]
              if (last?.type !== 'log') return prev
              const nextBlocks = blocks.slice(0, -1).concat({
                type: 'log',
                content: last.content ? `${last.content}\n${logLine}` : logLine,
                title: last.title,
              })
              const next = [...prev]
              next[index] = { ...cur, blocks: nextBlocks, pending: true }
              return next
            })
          }
        },
      )
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: message.content || result?.message || '已收到回复。',
                pending: false,
              }
            : message,
        ),
      )
    } catch {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: message.content || '发送失败，请稍后重试。',
                pending: false,
              }
            : message,
        ),
      )
    } finally {
      if (pendingAssistantIdRef.current === assistantId) {
        pendingAssistantIdRef.current = null
      }
    }
  }, [input, rpcState, sessionId, rpcClient])

  return { messages, input, setInput, handleSend }
}
