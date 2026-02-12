import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'renderer/components/ui/dialog'
import { Button } from 'renderer/components/ui/button'

export type UpdatePromptDialogProps = {
  open: boolean
  onClose: () => void
  currentVersion: string
  newVersion: string
  onUpdate: () => void
  onIgnore: () => void
}

export function UpdatePromptDialog({
  open,
  onClose,
  currentVersion,
  newVersion,
  onUpdate,
  onIgnore,
}: UpdatePromptDialogProps) {
  const handleIgnore = () => {
    onIgnore()
    onClose()
  }

  const handleUpdate = () => {
    onUpdate()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>发现新版本</DialogTitle>
          <DialogDescription>
            发现新版本 {newVersion} 可用。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton={false}>
          <Button variant="outline" size="sm" onClick={handleIgnore}>
            忽略该版本
          </Button>
          <Button size="sm" onClick={handleUpdate}>
            立即更新
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
