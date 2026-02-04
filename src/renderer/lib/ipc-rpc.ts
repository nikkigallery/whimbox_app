import type { RpcError, RpcNotification, RpcState } from 'shared/rpc-types'

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

  constructor() {
    const rpc = window.App.rpc
    rpc.onState((payload) => {
      this.state = payload.state
      this.emit('state', payload)
    })
    rpc.onNotification((payload) => {
      this.emit('notification', payload)
    })
    rpc.onResponse((payload) => {
      this.emit('response', payload as RpcResponse)
    })
    rpc.onError((payload) => {
      this.emit('error', payload)
    })
    void rpc
      .getState()
      .then((state) => {
        this.state = state
        this.emit('state', { state })
      })
      .catch(() => {})
  }

  getState() {
    return this.state
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

  sendNotification(method: string, params?: Record<string, unknown>) {
    window.App.rpc.notify(method, params)
  }

  private emit<K extends ListenerKey>(event: K, payload: RpcListenerMap[K]) {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return
    for (const listener of set) {
      ;(listener as Listener<RpcListenerMap[K]>)(payload)
    }
  }
}
