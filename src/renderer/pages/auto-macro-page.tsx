import { ScriptSelectPage } from "renderer/pages/script-select-page"

type AutoMacroPageProps = {
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

export function AutoMacroPage({ sessionId, rpcState }: AutoMacroPageProps) {
  return <ScriptSelectPage mode="macro" sessionId={sessionId} rpcState={rpcState} />
}
