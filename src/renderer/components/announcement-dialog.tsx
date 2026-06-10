import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'renderer/components/ui/dialog'
import { Button } from 'renderer/components/ui/button'

const ANNOUNCEMENTS_SEEN_KEY = 'whimbox_announcements_hash_seen'

type AnnouncementItem = {
  title: string
  url?: string
  created_at: string
}

const formatDate = (value: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN')
}

export function AnnouncementDialog() {
  const launcherApi = useMemo(() => window.App.launcher, [])
  const [open, setOpen] = useState(false)
  const [announcement, setAnnouncement] = useState<AnnouncementItem | null>(null)
  const [announcementsHash, setAnnouncementsHash] = useState('')

  const markSeen = useCallback(() => {
    if (!announcementsHash) return
    localStorage.setItem(ANNOUNCEMENTS_SEEN_KEY, announcementsHash)
  }, [announcementsHash])

  const handleClose = useCallback(() => {
    markSeen()
    setOpen(false)
  }, [markSeen])

  const handleOpenExternal = useCallback(() => {
    if (announcement?.url) {
      launcherApi.openExternal(announcement.url)
    }
    handleClose()
  }, [announcement?.url, handleClose, launcherApi])

  useEffect(() => {
    let disposed = false

    launcherApi
      .getAnnouncements()
      .then((result) => {
        if (disposed) return
        const list = [...(result.announcements ?? [])] as AnnouncementItem[]
        list.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        const latest = list[0]
        const hash = result.hash ?? ''
        const seenHash = localStorage.getItem(ANNOUNCEMENTS_SEEN_KEY)

        if (!latest || !hash || hash === seenHash) return
        setAnnouncement(latest)
        setAnnouncementsHash(hash)
        setOpen(true)
      })
      .catch(() => {})

    return () => {
      disposed = true
    }
  }, [launcherApi])

  if (!announcement) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>更新公告</DialogTitle>
          <DialogDescription>
            {formatDate(announcement.created_at)}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
          {announcement.title}
        </div>
        <DialogFooter showCloseButton={false}>
          <Button variant="outline" size="sm" onClick={handleClose}>
            我知道了
          </Button>
          {announcement.url ? (
            <Button size="sm" onClick={handleOpenExternal}>
              查看详情
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
