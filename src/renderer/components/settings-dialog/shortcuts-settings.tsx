import { Keyboard } from "lucide-react"
import type { SettingSection, SettingContent } from "./types"

export const section: SettingSection = {
  id: "shortcuts",
  label: "快捷键",
  icon: Keyboard,
}

export const content: SettingContent = {
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
}
