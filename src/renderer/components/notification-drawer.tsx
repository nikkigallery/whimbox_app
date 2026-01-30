import { Bell } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "renderer/components/ui/sheet"

export type NotificationItem = {
  title: string
  url?: string
  created_at: string
}

type NotificationDrawerProps = {
  items: NotificationItem[]
  onOpenExternal: (url: string) => void
  hasUnread?: boolean
  onOpenChange?: (open: boolean) => void
}

const formatDate = (value: string) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("zh-CN")
}

export function NotificationDrawer({
  items,
  onOpenExternal,
  hasUnread = false,
  onOpenChange,
}: NotificationDrawerProps) {
  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Bell className="size-3" />
          通知
          {hasUnread ? (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-red-500" />
          ) : null}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] sm:w-[420px]">
        <SheetHeader>
          <SheetTitle>通知 / 公告</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">暂无公告</p>
          ) : (
            items.map((item) => (
              <button
                key={`${item.title}-${item.created_at}`}
                type="button"
                onClick={() => item.url && onOpenExternal(item.url)}
                className="cursor-pointer flex w-full flex-col gap-1 rounded-xl border border-slate-100 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70"
              >
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  {item.title}
                </span>
                <span className="text-xs text-slate-400 text-right">
                  {formatDate(item.created_at)}
                </span>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
