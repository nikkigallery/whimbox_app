import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { ScriptSelectPage } from "renderer/pages/script-select-page"

type AutoNavigatePageProps = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

export function AutoNavigatePage({ rpcClient, sessionId, rpcState }: AutoNavigatePageProps) {
  return <ScriptSelectPage mode="path" rpcClient={rpcClient} sessionId={sessionId} rpcState={rpcState} />
}
