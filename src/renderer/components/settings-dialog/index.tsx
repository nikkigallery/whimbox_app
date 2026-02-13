import { useMemo, useState } from "react"
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
    render?: (props: SettingsDialogProps) => React.ReactNode
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
  },
  shortcuts: {
    title: shortcutsSettings.content.title,
    description: shortcutsSettings.content.description,
    items: shortcutsSettings.content.items,
  },
}

export function SettingsDialog({
  displayVersion,
  updateState,
  isProcessing,
  onCheckUpdate,
  onManualUpdate,
  onSyncScripts,
}: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState(settingSections[0]?.id ?? "whimbox")
  const content = useMemo(
    () =>
      settingsContent[activeSection] ??
      settingsContent[settingSections[0]?.id ?? "whimbox"],
    [activeSection]
  )
  const dialogProps = {
    displayVersion,
    updateState,
    isProcessing,
    onCheckUpdate,
    onManualUpdate,
    onSyncScripts,
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Settings className="size-3" />
          设置
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl h-[80vh] content-start items-start" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
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
          <section className="space-y-4">
            <div>
              <p className="text-base font-semibold text-slate-700 dark:text-slate-100">
                {content.title}
              </p>
              <p className="text-xs text-slate-400">{content.description}</p>
            </div>
            {content.render
              ? content.render(dialogProps)
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
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export type { SettingsDialogProps, UpdateState } from "./types"
