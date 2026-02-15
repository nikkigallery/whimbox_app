import type { PropsWithChildren } from "react"

import { cn } from "renderer/lib/utils"

type ScrollCenterLayoutProps = PropsWithChildren<{
  className?: string
  innerClassName?: string
  /** 为 false 时外层不滚动，由内部内容区滚动（如标题固定、仅表单滚动） */
  scrollOuter?: boolean
}>

export function ScrollCenterLayout({
  children,
  className,
  innerClassName,
  scrollOuter = true,
}: ScrollCenterLayoutProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        scrollOuter ? "overflow-y-auto [scrollbar-gutter:stable]" : "overflow-hidden",
        className,
      )}
    >
      <div className={cn("w-full max-w-4xl mx-auto", innerClassName)}>
        {children}
      </div>
    </div>
  )
}
