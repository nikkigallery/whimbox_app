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
