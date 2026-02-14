import type { LucideIcon } from "lucide-react"
import type { IpcRpcClient } from "renderer/lib/ipc-rpc"

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
  /** 用于从 Python 后端拉取/保存配置（如 Agent 大模型设置） */
  rpcClient?: IpcRpcClient | null
}

export type SettingContentSlots = {
  /** 将节点渲染到本页标题同一行右侧（如保存按钮） */
  renderTitleActions: (node: React.ReactNode) => void
}

export type SettingContent = {
  title: string
  description: string
  items?: SettingItem[]
  /** 若使用 slots.renderTitleActions，则对应节点会出现在标题行右侧 */
  render?: (
    props: SettingsDialogProps,
    slots?: SettingContentSlots
  ) => React.ReactNode
}
