import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "renderer/components/ui/sheet"

const ANNOUNCEMENTS_SEEN_KEY = "whimbox_announcements_hash_seen"

export type NotificationItem = {
  title: string
  url?: string
  created_at: string
}

type NotificationDrawerProps = {}

const formatDate = (value: string) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("zh-CN")
}

export function NotificationDrawer({}: NotificationDrawerProps) {
  const launcherApi = useMemo(() => window.App.launcher, [])
  const [items, setItems] = useState<NotificationItem[]>([])
  const [announcementsHash, setAnnouncementsHash] = useState<string>("")
  const [hasUnread, setHasUnread] = useState(false)

  const loadAnnouncements = useCallback(async () => {
    try {
      const result = await launcherApi.getAnnouncements()
      const list = (result.announcements ?? []) as NotificationItem[]
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      setItems(list.slice(0, 5))
      if (result.hash) {
        setAnnouncementsHash(result.hash)
        const seenHash = localStorage.getItem(ANNOUNCEMENTS_SEEN_KEY)
        setHasUnread(result.hash !== seenHash)
      } else {
        setAnnouncementsHash("")
        setHasUnread(false)
      }
    } catch {
      setItems([])
      setAnnouncementsHash("")
      setHasUnread(false)
    }
  }, [launcherApi])

  const markAnnouncementsSeen = useCallback(() => {
    if (!announcementsHash) return
    localStorage.setItem(ANNOUNCEMENTS_SEEN_KEY, announcementsHash)
    setHasUnread(false)
  }, [announcementsHash])

  useEffect(() => {
    loadAnnouncements()
  }, [loadAnnouncements])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) markAnnouncementsSeen()
    },
    [markAnnouncementsSeen],
  )

  return (
    <Sheet onOpenChange={handleOpenChange}>
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
      <SheetContent side="right" className="w-[360px] sm:w-[420px]" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>通知 / 公告</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">暂无公告</p>
          ) : (
            items.map((item: NotificationItem) => (
              <button
                key={`${item.title}-${item.created_at}`}
                type="button"
                onClick={() => item.url && launcherApi.openExternal(item.url)}
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
