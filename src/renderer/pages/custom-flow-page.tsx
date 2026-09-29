import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { toast } from 'sonner'

import { ScrollCenterLayout } from 'renderer/components/scroll-center-layout'
import { SettingsPageLayout } from 'renderer/components/settings-page-layout'
import { Button } from 'renderer/components/ui/button'
import { Checkbox } from 'renderer/components/ui/checkbox'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from 'renderer/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'renderer/components/ui/dialog'
import { Input } from 'renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'renderer/components/ui/select'
import { Spinner } from 'renderer/components/ui/spinner'
import type { IpcRpcClient } from 'renderer/lib/ipc-rpc'
import { cn } from 'renderer/lib/utils'

type FlowStepType = 'path' | 'macro'

type FlowStep = {
  id: string
  enabled: boolean
  type: FlowStepType
  script_name: string
}

type CustomFlow = {
  id: string
  name: string
  items: FlowStep[]
}

type CustomFlowResponse = {
  flows?: unknown[]
  active_flow_id?: unknown
}

type CustomFlowPageProps = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
  backendReloadVersion?: number
}

type SortableFlowStepProps = {
  step: FlowStep
  pathScripts: string[]
  macroScripts: string[]
  onToggle: (enabled: boolean) => void
  onChangeType: (type: FlowStepType) => void
  onLocalScriptNameChange: (scriptName: string) => void
  onCommitScriptName: (scriptName: string) => void
  onRemove: () => void
}

const TYPE_LABELS: Record<FlowStepType, string> = {
  path: '执行跑图脚本',
  macro: '执行宏脚本',
}

const createId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ??
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`

const createStepId = () => createId('step')
const createFlowId = () => createId('flow')

const normalizeScripts = (payload: unknown): string[] => {
  if (!payload) return []
  const list = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' &&
        payload !== null &&
        Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : []

  return list.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const info =
      record.info && typeof record.info === 'object'
        ? (record.info as Record<string, unknown>)
        : record
    return typeof info.name === 'string' && info.name ? [info.name] : []
  })
}

const normalizeSteps = (payload: unknown): FlowStep[] => {
  if (!Array.isArray(payload)) return []
  return payload.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string') return []
    if (record.type !== 'path' && record.type !== 'macro') return []
    return [
      {
        id: record.id,
        enabled: Boolean(record.enabled),
        type: record.type,
        script_name:
          typeof record.script_name === 'string' ? record.script_name : '',
      },
    ]
  })
}

const normalizeFlowState = (payload: CustomFlowResponse | undefined) => {
  const rawFlows = Array.isArray(payload?.flows) ? payload.flows : []
  const flows = rawFlows.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!id || !name) return []
    return [{ id, name, items: normalizeSteps(record.items) }]
  })
  const requestedActiveFlowId =
    typeof payload?.active_flow_id === 'string' ? payload.active_flow_id : ''
  const activeFlowId = flows.some(flow => flow.id === requestedActiveFlowId)
    ? requestedActiveFlowId
    : (flows[0]?.id ?? '')
  return { flows, activeFlowId }
}

const transformToStyle = (
  transform: {
    x: number
    y: number
    scaleX: number
    scaleY: number
  } | null
) => {
  if (!transform) return undefined
  return `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
}

