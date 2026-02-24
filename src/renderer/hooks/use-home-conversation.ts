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
const STANDALONE_TASK_LOG_TAIL_WINDOW_MS = 5000
const AGENT_LOG_TAIL_WINDOW_MS = 5000

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
  const [isConversationPending, setIsConversationPending] = useState(false)
  const [isStandaloneTaskPending, setIsStandaloneTaskPending] = useState(false)
  /** 当前由用户发消息产生的 assistant 消息 id，用于 event.agent.message / event.run.*（agent 调工具） */
  const currentAgentMessageIdRef = useRef<string | null>(null)
  /** agent 结束后短时间内，用于承接尾日志的消息 id */
  const closingAgentMessageIdRef = useRef<string | null>(null)
  const closingAgentUntilRef = useRef<number>(0)
  /** 由 task.run 等独立任务创建的「任务日志」assistant 消息 id，用于 event.run.log */
  const pendingStandaloneTaskIdRef = useRef<string | null>(null)
  /** 当前运行中的独立任务 task_id（用于 task.stop） */
  const pendingStandaloneTaskServerIdRef = useRef<string | null>(null)
  /** 独立任务结束后短时间内，用于承接尾日志的消息 id */
  const closingStandaloneTaskMessageIdRef = useRef<string | null>(null)
  const closingStandaloneTaskUntilRef = useRef<number>(0)
  /** 后台任务（非 task.run）日志消息 id，用于 event.run.log(type=add/update/finalize_ai_message) */
  const backgroundLogMessageIdRef = useRef<string | null>(null)

  // 单一 notification 监听：所有 event.agent.* / event.task.* 统一在此驱动 messages，主界面与 overlay 共用
  useEffect(() => {
    if (rpcState === 'open') return
    setIsConversationPending(false)
    setIsStandaloneTaskPending(false)
    currentAgentMessageIdRef.current = null
    closingAgentMessageIdRef.current = null
    closingAgentUntilRef.current = 0
    pendingStandaloneTaskIdRef.current = null
    pendingStandaloneTaskServerIdRef.current = null
    closingStandaloneTaskMessageIdRef.current = null
    closingStandaloneTaskUntilRef.current = 0
  }, [rpcState])

  useEffect(() => {
    const off = rpcClient.on('notification', (notification) => {
      const method = notification.method
      const isAgentMessage = method === 'event.agent.message'
      const isRunEvent = method === 'event.run.status' || method === 'event.run.log'
      if (!isAgentMessage && !isRunEvent) return

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

      if (method === 'event.run.status') {
        const source = typeof params?.source === 'string' ? params.source : ''
        const detailText =
          typeof params?.detail === 'string' && params.detail
            ? params.detail
            : ''
        const phase = typeof params?.phase === 'string' ? params.phase : ''

        if (source === 'agent') {
          const assistantId = currentAgentMessageIdRef.current
          if (phase === 'started' && assistantId) {
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
          if ((phase === 'completed' || phase === 'cancelled') && assistantId) {
            closingAgentMessageIdRef.current = assistantId
            closingAgentUntilRef.current = Date.now() + AGENT_LOG_TAIL_WINDOW_MS
            currentAgentMessageIdRef.current = null
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, pending: false } : m,
              ),
            )
          }
          if (phase === 'error' && assistantId) {
            closingAgentMessageIdRef.current = assistantId
            closingAgentUntilRef.current = Date.now() + AGENT_LOG_TAIL_WINDOW_MS
            currentAgentMessageIdRef.current = null
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, pending: false } : m,
              ),
            )
          }
          return
        }

        if (source !== 'task') return
        const detail = phase
        if (detail === 'started') {
          const taskMessageId = createId()
          const taskId = typeof params?.task_id === 'string' ? params.task_id : null
          const toolId = typeof params?.tool_id === 'string' ? params.tool_id : ''
          const title = toolId || '任务'
          pendingStandaloneTaskIdRef.current = taskMessageId
          pendingStandaloneTaskServerIdRef.current = taskId
          closingStandaloneTaskMessageIdRef.current = null
          closingStandaloneTaskUntilRef.current = 0
          setIsStandaloneTaskPending(true)
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
          setIsStandaloneTaskPending(false)
          pendingStandaloneTaskServerIdRef.current = null
          if (id) {
            closingStandaloneTaskMessageIdRef.current = id
            closingStandaloneTaskUntilRef.current = Date.now() + STANDALONE_TASK_LOG_TAIL_WINDOW_MS
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

      if (method === 'event.run.log') {
        const source = typeof params?.source === 'string' ? params.source : ''
        const hasClosingAgentTarget =
          closingAgentMessageIdRef.current !== null
          && Date.now() <= closingAgentUntilRef.current
        const hasClosingStandaloneTarget =
          closingStandaloneTaskMessageIdRef.current !== null
          && Date.now() <= closingStandaloneTaskUntilRef.current
        let id: string | null
        if (source === 'background') {
          id = backgroundLogMessageIdRef.current
        } else if (source === 'agent') {
          id =
            currentAgentMessageIdRef.current
            ?? (hasClosingAgentTarget ? closingAgentMessageIdRef.current : null)
            ?? backgroundLogMessageIdRef.current
        } else if (source === 'task') {
          id =
            pendingStandaloneTaskIdRef.current
            ?? currentAgentMessageIdRef.current
            ?? (hasClosingAgentTarget ? closingAgentMessageIdRef.current : null)
            ?? (hasClosingStandaloneTarget ? closingStandaloneTaskMessageIdRef.current : null)
            ?? backgroundLogMessageIdRef.current
        } else {
          id =
            pendingStandaloneTaskIdRef.current
            ?? currentAgentMessageIdRef.current
            ?? (hasClosingAgentTarget ? closingAgentMessageIdRef.current : null)
            ?? (hasClosingStandaloneTarget ? closingStandaloneTaskMessageIdRef.current : null)
            ?? backgroundLogMessageIdRef.current
        }
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
          const lastLogIndex = [...blocks]
            .map((block, i) => ({ block, i }))
            .reverse()
            .find((item) => item.block.type === 'log')?.i
          let nextBlocks: AssistantBlock[]
          if (lastLogIndex == null) {
            nextBlocks = [...blocks, { type: 'log', content: logLine }]
          } else {
            const target = blocks[lastLogIndex]
            if (target.type !== 'log') return prev
            nextBlocks = blocks.slice()
            nextBlocks[lastLogIndex] = {
              type: 'log',
              content: target.content ? `${target.content}\n${logLine}` : logLine,
              title: target.title,
            }
          }
          const next = [...prev]
          const isFinalize = logType === 'finalize_ai_message'
          next[index] = { ...cur, blocks: nextBlocks, pending: !isFinalize }
          if (id === closingStandaloneTaskMessageIdRef.current) {
            // 尾日志再次到达则刷新窗口，避免被并发 stop 路径切碎到“自动触发”日志。
            closingStandaloneTaskUntilRef.current = Date.now() + STANDALONE_TASK_LOG_TAIL_WINDOW_MS
          }
          if (id === closingAgentMessageIdRef.current) {
            closingAgentUntilRef.current = Date.now() + AGENT_LOG_TAIL_WINDOW_MS
          }
          if (isFinalize && backgroundLogMessageIdRef.current === id) {
            backgroundLogMessageIdRef.current = null
          }
          return next
        })
      }
    })
    return () => off()
  }, [rpcClient, sessionId])

  const isAnyPending = isConversationPending || isStandaloneTaskPending

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText != null && overrideText !== '' ? overrideText : input).trim()
    if (!text || rpcState !== 'open' || !sessionId || isAnyPending) return
    if (overrideText == null) setInput('')
    const assistantId = createId()
    setIsConversationPending(true)
    currentAgentMessageIdRef.current = assistantId
    closingAgentMessageIdRef.current = null
    closingAgentUntilRef.current = 0
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
    } catch (error) {
      log.error('agent.send_message failed:', error)
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
      setIsConversationPending(false)
    }
  }, [input, isAnyPending, rpcState, sessionId, rpcClient])

  const handleStop = useCallback(async () => {
    if (rpcState !== 'open' || !sessionId || !isAnyPending) return
    try {
      if (isConversationPending) {
        await rpcClient.sendRequest('agent.stop', { session_id: sessionId })
      } else if (isStandaloneTaskPending) {
        const taskId = pendingStandaloneTaskServerIdRef.current
        if (!taskId) return
        await rpcClient.sendRequest('task.stop', { task_id: taskId })
      }
    } catch (error) {
      log.warn('stop failed:', error)
    }
  }, [isAnyPending, isConversationPending, isStandaloneTaskPending, rpcClient, rpcState, sessionId])

  return { messages, input, setInput, handleSend, handleStop, isConversationPending: isAnyPending }
}
