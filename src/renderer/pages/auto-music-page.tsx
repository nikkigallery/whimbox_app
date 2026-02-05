import { ScriptSelectPage } from "renderer/pages/script-select-page"

type AutoMusicPageProps = {
  sessionId: string | null
  rpcState: "idle" | "connecting" | "open" | "closed" | "error"
}

export function AutoMusicPage({ sessionId, rpcState }: AutoMusicPageProps) {
  return <ScriptSelectPage mode="music" sessionId={sessionId} rpcState={rpcState} />
}
