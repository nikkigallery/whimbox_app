import type { IpcRpcClient } from "renderer/lib/ipc-rpc"
import { ScriptSelectPage } from "renderer/pages/script-select-page"

type AutoMusicPageProps = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

export function AutoMusicPage({ rpcClient, sessionId, rpcState }: AutoMusicPageProps) {
  return <ScriptSelectPage mode="music" rpcClient={rpcClient} sessionId={sessionId} rpcState={rpcState} />
}
