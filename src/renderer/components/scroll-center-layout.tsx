import type { PropsWithChildren } from "react"

import { cn } from "renderer/lib/utils"

type ScrollCenterLayoutProps = PropsWithChildren<{
  className?: string
  innerClassName?: string
}>

export function ScrollCenterLayout({
  children,
  className,
  innerClassName,
}: ScrollCenterLayoutProps) {
  return (
    <div
      className={cn(
        "flex flex-1 overflow-y-auto [scrollbar-gutter:stable]",
        className,
      )}
    >
      <div className={cn("w-full max-w-4xl mx-auto", innerClassName)}>
        {children}
      </div>
    </div>
  )
}
