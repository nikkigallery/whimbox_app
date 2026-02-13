import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { ScriptSelectPage } from "renderer/pages/script-select-page"

type AutoMacroPageProps = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

export function AutoMacroPage({ rpcClient, sessionId, rpcState }: AutoMacroPageProps) {
  return <ScriptSelectPage mode="macro" rpcClient={rpcClient} sessionId={sessionId} rpcState={rpcState} />
}
