import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "renderer/lib/utils"

function Checkbox({
  className,
  tone = "pink",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  tone?: "default" | "pink"
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-tone={tone}
      className={cn(
        "peer border-input dark:bg-input/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        tone === "pink"
          ? "data-[state=checked]:bg-pink-400 data-[state=checked]:text-white data-[state=checked]:border-pink-400 dark:data-[state=checked]:bg-pink-400 dark:data-[state=checked]:border-pink-400 focus-visible:border-pink-400 focus-visible:ring-pink-200/70"
          : "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary dark:data-[state=checked]:bg-primary focus-visible:border-ring focus-visible:ring-ring/50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
