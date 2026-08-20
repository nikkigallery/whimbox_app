import { MapPinned, Trophy, Tv } from 'lucide-react'
import { useState } from 'react'

import type { IpcRpcClient } from 'renderer/lib/ipc-rpc'
import { cn } from 'renderer/lib/utils'
import { MapMaskPage } from './map-mask-page'
import { MiraCrownPage } from './mira-crown-page'
import { VideoOverlayPage } from './video-overlay-page'

const tools = [
  {
    id: 'map-mask',
    name: '地图遮罩',
    icon: MapPinned,
  },
  {
    id: 'mira-crown',
    name: '巅峰赛',
    icon: Trophy,
  },
  {
    id: 'video-overlay',
    name: '视频小窗',
    icon: Tv,
  },
] as const

type ToolId = (typeof tools)[number]['id']

type ToolboxPageProps = {
  rpcClient: IpcRpcClient
  sessionId: string | null
  rpcState: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
}

export function ToolboxPage({
  rpcClient,
  sessionId,
  rpcState,
}: ToolboxPageProps) {
  const [activeTool, setActiveTool] = useState<ToolId>('map-mask')

  const activeContent = (() => {
    if (activeTool === 'mira-crown') {
      return (
        <MiraCrownPage
          rpcClient={rpcClient}
          sessionId={sessionId}
          rpcState={rpcState}
        />
      )
    }
    if (activeTool === 'video-overlay') return <VideoOverlayPage />
    return <MapMaskPage />
  })()

  return (
    <div className="flex min-h-0 flex-1 bg-slate-50/40 dark:bg-slate-950/20">
      <aside className="flex w-28 shrink-0 flex-col border-r border-slate-100 bg-white/70 px-3 py-6 dark:border-slate-800 dark:bg-slate-900/50">
        <nav className="grid gap-2" aria-label="工具箱功能">
          {tools.map(tool => {
            const Icon = tool.icon
            const selected = activeTool === tool.id

            return (
              <button
                key={tool.id}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => setActiveTool(tool.id)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-xs transition',
                  selected
                    ? 'bg-pink-50 font-medium text-pink-500 shadow-sm dark:bg-pink-500/15 dark:text-pink-300'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200',
                )}
              >
                <Icon className="size-5" />
                <span>{tool.name}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeContent}
      </section>
    </div>
  )
}