function SortableFlowStep({
  step,
  pathScripts,
  macroScripts,
  onToggle,
  onChangeType,
  onLocalScriptNameChange,
  onCommitScriptName,
  onRemove,
}: SortableFlowStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })
  const style: CSSProperties = {
    transform: transformToStyle(transform),
    transition,
  }
  const scriptOptions = step.type === 'path' ? pathScripts : macroScripts

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40',
        isDragging &&
          'border-pink-300 shadow-lg ring-2 ring-pink-200/70 dark:border-pink-700 dark:ring-pink-900/60'
      )}
      ref={setNodeRef}
      style={style}
    >
      <Button
        aria-label="拖拽排序"
        className="cursor-grab rounded-xl text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:text-slate-500 dark:hover:text-slate-200"
        size="icon-sm"
        type="button"
        variant="ghost"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </Button>

      <Select
        onValueChange={value => onChangeType(value as FlowStepType)}
        value={step.type}
      >
        <SelectTrigger className="w-[10rem] rounded-xl">
          <SelectValue placeholder="选择步骤类型" />
        </SelectTrigger>
        <SelectContent>
          {(['path', 'macro'] as FlowStepType[]).map(type => (
            <SelectItem key={type} value={type}>
              {TYPE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="min-w-[16rem] flex-1">
        <Combobox
          inputValue={step.script_name}
          items={scriptOptions}
          onInputValueChange={onLocalScriptNameChange}
          onValueChange={nextValue =>
            onCommitScriptName(nextValue ? String(nextValue) : '')
          }
          value={
            scriptOptions.includes(step.script_name) ? step.script_name : null
          }
        >
          <ComboboxInput
            className="w-full"
            onBlur={event => onCommitScriptName(event.target.value)}
            placeholder={
              step.type === 'path' ? '请选择跑图脚本' : '请选择宏脚本'
            }
          />
          <ComboboxContent>
            <ComboboxList>
              {(option, optionIndex) => (
                <ComboboxItem
                  key={`${String(option)}-${optionIndex}`}
                  value={option}
                >
                  {String(option)}
                </ComboboxItem>
              )}
            </ComboboxList>
            <ComboboxEmpty>没有匹配项</ComboboxEmpty>
          </ComboboxContent>
        </Combobox>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Checkbox
          aria-label="启用步骤"
          checked={step.enabled}
          className="data-[state=checked]:border-pink-400 data-[state=checked]:bg-pink-400 data-[state=checked]:text-white"
          onCheckedChange={checked => onToggle(Boolean(checked))}
        />
        <span>启用</span>
      </div>

      <Button
        className="rounded-xl text-red-500 hover:text-red-600"
        onClick={onRemove}
        type="button"
        variant="outline"
      >
        删除
      </Button>
    </div>
  )
}

export function CustomFlowPage({
  rpcClient,
  sessionId,
  rpcState,
  backendReloadVersion,
}: CustomFlowPageProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [flows, setFlows] = useState<CustomFlow[]>([])
  const [activeFlowId, setActiveFlowId] = useState('')
  const [pathScripts, setPathScripts] = useState<string[]>([])
  const [macroScripts, setMacroScripts] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const [nameDialogMode, setNameDialogMode] = useState<
    'create' | 'rename' | null
  >(null)
  const [flowNameDraft, setFlowNameDraft] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const saveVersionRef = useRef(0)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )
  const activeFlow = flows.find(flow => flow.id === activeFlowId) ?? null
  const items = activeFlow?.items ?? []
  const itemIds = useMemo(() => items.map(item => item.id), [items])
  const hasRunnableItems = items.some(
    item => item.enabled && item.script_name.trim().length > 0
  )

  const refreshScriptOptions = async () => {
    try {
      const [pathResult, macroResult] = await Promise.all([
        rpcClient.sendRequest<unknown>('script.query_path', {
          show_default: true,
        }),
        rpcClient.sendRequest<unknown>('script.query_macro', {
          show_default: true,
        }),
      ])
      setPathScripts(normalizeScripts(pathResult))
      setMacroScripts(normalizeScripts(macroResult))
    } catch {
      // 保留现有选项，避免短暂断线清空用户正在编辑的内容。
    }
  }

  const refreshScriptOptionsRef = useRef(refreshScriptOptions)
  refreshScriptOptionsRef.current = refreshScriptOptions

  const loadFlow = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [flowResult] = await Promise.all([
        rpcClient.sendRequest<CustomFlowResponse>('custom_flow.get', {}),
        refreshScriptOptions(),
      ])
      const state = normalizeFlowState(flowResult)
      setFlows(state.flows)
      setActiveFlowId(state.activeFlowId)
    } catch {
      setLoadError('奇想盒后端异常，读取自定义流程失败。')
      setFlows([])
      setActiveFlowId('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFlow()
  }, [rpcClient, backendReloadVersion])

  useEffect(() => {
    const offNotification = rpcClient.on('notification', notification => {
      if (notification.method !== 'event.scripts.changed') return
      void refreshScriptOptionsRef.current()
    })
    return () => offNotification()
  }, [rpcClient])

  useEffect(() => {
    const offNotification = rpcClient.on('notification', notification => {
      if (notification.method !== 'event.run.status') return
      const params =
        notification.params && typeof notification.params === 'object'
          ? (notification.params as Record<string, unknown>)
          : undefined
      if (params?.source !== 'task') return
      const toolId = typeof params.tool_id === 'string' ? params.tool_id : ''
      if (toolId && toolId !== 'nikki.custom_flow') return
      const phase = typeof params.phase === 'string' ? params.phase : ''
      if (phase === 'started') {
        const taskId =
          typeof params.task_id === 'string' ? params.task_id : null
        if (taskId) setRunningTaskId(taskId)
        setIsStopping(false)
        setIsRunning(true)
      } else if (phase === 'stopping') {
        setIsStopping(true)
      } else if (
        phase === 'completed' ||
        phase === 'cancelled' ||
        phase === 'error'
      ) {
        setRunningTaskId(null)
        setIsStopping(false)
        setIsRunning(false)
      }
    })
    return () => offNotification()
  }, [rpcClient])

  const persistFlowState = async (
    nextFlows: CustomFlow[],
    nextActiveFlowId: string
  ) => {
    const saveVersion = saveVersionRef.current + 1
    saveVersionRef.current = saveVersion
    setFlows(nextFlows)
    setActiveFlowId(nextActiveFlowId)
    setSaving(true)
    try {
      const result = await rpcClient.sendRequest<CustomFlowResponse>(
        'custom_flow.update',
        { flows: nextFlows, active_flow_id: nextActiveFlowId }
      )
      if (saveVersion !== saveVersionRef.current) return
      const state = normalizeFlowState(result)
      setFlows(state.flows)
      setActiveFlowId(state.activeFlowId)
    } catch {
      if (saveVersion !== saveVersionRef.current) return
      toast.error('保存失败，请稍后重试')
      void loadFlow()
    } finally {
      if (saveVersion === saveVersionRef.current) setSaving(false)
    }
  }

  const replaceActiveItems = (nextItems: FlowStep[]) =>
    flows.map(flow =>
      flow.id === activeFlowId ? { ...flow, items: nextItems } : flow
    )

  const persistItems = (nextItems: FlowStep[]) =>
    persistFlowState(replaceActiveItems(nextItems), activeFlowId)

  const updateItemLocal = (
    id: string,
    updater: (item: FlowStep) => FlowStep
  ) => {
    setFlows(previous =>
      previous.map(flow =>
        flow.id === activeFlowId
          ? {
              ...flow,
              items: flow.items.map(item =>
                item.id === id ? updater(item) : item
              ),
            }
          : flow
      )
    )
  }

  const updateAndPersistItem = (
    id: string,
    updater: (item: FlowStep) => FlowStep
  ) => {
    void persistItems(
      items.map(item => (item.id === id ? updater(item) : item))
    )
  }

  const openCreateDialog = () => {
    setFlowNameDraft(`流程 ${flows.length + 1}`)
    setNameDialogMode('create')
  }

  const openRenameDialog = () => {
    if (!activeFlow) return
    setFlowNameDraft(activeFlow.name)
    setNameDialogMode('rename')
  }

  const submitFlowName = () => {
    const name = flowNameDraft.trim()
    if (!name) {
      toast.info('请输入流程名称')
      return
    }
    const duplicate = flows.some(
      flow =>
        flow.name === name &&
        (nameDialogMode === 'create' || flow.id !== activeFlowId)
    )
    if (duplicate) {
      toast.info('流程名称不能重复')
      return
    }

    if (nameDialogMode === 'create') {
      const newFlow: CustomFlow = {
        id: createFlowId(),
        name,
        items: [],
      }
      void persistFlowState([...flows, newFlow], newFlow.id)
    } else if (nameDialogMode === 'rename' && activeFlow) {
      void persistFlowState(
        flows.map(flow =>
          flow.id === activeFlowId ? { ...flow, name } : flow
        ),
        activeFlowId
      )
    }
    setNameDialogMode(null)
  }

  const deleteActiveFlow = () => {
    if (!activeFlow || flows.length <= 1) return
    const nextFlows = flows.filter(flow => flow.id !== activeFlowId)
    void persistFlowState(nextFlows, nextFlows[0].id)
    setDeleteDialogOpen(false)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(item => item.id === String(active.id))
    const newIndex = items.findIndex(item => item.id === String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    void persistItems(arrayMove(items, oldIndex, newIndex))
  }

  const handleRun = async () => {
    if (!sessionId || rpcState !== 'open') return
    if (!hasRunnableItems) {
      toast.info('请至少启用并选择一个脚本')
      return
    }
    try {
      const result = await rpcClient.sendRequest<{ task_id?: string }>(
        'task.run',
        {
          session_id: sessionId,
          tool_id: 'nikki.custom_flow',
          input: { flow_id: activeFlowId },
        }
      )
      const taskId = typeof result?.task_id === 'string' ? result.task_id : null
      if (taskId) setRunningTaskId(taskId)
      setIsStopping(false)
      setIsRunning(true)
    } catch {
      toast.error('启动失败')
    }
  }

  const handleStop = async () => {
    if (!runningTaskId) return
    try {
      setIsStopping(true)
      await rpcClient.sendRequest('task.stop', { task_id: runningTaskId })
    } catch {
      setIsStopping(false)
      toast.error('停止失败')
    }
  }

  return (
    <ScrollCenterLayout
      innerClassName="flex flex-1 flex-col min-h-0 gap-4 px-10 py-8"
      scrollOuter={false}
    >
      <SettingsPageLayout
        actions={
          <div className="flex items-center gap-3">
            {saving ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Spinner className="size-4" />
                保存中...
              </div>
            ) : null}
            <Button
              className="rounded-xl bg-pink-400 text-white shadow-sm transition hover:bg-pink-500"
              disabled={
                rpcState !== 'open' ||
                !sessionId ||
                loading ||
                saving ||
                !!loadError ||
                !activeFlow ||
                (runningTaskId ? isStopping : isRunning)
              }
              onClick={runningTaskId ? handleStop : handleRun}
            >
              {runningTaskId
                ? isStopping
                  ? '结束中...'
                  : '停止流程'
                : '开始流程'}
            </Button>
          </div>
        }
        className="flex-1 min-h-0"
        title="自定义流程"
      >
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                流程方案
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                为不同需求保存多套流程，并选择当前要编辑和执行的方案。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                disabled={loading || !!loadError || flows.length === 0}
                onValueChange={flowId => void persistFlowState(flows, flowId)}
                value={activeFlowId}
              >
                <SelectTrigger className="w-[13rem] rounded-xl">
                  <SelectValue placeholder="选择流程" />
                </SelectTrigger>
                <SelectContent>
                  {flows.map(flow => (
                    <SelectItem key={flow.id} value={flow.id}>
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="rounded-xl"
                disabled={loading || !!loadError}
                onClick={openCreateDialog}
                type="button"
                variant="outline"
              >
                新建
              </Button>
              <Button
                className="rounded-xl"
                disabled={loading || !!loadError || !activeFlow}
                onClick={openRenameDialog}
                type="button"
                variant="outline"
              >
                重命名
              </Button>
              <Button
                className="rounded-xl text-red-500 hover:text-red-600"
                disabled={
                  loading || !!loadError || !activeFlow || flows.length <= 1
                }
                onClick={() => setDeleteDialogOpen(true)}
                type="button"
                variant="outline"
              >
                删除
              </Button>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  流程步骤
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  已启用的跑图脚本和宏脚本将从上到下依次执行。
                </p>
              </div>
              <Button
                className="rounded-xl"
                disabled={loading || !!loadError || !activeFlow}
                onClick={() =>
                  void persistItems([
                    ...items,
                    {
                      id: createStepId(),
                      enabled: true,
                      type: 'path',
                      script_name: '',
                    },
                  ])
                }
                type="button"
                variant="outline"
              >
                新增步骤
              </Button>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Spinner className="size-4" />
                  正在读取自定义流程...
                </div>
              ) : loadError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {loadError}
                </div>
              ) : items.length === 0 ? (
                <div className="text-sm text-slate-400">
                  暂无步骤，请点击“新增步骤”开始配置。
                </div>
              ) : (
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  sensors={sensors}
                >
                  <SortableContext
                    items={itemIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {items.map(step => (
                        <SortableFlowStep
                          key={step.id}
                          macroScripts={macroScripts}
                          onChangeType={type =>
                            updateAndPersistItem(step.id, item => ({
                              ...item,
                              type,
                              script_name: '',
                            }))
                          }
                          onCommitScriptName={scriptName =>
                            updateAndPersistItem(step.id, item => ({
                              ...item,
                              script_name: scriptName.trim(),
                            }))
                          }
                          onLocalScriptNameChange={scriptName =>
                            updateItemLocal(step.id, item => ({
                              ...item,
                              script_name: scriptName,
                            }))
                          }
                          onRemove={() =>
                            void persistItems(
                              items.filter(item => item.id !== step.id)
                            )
                          }
                          onToggle={enabled =>
                            updateAndPersistItem(step.id, item => ({
                              ...item,
                              enabled,
                            }))
                          }
                          pathScripts={pathScripts}
                          step={step}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </section>
      </SettingsPageLayout>

      <Dialog
        onOpenChange={open => !open && setNameDialogMode(null)}
        open={nameDialogMode !== null}
      >
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              submitFlowName()
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {nameDialogMode === 'create' ? '新建流程' : '重命名流程'}
              </DialogTitle>
              <DialogDescription>
                输入一个便于识别的流程名称。
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              maxLength={40}
              onChange={event => setFlowNameDraft(event.target.value)}
              placeholder="流程名称"
              value={flowNameDraft}
            />
            <DialogFooter>
              <Button
                onClick={() => setNameDialogMode(null)}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button type="submit">
                {nameDialogMode === 'create' ? '新建' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除流程？</DialogTitle>
            <DialogDescription>
              将删除“{activeFlow?.name ?? ''}”及其中的全部步骤，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={deleteActiveFlow}
              type="button"
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollCenterLayout>
  )
}
