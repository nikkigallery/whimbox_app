import { ScriptSelectPage } from "renderer/pages/script-select-page"

type AutoNavigatePageProps = {
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

export function AutoNavigatePage({ sessionId, rpcState }: AutoNavigatePageProps) {
  return <ScriptSelectPage mode="path" sessionId={sessionId} rpcState={rpcState} />
}
