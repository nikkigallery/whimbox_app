import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "renderer/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-pink-400 text-white hover:bg-pink-500",
        destructive: "bg-pink-500 text-white hover:bg-pink-600",
        outline:
          "border border-pink-200 text-pink-500 hover:bg-pink-50 dark:border-pink-500/40 dark:text-pink-300 dark:hover:bg-pink-500/15",
        secondary:
          "bg-pink-50 text-pink-600 hover:bg-pink-100 dark:bg-pink-500/15 dark:text-pink-200 dark:hover:bg-pink-500/20",
        ghost:
          "text-pink-500 hover:bg-pink-50 dark:text-pink-300 dark:hover:bg-pink-500/15",
        link: "text-pink-500 underline-offset-4 hover:underline dark:text-pink-300",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
