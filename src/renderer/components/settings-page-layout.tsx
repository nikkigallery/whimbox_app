import type { ReactNode } from "react"
import { cn } from "renderer/lib/utils"

type SettingsPageLayoutProps = {
  /** 标题，如「一条龙配置」 */
  title?: ReactNode
  /** 标题下方的描述文案，可选 */
  description?: ReactNode
  /** 标题行右侧的按钮区域，如保存、运行等 */
  actions?: ReactNode
  /** 设置项具体内容 */
  children: ReactNode
  className?: string
  /** 内容区是否可滚动（嵌入弹窗时由外层控制则用 false） */
  scrollable?: boolean
}

export function SettingsPageLayout({
  title,
  description,
  actions,
  children,
  className,
  scrollable = true,
}: SettingsPageLayoutProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {(title != null || actions != null) && (
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3">
          <div>
            {title != null && (
              <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                {title}
              </h1>
            )}
            {description != null && (
              <p className="mt-1 text-xs text-slate-400">{description}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      <div
        className={cn(
          "flex flex-col gap-4",
          scrollable && "min-h-0 min-w-0 flex-1 overflow-y-auto"
        )}
      >
        {children}
      </div>
    </div>
  )
}
