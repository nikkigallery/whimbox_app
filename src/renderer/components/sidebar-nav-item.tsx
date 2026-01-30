import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "renderer/lib/utils"

type SidebarNavItemProps = {
  label: string
  icon?: LucideIcon
  description?: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
}

export function SidebarNavItem({
  label,
  icon: Icon,
  description,
  active = false,
  onClick,
  className,
}: SidebarNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition",
        active
          ? "bg-pink-50 text-pink-500 dark:bg-pink-500/15 dark:text-pink-300"
          : "text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60",
        className
      )}
    >
      {Icon ? <Icon className="size-4" /> : null}
      <div className={cn("text-left", description ? "space-y-0.5" : "")}>
        <div>{label}</div>
        {description ? (
          <div className="text-xs text-slate-400">{description}</div>
        ) : null}
      </div>
    </button>
  )
}
