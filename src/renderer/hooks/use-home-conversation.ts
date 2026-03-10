import { useCallback, useEffect, useRef, useState } from 'react'
import type { IpcRpcClient } from 'renderer/lib/ipc-rpc'
import log from 'electron-log/renderer'

export type AssistantBlock =
  | { type: 'text'; content: string }
  | { type: 'log'; content: string; title?: string }

export type UiAttachment = {
  type: 'image_file'
  path: string
  previewUrl?: string
  loading?: boolean
}

type RpcAttachment = {
  type: 'image_file'
  path: string
}

export type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: UiAttachment[]
  pending?: boolean
  title?: string
  /** 仅 assistant：按 event 到达顺序的块，有则按块渲染，无则只渲染 content */
  blocks?: AssistantBlock[]
}

export type ConversationSendPayload = {
  text?: string
  attachments?: UiAttachment[]
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

const formatAgentStatus = (phase: string, detail: string, rawDetail?: string) => {
  if (phase === 'started' && detail === 'thinking') return '思考中...'
  if (phase === 'running' && detail === 'generating') return '生成回复中...'
  if (phase === 'started' && rawDetail) return `执行工具中：${rawDetail}`
  if (phase === 'stopping') return '停止任务中，请稍等...'
  if (phase === 'completed') return ''
  if (phase === 'cancelled') return ''
  if (phase === 'error') return ''
  return ''
}

const toRpcAttachments = (attachments: UiAttachment[]): RpcAttachment[] =>
  attachments.map((item) => ({
    type: 'image_file',
    path: item.path,
  }))

export function useHomeConversation({
  rpcClient,
  sessionId,
  rpcState,
}: UseHomeConversationOptions) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<UiAttachment[]>([])
  const [isConversationPending, setIsConversationPending] = useState(false)
  const [isStandaloneTaskPending, setIsStandaloneTaskPending] = useState(false)
  const [currentStatus, setCurrentStatus] = useState('')
  /** 当前由用户发消息产生的 assistant 消息 id，agent 的文本与工具日志都挂在这一条消息下。 */
  const currentAgentMessageIdRef = useRef<string | null>(null)
  /** agent 每次工具调用(tool_call_id)对应的日志 block 下标 */
  const agentToolBlockIndexesRef = useRef<Record<string, number>>({})
  /** 当前正在运行的 agent 工具调用集合（用于决定是否缓存文本流） */
  const activeAgentToolCallIdsRef = useRef<Set<string>>(new Set())
  /** 工具运行期间缓存的文本流，等工具结束后再落到末尾 */
  const bufferedAgentTextRef = useRef('')
  /** 由 task.run 等独立任务创建的「任务日志」assistant 消息 id，用于 event.run.log */
  const pendingStandaloneTaskIdRef = useRef<string | null>(null)
  /** 当前运行中的独立任务 task_id（用于 task.stop） */
  const pendingStandaloneTaskServerIdRef = useRef<string | null>(null)
  /** 独立任务结束后短时间内，用于承接尾日志的消息 id */
  const closingStandaloneTaskMessageIdRef = useRef<string | null>(null)
  const closingStandaloneTaskUntilRef = useRef<number>(0)
  /** 后台任务（非 task.run）日志消息 id，用于 event.run.log(type=add/update/finalize_ai_message) */
  const backgroundLogMessageIdRef = useRef<string | null>(null)

  // 单一 notification 监听：event.agent.message + event.run.* 统一在此驱动 messages，主界面与 overlay 共用
  useEffect(() => {
    if (rpcState === 'open') return
    setIsConversationPending(false)
    setIsStandaloneTaskPending(false)
    setCurrentStatus('')
    setAttachments([])
    currentAgentMessageIdRef.current = null
    agentToolBlockIndexesRef.current = {}
    activeAgentToolCallIdsRef.current = new Set()
    bufferedAgentTextRef.current = ''
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
        const chunk =
          (params?.message as { message?: string } | undefined)?.message ?? ''
        if (!chunk) return
        if (activeAgentToolCallIdsRef.current.size > 0) {
          bufferedAgentTextRef.current += chunk
          return
        }
        let assistantId = currentAgentMessageIdRef.current
        if (!assistantId) {
          assistantId = createId()
          currentAgentMessageIdRef.current = assistantId
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId!,
              role: 'assistant',
              content: chunk,
              pending: true,
              blocks: [{ type: 'text', content: chunk }],
            },
          ])
          return
        }
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
          setCurrentStatus(formatAgentStatus(phase, detailText, detailText))
          const toolCallId =
            typeof params?.tool_call_id === 'string' && params.tool_call_id
              ? params.tool_call_id
              : ''
          if (phase === 'started' && toolCallId) {
            activeAgentToolCallIdsRef.current.add(toolCallId)
            const assistantId = currentAgentMessageIdRef.current ?? createId()
            currentAgentMessageIdRef.current = assistantId
            setMessages((prev) => {
              const index = prev.findIndex((m) => m.id === assistantId)
              if (index < 0) {
                agentToolBlockIndexesRef.current = {
                  ...agentToolBlockIndexesRef.current,
                  [toolCallId]: 0,
                }
                return [
                  ...prev,
                  {
                    id: assistantId,
                    role: 'assistant',
                    content: '',
                    pending: true,
                    blocks: [{ type: 'log', content: '', title: detailText || '工具' }],
                  },
                ]
              }
              const cur = prev[index]
              const blocks = [...(cur.blocks ?? []), { type: 'log', content: '', title: detailText || '工具' } as AssistantBlock]
              agentToolBlockIndexesRef.current = {
                ...agentToolBlockIndexesRef.current,
                [toolCallId]: blocks.length - 1,
              }
              const next = [...prev]
              next[index] = { ...cur, blocks, pending: true }
              return next
            })
          }
          if (phase === 'completed' || phase === 'cancelled') {
            if (toolCallId) {
              activeAgentToolCallIdsRef.current.delete(toolCallId)
            }
            if (activeAgentToolCallIdsRef.current.size === 0 && bufferedAgentTextRef.current) {
              const text = bufferedAgentTextRef.current
              bufferedAgentTextRef.current = ''
              const assistantId = currentAgentMessageIdRef.current ?? createId()
              currentAgentMessageIdRef.current = assistantId
              setMessages((prev) => {
                const index = prev.findIndex((m) => m.id === assistantId)
                if (index < 0) {
                  return [
                    ...prev,
                    {
                      id: assistantId,
                      role: 'assistant',
                      content: text,
                      pending: true,
                      blocks: [{ type: 'text', content: text }],
                    },
                  ]
                }
                const cur = prev[index]
                const next = [...prev]
                next[index] = {
                  ...cur,
                  content: `${cur.content}${text}`,
                  pending: true,
                  blocks: [...(cur.blocks ?? []), { type: 'text', content: text }],
                }
                return next
              })
            }
            if (phase === 'completed') setCurrentStatus('')
          }
          if (phase === 'error') {
            if (toolCallId) {
              activeAgentToolCallIdsRef.current.delete(toolCallId)
            }
            if (activeAgentToolCallIdsRef.current.size === 0 && bufferedAgentTextRef.current) {
              const text = bufferedAgentTextRef.current
              bufferedAgentTextRef.current = ''
              const assistantId = currentAgentMessageIdRef.current ?? createId()
              currentAgentMessageIdRef.current = assistantId
              setMessages((prev) => {
                const index = prev.findIndex((m) => m.id === assistantId)
                if (index < 0) {
                  return [
                    ...prev,
                    {
                      id: assistantId,
                      role: 'assistant',
                      content: text,
                      pending: true,
                      blocks: [{ type: 'text', content: text }],
                    },
                  ]
                }
                const cur = prev[index]
                const next = [...prev]
                next[index] = {
                  ...cur,
                  content: `${cur.content}${text}`,
                  pending: true,
                  blocks: [...(cur.blocks ?? []), { type: 'text', content: text }],
                }
                return next
              })
            }
            setCurrentStatus('执行失败')
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
        } else if (detail === 'completed' || detail === 'cancelled' || detail === 'error') {
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
        const toolCallId =
          typeof params?.tool_call_id === 'string' && params.tool_call_id
            ? params.tool_call_id
            : ''
        const hasClosingStandaloneTarget =
          closingStandaloneTaskMessageIdRef.current !== null
          && Date.now() <= closingStandaloneTaskUntilRef.current
        let id: string | null
        if (source === 'background') {
          id = backgroundLogMessageIdRef.current
        } else if (source === 'agent') {
          id = currentAgentMessageIdRef.current ?? backgroundLogMessageIdRef.current
        } else if (source === 'task') {
          id =
            pendingStandaloneTaskIdRef.current
            ?? currentAgentMessageIdRef.current
            ?? (hasClosingStandaloneTarget ? closingStandaloneTaskMessageIdRef.current : null)
            ?? backgroundLogMessageIdRef.current
        } else {
          id =
            pendingStandaloneTaskIdRef.current
            ?? currentAgentMessageIdRef.current
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
          const targetLogIndex =
            toolCallId
              ? agentToolBlockIndexesRef.current[toolCallId]
              : [...blocks]
                  .map((block, i) => ({ block, i }))
                  .reverse()
                  .find((item) => item.block.type === 'log')?.i
          let nextBlocks: AssistantBlock[]
          if (targetLogIndex == null) {
            nextBlocks = [...blocks, { type: 'log', content: logLine }]
          } else {
            const target = blocks[targetLogIndex]
            if (target.type !== 'log') return prev
            nextBlocks = blocks.slice()
            nextBlocks[targetLogIndex] = {
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

  const handlePickImage = useCallback(async () => {
    const path = await window.App.launcher.selectImageFile()
    if (!path) return
    setAttachments((prev) => {
      if (prev.some((item) => item.path === path)) return prev
      return [...prev, { type: 'image_file', path, loading: true }]
    })
    const previewUrl = await window.App.launcher.getImagePreview(path)
    setAttachments((prev) =>
      prev.map((item) =>
        item.path === path
          ? { ...item, previewUrl: previewUrl ?? undefined, loading: false }
          : item,
      ),
    )
  }, [])

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((item) => item.path !== path))
  }, [])

  const handleSend = useCallback(async (override?: string | ConversationSendPayload) => {
    const payload =
      typeof override === 'string'
        ? { text: override }
        : (override ?? {})
    const text = (payload.text != null ? payload.text : input).trim()
    const currentAttachments = payload.attachments ?? attachments
    if ((!text && currentAttachments.length === 0) || rpcState !== 'open' || !sessionId || isAnyPending) return
    if (override == null) {
      setInput('')
      setAttachments([])
    }
    setIsConversationPending(true)
    setCurrentStatus('思考中...')
    currentAgentMessageIdRef.current = null
    agentToolBlockIndexesRef.current = {}
    activeAgentToolCallIdsRef.current = new Set()
    bufferedAgentTextRef.current = ''
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: 'user',
        content: text,
        attachments: currentAttachments,
      },
    ])
    try {
      const result = await rpcClient.sendStreamingRequest<{ message?: string }>(
        'agent.send_message',
        {
          session_id: sessionId,
          message: text,
          attachments: toRpcAttachments(currentAttachments),
        },
        () => {},
      )
      if (bufferedAgentTextRef.current) {
        const textChunk = bufferedAgentTextRef.current
        bufferedAgentTextRef.current = ''
        const msgId = createId()
        currentAgentMessageIdRef.current = msgId
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            role: 'assistant',
            content: textChunk,
            pending: true,
            blocks: [{ type: 'text', content: textChunk }],
          },
        ])
      }
      const fallbackText =
        typeof result?.message === 'string' && result.message.trim()
          ? result.message.trim()
          : ''
      if (!currentAgentMessageIdRef.current && fallbackText) {
        const msgId = createId()
        currentAgentMessageIdRef.current = msgId
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            role: 'assistant',
            content: fallbackText,
            pending: true,
            blocks: [{ type: 'text', content: fallbackText }],
          },
        ])
      }
    } catch (error) {
      log.error('agent.send_message failed:', error)
      setCurrentStatus('发送失败')
      if (bufferedAgentTextRef.current) {
        const textChunk = bufferedAgentTextRef.current
        bufferedAgentTextRef.current = ''
        const msgId = createId()
        currentAgentMessageIdRef.current = msgId
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            role: 'assistant',
            content: textChunk,
            pending: false,
            blocks: [{ type: 'text', content: textChunk }],
          },
        ])
      } else {
        const msgId = createId()
        setMessages((prev) => [
          ...prev,
          { id: msgId, role: 'assistant', content: '发送失败，请稍后重试。', pending: false },
        ])
      }
    } finally {
      const textMessageId = currentAgentMessageIdRef.current
      if (textMessageId) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === textMessageId ? { ...message, pending: false } : message,
          ),
        )
      }
      activeAgentToolCallIdsRef.current = new Set()
      bufferedAgentTextRef.current = ''
      currentAgentMessageIdRef.current = null
      setIsConversationPending(false)
      setCurrentStatus((prev) => (prev === '发送失败' || prev === '已停止' || prev === '执行失败' ? prev : ''))
    }
  }, [attachments, input, isAnyPending, rpcState, sessionId, rpcClient])

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

  return {
    messages,
    input,
    setInput,
    attachments,
    handlePickImage,
    removeAttachment,
    handleSend,
    handleStop,
    isConversationPending: isAnyPending,
    currentStatus,
  }
}
