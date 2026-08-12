import { MapPinned, Tv, Wrench } from 'lucide-react'
import { useState } from 'react'

import { cn } from 'renderer/lib/utils'
import { MapMaskPage } from './map-mask-page'
import { VideoOverlayPage } from './video-overlay-page'

const tools = [
  {
    id: 'map-mask',
    name: '地图遮罩',
    icon: MapPinned,
    component: MapMaskPage,
  },
  {
    id: 'video-overlay',
    name: '视频小窗',
    icon: Tv,
    component: VideoOverlayPage,
  },
] as const

type ToolId = (typeof tools)[number]['id']

export function ToolboxPage() {
  const [activeTool, setActiveTool] = useState<ToolId>('map-mask')
  const ActiveTool =
    tools.find(tool => tool.id === activeTool)?.component ?? MapMaskPage

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
        <ActiveTool />
      </section>
    </div>
  )
}
