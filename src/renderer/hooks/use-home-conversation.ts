import { useCallback, useEffect, useRef, useState } from 'react'
import type { IpcRpcClient } from 'renderer/lib/ipc-rpc'

export type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  pending?: boolean
  title?: string
}

const createId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

export type UseHomeConversationOptions = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: string
  addEventLog?: (method: string, detail?: string) => void
  formatError?: (error: unknown) => string
}

export function useHomeConversation({
  rpcClient,
  sessionId,
  rpcState,
  addEventLog = () => {},
  formatError = (e) => String(e),
}: UseHomeConversationOptions) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const pendingAssistantIdRef = useRef<string | null>(null)
  const activeLogGroupIdRef = useRef<string | null>(null)
  const activeLogTitleRef = useRef<string | null>(null)

  useEffect(() => {
    const offNotification = rpcClient.on('notification', (notification) => {
      const params =
        notification.params && typeof notification.params === 'object'
          ? (notification.params as Record<string, unknown>)
          : undefined
      const detailValue =
        notification.method === 'event.agent.message'
          ? (params?.message as { message?: unknown } | undefined)?.message
          : params?.detail ?? params?.status ?? params?.message
      const detail =
        typeof detailValue === 'string'
          ? detailValue
          : detailValue
            ? JSON.stringify(detailValue).slice(0, 120)
            : ''

      addEventLog(notification.method, detail)

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
          activeLogGroupIdRef.current = createId()
          activeLogTitleRef.current = detailText
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
          activeLogGroupIdRef.current = null
          activeLogTitleRef.current = null
        }
      }

      if (notification.method === 'event.task.progress') {
        const detailText =
          typeof params?.detail === 'string' ? params.detail : ''
        const toolId = typeof params?.tool_id === 'string' ? params.tool_id : ''
        if (detailText === 'started') {
          if (!activeLogGroupIdRef.current) {
            activeLogGroupIdRef.current = createId()
            activeLogTitleRef.current = toolId || null
          }
        } else if (
          detailText === 'completed' ||
          detailText === 'cancelled'
        ) {
          activeLogGroupIdRef.current = null
          activeLogTitleRef.current = null
        }
      }

      if (notification.method === 'event.agent.message') {
        const chunk = typeof detailValue === 'string' ? detailValue : ''
        if (!chunk) return
        setMessages((prev) => {
          const targetId = pendingAssistantIdRef.current
          if (!targetId) {
            const newId = createId()
            pendingAssistantIdRef.current = newId
            return [
              ...prev,
              { id: newId, role: 'assistant', content: chunk, pending: true },
            ]
          }
          const index = prev.findIndex((message) => message.id === targetId)
          if (index < 0) {
            return [
              ...prev,
              { id: targetId, role: 'assistant', content: chunk, pending: true },
            ]
          }
          const next = [...prev]
          const current = next[index]
          next[index] = {
            ...current,
            content: `${current.content}${chunk}`,
            pending: true,
          }
          return next
        })
      }

      if (notification.method === 'event.task.log') {
        const targetSessionId =
          typeof params?.session_id === 'string' ? params.session_id : null
        if (targetSessionId && sessionId && targetSessionId !== sessionId) {
          return
        }
        const message =
          typeof params?.message === 'string'
            ? params.message
            : typeof params?.raw_message === 'string'
              ? params.raw_message
              : ''
        if (!message) return
        setMessages((prev) => {
          const activeId = activeLogGroupIdRef.current
          if (!activeId) {
            return [
              ...prev,
              { id: createId(), role: 'system', content: message },
            ]
          }
          const index = prev.findIndex((item) => item.id === activeId)
          const title = activeLogTitleRef.current
            ? `工具运行日志 · ${activeLogTitleRef.current}`
            : '工具运行日志'
          if (index < 0) {
            return [
              ...prev,
              {
                id: activeId,
                role: 'system',
                title,
                content: message,
              },
            ]
          }
          const next = [...prev]
          const current = next[index]
          next[index] = {
            ...current,
            title: current.title ?? title,
            content: current.content
              ? `${current.content}\n${message}`
              : message,
          }
          return next
        })
      }
    })
    return () => offNotification()
  }, [rpcClient, addEventLog, sessionId])

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
      const result = await rpcClient.sendRequest<{ message?: string }>(
        'agent.send_message',
        {
          session_id: sessionId,
          message: text,
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
    } catch (error) {
      addEventLog('agent.send_message.error', formatError(error))
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
  }, [input, rpcState, sessionId, rpcClient, addEventLog, formatError])

  return { messages, input, setInput, handleSend }
}
