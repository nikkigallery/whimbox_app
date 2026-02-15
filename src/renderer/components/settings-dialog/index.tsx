import { useEffect, useMemo, useState } from "react"
import { Settings } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "renderer/components/ui/dialog"
import { SidebarNavItem } from "renderer/components/sidebar-nav-item"
import { cn } from "renderer/lib/utils"

import type { SettingsDialogProps, SettingItem } from "./types"
import * as whimboxSettings from "./whimbox-settings"
import * as agentSettings from "./agent-settings"
import * as shortcutsSettings from "./shortcuts-settings"

const settingSections = [
  whimboxSettings.section,
  agentSettings.section,
  shortcutsSettings.section,
]

const settingsContent: Record<
  string,
  {
    title: string
    description: string
    items?: SettingItem[]
    render?: (
      props: SettingsDialogProps,
      slots: import("./types").SettingContentSlots
    ) => React.ReactNode
  }
> = {
  whimbox: {
    title: whimboxSettings.content.title,
    description: whimboxSettings.content.description,
    render: whimboxSettings.content.render,
  },
  agent: {
    title: agentSettings.content.title,
    description: agentSettings.content.description,
    items: agentSettings.content.items,
    render: agentSettings.content.render,
  },
  shortcuts: {
    title: shortcutsSettings.content.title,
    description: shortcutsSettings.content.description,
    render: shortcutsSettings.content.render,
  },
}

export function SettingsDialog({
  displayVersion,
  updateState,
  isProcessing,
  onCheckUpdate,
  onManualUpdate,
  onSyncScripts,
  rpcClient,
}: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState(settingSections[0]?.id ?? "whimbox")
  const [titleActions, setTitleActions] = useState<React.ReactNode>(null)

  const content = useMemo(
    () =>
      settingsContent[activeSection] ??
      settingsContent[settingSections[0]?.id ?? "whimbox"],
    [activeSection]
  )

  useEffect(() => {
    setTitleActions(null)
  }, [activeSection])

  const dialogProps: SettingsDialogProps = {
    displayVersion,
    updateState,
    isProcessing,
    onCheckUpdate,
    onManualUpdate,
    onSyncScripts,
    rpcClient,
  }

  return (
    <Dialog modal={false}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Settings className="size-3" />
          设置
        </button>
      </DialogTrigger>
      <DialogContent className="flex sm:max-w-4xl h-[80vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 w-full flex-1 gap-6 md:grid-cols-[220px_1fr]">
          <aside className="space-y-2">
            {settingSections.map((section) => (
              <SidebarNavItem
                key={section.id}
                label={section.label}
                icon={section.icon}
                active={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  activeSection === section.id ? "text-pink-600" : ""
                )}
              />
            ))}
          </aside>
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-shrink-0 flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-700 dark:text-slate-100">
                  {content.title}
                </p>
                <p className="text-xs text-slate-400">{content.description}</p>
              </div>
              {titleActions}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pt-4">
              {content.render
                ? content.render(dialogProps, {
                    renderTitleActions: setTitleActions,
                  })
                : (
                    <div className="space-y-3">
                      {content.items?.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div>
                            <p className="font-semibold text-slate-700 dark:text-slate-100">
                              {item.label}
                            </p>
                            <p className="text-xs text-slate-400">{item.description}</p>
                            </div>
                          <span className="text-xs text-slate-500 dark:text-slate-300">
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export type { SettingsDialogProps, UpdateState } from "./types"
