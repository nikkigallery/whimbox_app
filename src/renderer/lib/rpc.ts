import { RPC_URL } from 'shared/constants'

export type RpcState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export type RpcError = {
  code: number
  message: string
  data?: unknown
}

export type RpcNotification = {
  method: string
  params?: Record<string, unknown>
}

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

export class RpcClient {
  private url: string
  private ws: WebSocket | null = null
  private state: RpcState = 'idle'
  private listeners = new Map<ListenerKey, Set<Listener<unknown>>>()
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: unknown) => void
    }
  >()
  private requestId = 1

  constructor(url: string = RPC_URL) {
    this.url = url
  }

  getState() {
    return this.state
  }

  connect() {
    if (this.state === 'open' || this.state === 'connecting') return
    this.setState('connecting')
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.setState('open')
    }
    ws.onclose = () => {
      this.setState('closed')
      this.cleanupPending(new Error('RPC connection closed'))
    }
    ws.onerror = () => {
      this.setState('error')
      this.emit('error', { message: 'RPC connection error' })
    }
    ws.onmessage = (event) => {
      this.handleMessage(event.data)
    }
  }

  disconnect() {
    if (!this.ws) return
    this.ws.close()
    this.ws = null
    this.setState('closed')
    this.cleanupPending(new Error('RPC connection closed'))
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
    if (!this.ws || this.state !== 'open') {
      return Promise.reject(new Error('RPC not connected'))
    }
    const id = this.requestId++
    const payload = { jsonrpc: '2.0', id, method, params: params ?? {} }
    const message = JSON.stringify(payload)
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this.ws?.send(message)
    })
  }

  sendNotification(method: string, params?: Record<string, unknown>) {
    if (!this.ws || this.state !== 'open') return
    const payload = { jsonrpc: '2.0', method, params: params ?? {} }
    this.ws.send(JSON.stringify(payload))
  }

  private handleMessage(data: unknown) {
    const text = typeof data === 'string' ? data : ''
    if (!text) return
    let payload: RpcResponse | RpcNotification | null = null
    try {
      payload = JSON.parse(text) as RpcResponse | RpcNotification
    } catch {
      this.emit('error', { message: 'RPC message parse error', error: text })
      return
    }

    if (!payload || typeof payload !== 'object') return

    if ('id' in payload && typeof payload.id === 'number') {
      const pending = this.pending.get(payload.id)
      if (!pending) return
      this.pending.delete(payload.id)
      if ('error' in payload && payload.error) {
        pending.reject(payload.error)
        this.emit('response', { id: payload.id, error: payload.error })
        return
      }
      pending.resolve('result' in payload ? payload.result : undefined)
      this.emit('response', { id: payload.id, result: payload.result })
      return
    }

    if ('method' in payload && payload.method) {
      this.emit('notification', {
        method: payload.method,
        params: 'params' in payload ? payload.params : undefined,
      })
    }
  }

  private setState(state: RpcState) {
    if (this.state === state) return
    this.state = state
    this.emit('state', { state })
  }

  private cleanupPending(error: Error) {
    if (this.pending.size === 0) return
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }

  private emit<K extends ListenerKey>(event: K, payload: RpcListenerMap[K]) {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return
    for (const listener of set) {
      ;(listener as Listener<RpcListenerMap[K]>)(payload)
    }
  }
}
