import { useCallback, useEffect, useRef, useState } from 'react'
import type { IpcRpcClient } from 'renderer/lib/ipc-rpc'
import log from 'electron-log/renderer'

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
  /** 当前由用户发消息产生的 assistant 消息 id，用于 event.agent.* / event.task.log（agent 调工具） */
  const currentAgentMessageIdRef = useRef<string | null>(null)
  /** 由 task.run 等独立任务创建的「任务日志」assistant 消息 id，用于 event.task.log */
  const pendingStandaloneTaskIdRef = useRef<string | null>(null)
  /** 后台任务（非 task.run）日志消息 id，用于 event.task.log(type=add/update/finalize_ai_message) */
  const backgroundLogMessageIdRef = useRef<string | null>(null)

  // 单一 notification 监听：所有 event.agent.* / event.task.* 统一在此驱动 messages，主界面与 overlay 共用
  useEffect(() => {
    const off = rpcClient.on('notification', (notification) => {
      const method = notification.method
      const isAgent =
        method === 'event.agent.message' || method === 'event.agent.status'
      const isTask =
        method === 'event.task.progress' || method === 'event.task.log'
      if (!isAgent && !isTask) return

      const params =
        notification.params && typeof notification.params === 'object'
          ? (notification.params as Record<string, unknown>)
          : undefined
      const targetSessionId =
        typeof params?.session_id === 'string' ? params.session_id : null
      if (targetSessionId && sessionId && targetSessionId !== sessionId) return

      if (method === 'event.agent.message') {
        const assistantId = currentAgentMessageIdRef.current
        if (!assistantId) return
        const chunk =
          (params?.message as { message?: string } | undefined)?.message ?? ''
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

      if (method === 'event.agent.status') {
        const assistantId = currentAgentMessageIdRef.current
        const status = typeof params?.status === 'string' ? params.status : ''
        const detailText =
          typeof params?.detail === 'string' && params.detail
            ? params.detail
            : ''
        if (status === 'on_tool_start' && assistantId) {
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
            next[index] = { ...cur, blocks: nextBlocks, pending: true }
            return next
          })
        }
        if (status === 'on_tool_stopping' && assistantId) {
          console.log("on_tool_stopping")
          setMessages((prev) => {
            const index = prev.findIndex((m) => m.id === assistantId)
            if (index < 0) return prev
            const cur = prev[index]
            const blocks = cur.blocks ?? []
            const stoppingText = '⏳ 工具结束中，请稍候...'
            const last = blocks[blocks.length - 1]
            let nextBlocks: AssistantBlock[]
            if (last?.type === 'log') {
              if (last.content.includes(stoppingText)) return prev
              nextBlocks = blocks.slice(0, -1).concat({
                type: 'log',
                title: last.title,
                content: last.content ? `${last.content}\n${stoppingText}` : stoppingText,
              })
            } else {
              nextBlocks = [...blocks, { type: 'log', title: detailText, content: stoppingText }]
            }
            const next = [...prev]
            next[index] = { ...cur, blocks: nextBlocks, pending: true }
            return next
          })
        }
        if (status === 'on_tool_error' && assistantId) {
          // 工具报错时通常会结束本轮响应，提前收口避免一直 pending。
          currentAgentMessageIdRef.current = null
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, pending: false } : m,
            ),
          )
        }
        return
      }

      if (method === 'event.task.progress') {
        const detail = typeof params?.detail === 'string' ? params.detail : ''
        if (detail === 'started') {
          const taskMessageId = createId()
          const toolId = typeof params?.tool_id === 'string' ? params.tool_id : ''
          const title = toolId || '任务'
          pendingStandaloneTaskIdRef.current = taskMessageId
          setMessages((prev) => [
            ...prev,
            {
              id: taskMessageId,
              role: 'assistant',
              content: '',
              pending: true,
              blocks: [{ type: 'log', content: '', title }],
            },
          ])
        } else if (detail === 'completed' || detail === 'cancelled') {
          const id = pendingStandaloneTaskIdRef.current
          if (id) {
            pendingStandaloneTaskIdRef.current = null
            setMessages((prev) =>
              prev.map((m) =>
                m.id === id ? { ...m, pending: false } : m,
              ),
            )
          }
        }
        return
      }

      if (method === 'event.task.log') {
        const id =
          pendingStandaloneTaskIdRef.current
          ?? currentAgentMessageIdRef.current
          ?? backgroundLogMessageIdRef.current
        const logLine =
          typeof params?.message === 'string'
            ? params.message
            : typeof params?.raw_message === 'string'
              ? params.raw_message
              : ''
        if (!logLine) return
        const logType = typeof params?.type === 'string' ? params.type : ''

        if (!id) {
          const messageId = createId()
          backgroundLogMessageIdRef.current = messageId
          const isFinalize = logType === 'finalize_ai_message'
          setMessages((prev) => [
            ...prev,
            {
              id: messageId,
              role: 'assistant',
              content: '',
              pending: !isFinalize,
              blocks: [{ type: 'log', content: logLine, title: '自动触发' }],
            },
          ])
          if (isFinalize) backgroundLogMessageIdRef.current = null
          return
        }

        setMessages((prev) => {
          const index = prev.findIndex((m) => m.id === id)
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
          const isFinalize = logType === 'finalize_ai_message'
          next[index] = { ...cur, blocks: nextBlocks, pending: !isFinalize }
          if (isFinalize && backgroundLogMessageIdRef.current === id) {
            backgroundLogMessageIdRef.current = null
          }
          return next
        })
      }
    })
    return () => off()
  }, [rpcClient, sessionId])

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText != null && overrideText !== '' ? overrideText : input).trim()
    if (!text || rpcState !== 'open' || !sessionId) return
    if (overrideText == null) setInput('')
    const assistantId = createId()
    currentAgentMessageIdRef.current = assistantId
    setMessages((prev) => [
      ...prev,
      { id: createId(), role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ])
    try {
      const result = await rpcClient.sendStreamingRequest<{ message?: string }>(
        'agent.send_message',
        { session_id: sessionId, message: text },
        () => {},
      )
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  typeof result?.message === 'string' && result.message.trim()
                    ? result.message
                    : message.content || '已收到回复。',
                blocks:
                  typeof result?.message === 'string' && result.message.trim()
                    ? (() => {
                        const existing = message.blocks ?? []
                        const last = existing[existing.length - 1]
                        if (last?.type === 'text') {
                          return existing
                            .slice(0, -1)
                            .concat({ type: 'text' as const, content: result.message! })
                        }
                        return [...existing, { type: 'text' as const, content: result.message! }]
                      })()
                    : message.blocks,
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
      if (currentAgentMessageIdRef.current === assistantId) {
        currentAgentMessageIdRef.current = null
      }
    }
  }, [input, rpcState, sessionId, rpcClient])

  return { messages, input, setInput, handleSend }
}
