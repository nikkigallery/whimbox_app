import { Bot } from "lucide-react"
import type { SettingSection, SettingContent } from "./types"

export const section: SettingSection = {
  id: "agent",
  label: "Agent",
  icon: Bot,
}

export const content: SettingContent = {
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
}
