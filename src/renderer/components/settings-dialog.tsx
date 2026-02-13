import { useMemo, useState } from "react"
import { Bot, Keyboard, Palette, Settings } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "renderer/components/ui/dialog"
import { Button } from "renderer/components/ui/button"
import { SidebarNavItem } from "renderer/components/sidebar-nav-item"
import { ThemeToggle } from "renderer/components/theme-provider"
import { cn } from "renderer/lib/utils"
import { APP_RELEASE_PAGE_URL } from "shared/constants"

type SettingSection = {
  id: string
  label: string
  icon: typeof Settings
}

type SettingItem = {
  label: string
  description: string
  value: string
}

type UpdateState = {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "installing"
    | "up-to-date"
    | "error"
  message: string
  transferred?: number
  total?: number
}

type SettingsDialogProps = {
  /** 与主界面一致：前后端版本号中较大者 */
  displayVersion: string
  updateState: UpdateState
  isProcessing: boolean
  onCheckUpdate: () => void
  onManualUpdate: () => void
  onSyncScripts: () => void
}

const settingSections: SettingSection[] = [
  { id: "whimbox", label: "奇想盒", icon: Settings },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "shortcuts", label: "快捷键", icon: Keyboard },
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
    title: "奇想盒设置",
    description: "奇想盒本身的设置",
    render: ({
      displayVersion,
      updateState,
      isProcessing,
      onCheckUpdate,
      onManualUpdate,
      onSyncScripts,
    }) => (
      <div className="space-y-3">
        <ThemeToggle />
        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-100">脚本</p>
              <p className="text-xs text-slate-400">订阅/导入脚本后看不到？来这里刷新一下</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isProcessing}
                onClick={onSyncScripts}
              >
                刷新脚本
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isProcessing}
                onClick={() => window.App?.launcher?.openScriptsFolder?.()}
              >
                打开脚本目录
              </Button>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-100">日志</p>
              <p className="text-xs text-slate-400">奇想盒运行产生的日志</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => window.App?.launcher?.openLogsFolder?.()}
            >
              打开日志目录
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-100">更新</p>
              <p className="text-xs text-slate-400">如果之前忽略了更新，可以在这里重新检查</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onCheckUpdate}
                disabled={isProcessing || updateState.status === "checking"}
              >
                自动更新
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.App?.launcher?.openExternal(APP_RELEASE_PAGE_URL)}
                disabled={isProcessing}
              >
                手动更新前端
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onManualUpdate}
                disabled={isProcessing}
              >
                手动更新后端
              </Button>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  agent: {
    title: "Agent 设置",
    description: "Agent 行为与输出偏好。",
    items: [
      {
        label: "回复模式",
        description: "控制回复速度与风格。",
        value: "流式输出",
      },
      {
        label: "工具提示",
        description: "显示工具调用过程与摘要。",
        value: "显示",
      },
    ],
  },
  shortcuts: {
    title: "快捷键",
    description: "键位与快捷操作。",
    items: [
      {
        label: "暂停/恢复",
        description: "游戏内控制 Agent。",
        value: "Alt + P",
      },
      {
        label: "打开 Overlay",
        description: "显示游戏内助手面板。",
        value: "Alt + O",
      },
    ],
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
  const [activeSection, setActiveSection] = useState(settingSections[0]?.id ?? "general")
  const content = useMemo(
    () => settingsContent[activeSection] ?? settingsContent.general,
    [activeSection]
  )

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
              ? content.render({
                  displayVersion,
                  updateState,
                  isProcessing,
                  onCheckUpdate,
                  onManualUpdate,
                  onSyncScripts,
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
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
