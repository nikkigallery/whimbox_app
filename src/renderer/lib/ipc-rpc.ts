import type { RpcError, RpcNotification, RpcState } from 'shared/rpc-types'
import log from 'electron-log/renderer'

type RpcResponse = {
  id: number
  result?: unknown
  error?: RpcError
}

type RpcListenerMap = {
  state: { state: RpcState }
  notification: RpcNotification
  response: RpcResponse
  error: { message: string; error?: unknown }
}

type ListenerKey = keyof RpcListenerMap
type Listener<T> = (payload: T) => void

export class IpcRpcClient {
  private state: RpcState = 'idle'
  private listeners = new Map<ListenerKey, Set<Listener<unknown>>>()
  private unsubscribes: (() => void)[] = []
  private destroyed = false

  constructor() {
    const rpc = window.App.rpc
    this.unsubscribes.push(
      rpc.onState((payload) => {
        if (this.destroyed) return
        this.state = payload.state
        this.emit('state', payload)
      }),
    )
    this.unsubscribes.push(
      rpc.onNotification((payload) => {
        if (this.destroyed) return
        this.emit('notification', payload)
      }),
    )
    this.unsubscribes.push(
      rpc.onResponse((payload) => {
        if (this.destroyed) return
        this.emit('response', payload as RpcResponse)
      }),
    )
    this.unsubscribes.push(
      rpc.onError((payload) => {
        if (this.destroyed) return
        this.emit('error', payload)
      }),
    )
    const getStatePromise = rpc.getState()
    void getStatePromise
      .then((state) => {
        if (this.destroyed) return
        this.state = state
        this.emit('state', { state })
      })
      .catch((err) => {
        log.warn('IPC RPC getState() rejected:', err)
      })
  }

  /** 移除所有 IPC 监听，避免 MaxListenersExceededWarning。组件卸载时调用。 */
  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    for (const off of this.unsubscribes) off()
    this.unsubscribes.length = 0
    this.listeners.clear()
  }

  getState() {
    return this.state
  }

  /** 从主进程拉取当前状态（用于挂载后同步一次，避免漏掉「open」广播） */
  getStateAsync(): Promise<RpcState> {
    return window.App.rpc.getState().then((state) => {
      if (!this.destroyed) this.state = state
      return state
    })
  }

  on<K extends ListenerKey>(
    event: K,
    listener: Listener<RpcListenerMap[K]>,
  ) {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener as Listener<unknown>)
    this.listeners.set(event, set)
    return () => this.off(event, listener)
  }

  off<K extends ListenerKey>(
    event: K,
    listener: Listener<RpcListenerMap[K]>,
  ) {
    const set = this.listeners.get(event)
    set?.delete(listener as Listener<unknown>)
  }

  sendRequest<T = unknown>(method: string, params?: Record<string, unknown>) {
    return window.App.rpc.request(method, params) as Promise<T>
  }

  sendStreamingRequest<T = unknown>(
    method: string,
    params: Record<string, unknown> | undefined,
    onStreamEvent: (n: RpcNotification) => void,
  ): Promise<T> {
    return window.App.rpc.requestStream(method, params, onStreamEvent) as Promise<T>
  }

  sendNotification(method: string, params?: Record<string, unknown>) {
    window.App.rpc.notify(method, params)
  }

  private emit<K extends ListenerKey>(event: K, payload: RpcListenerMap[K]) {
    if (this.destroyed) return
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return
    for (const listener of set) {
      ;(listener as Listener<RpcListenerMap[K]>)(payload)
    }
  }
}
