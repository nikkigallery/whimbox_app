import type { LucideIcon } from "lucide-react"

export type SettingSection = {
  id: string
  label: string
  icon: LucideIcon
}

export type SettingItem = {
  label: string
  description: string
  value: string
}

export type UpdateState = {
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

export type SettingsDialogProps = {
  /** 与主界面一致：前后端版本号中较大者 */
  displayVersion: string
  updateState: UpdateState
  isProcessing: boolean
  onCheckUpdate: () => void
  onManualUpdate: () => void
  onSyncScripts: () => void
}

export type SettingContent = {
  title: string
  description: string
  items?: SettingItem[]
  render?: (props: SettingsDialogProps) => React.ReactNode
}
